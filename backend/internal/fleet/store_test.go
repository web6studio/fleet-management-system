package fleet

import (
	"errors"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"
)

func ptr[T any](v T) *T { return &v }

func testStore() *Store {
	clock := time.Date(2026, 11, 11, 14, 23, 12, 0, time.UTC)
	sites := []Site{{ID: "hotel", Name: "Hotel", Floors: []string{"F1"}}}
	units := []Unit{
		{ID: "A", SiteID: "hotel", State: StateActive, Battery: 80, Task: ptr("Delivery")},
		{ID: "B", SiteID: "hotel", State: StateCharging, Battery: 50, Zone: DockZone},
		{ID: "C", SiteID: "hotel", State: StateOffline, Battery: 40},
		{ID: "D", SiteID: "hotel", State: StateError, Battery: 60},
	}
	alarms := []Alarm{
		{Seq: 1, SiteID: "hotel", Severity: Sev1},
		{Seq: 2, SiteID: "hotel", Severity: Sev2, AcknowledgedBy: ptr("M. Weber")},
	}
	return NewStore(func() time.Time { return clock }, sites, units, alarms)
}

// The version increases by exactly one per published change.
//
// Prevents the bug that would quietly disable the client's only defence against a dropped
// frame. A client treats `version > local + 1` as a gap and asks for a snapshot; if the
// server ever skipped or repeated a number, every client would resynchronise forever or
// never notice a real loss.
func TestVersionIncrementsByOnePerChange(t *testing.T) {
	store := testStore()
	updates, done := store.Subscribe()
	defer done()

	store.ApplyTelemetry([]Unit{{ID: "A", SiteID: "hotel", State: StateActive}})
	store.SendCommand("A", CommandStop)
	store.Acknowledge([]int64{1}, "you")

	for want := int64(1); want <= 3; want++ {
		update := <-updates
		if update.Version != want {
			t.Fatalf("version %d, want %d", update.Version, want)
		}
	}
	if got := store.Snapshot().Version; got != 3 {
		t.Fatalf("snapshot version %d, want 3", got)
	}
}

// A command the fleet cannot carry out is refused with a reason.
//
// Prevents a control that looks like it worked. The browser greys out what it expects to be
// refused, but it does so from a frame that may be a second old. The server has to be the
// authority, and its answer has to say what an operator should do instead.
func TestCommandsAreRefusedWithAReason(t *testing.T) {
	store := testStore()

	cases := []struct {
		name    string
		unit    string
		command Command
		status  int
	}{
		{"unknown unit", "ZZ", CommandStop, http.StatusNotFound},
		{"offline unit", "C", CommandStop, http.StatusConflict},
		{"resume a unit that is not stopped", "A", CommandResume, http.StatusConflict},
		{"start work on a faulted unit", "D", CommandStart, http.StatusConflict},
		{"start work on a unit below the charge floor", "B", CommandStart, http.StatusConflict},
		{"dock a unit already at a dock", "B", CommandDock, http.StatusConflict},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := store.SendCommand(tc.unit, tc.command)

			var refusal *RefusedError
			if !errors.As(err, &refusal) {
				t.Fatalf("got %v, want a refusal", err)
			}
			if refusal.Status != tc.status {
				t.Errorf("status %d, want %d", refusal.Status, tc.status)
			}
			if refusal.Detail == "" {
				t.Error("refused without saying why")
			}
		})
	}
}

func TestStopAndResume(t *testing.T) {
	store := testStore()

	if err := store.SendCommand("A", CommandStop); err != nil {
		t.Fatalf("stop: %v", err)
	}
	if got := store.Snapshot().UnitStops; len(got) != 1 || got[0] != "A" {
		t.Fatalf("unit stops %v, want [A]", got)
	}

	if err := store.SendCommand("A", CommandResume); err != nil {
		t.Fatalf("resume: %v", err)
	}
	if got := store.Snapshot().UnitStops; len(got) != 0 {
		t.Fatalf("unit stops %v, want none", got)
	}
}

// Prevents an emergency stop that forgets when it was ordered. The banner says "since", and
// that is where an operator looks to know how long a floor has been held.
func TestEmergencyStopRecordsWhenItWasOrdered(t *testing.T) {
	store := testStore()

	if err := store.SetEmergencyStop("hotel", true); err != nil {
		t.Fatalf("engage: %v", err)
	}
	stops := store.Snapshot().FacilityStops
	if len(stops) != 1 || stops[0].Since == 0 {
		t.Fatalf("facility stops %v, want one with a timestamp", stops)
	}

	if err := store.SetEmergencyStop("nowhere", true); err == nil {
		t.Error("an unknown facility was accepted")
	}

	if err := store.SetEmergencyStop("hotel", false); err != nil {
		t.Fatalf("release: %v", err)
	}
	if got := store.Snapshot().FacilityStops; len(got) != 0 {
		t.Fatalf("facility stops %v, want none", got)
	}
}

// An acknowledgement never takes an alarm somebody already owns.
//
// Prevents erasing who actually responded. Ownership is the record of that, and a second
// operator arriving late must not be able to overwrite it with their own name.
func TestAcknowledgeIsFirstWriterWins(t *testing.T) {
	store := testStore()

	changed := store.Acknowledge([]int64{1, 2}, "S. Kaya")
	if changed != 1 {
		t.Fatalf("changed %d alarms, want 1", changed)
	}

	alarms := store.Snapshot().Alarms
	if got := alarms[0].AcknowledgedBy; got == nil || *got != "S. Kaya" {
		t.Errorf("alarm 1 owner %v, want S. Kaya", got)
	}
	if got := alarms[1].AcknowledgedBy; got == nil || *got != "M. Weber" {
		t.Errorf("alarm 2 owner %v, want the original owner", got)
	}

	if again := store.Acknowledge([]int64{1}, "someone else"); again != 0 {
		t.Errorf("re-acknowledging changed %d alarms, want 0", again)
	}
}

// A subscriber that cannot keep up loses frames rather than stalling the fleet.
//
// Prevents one wedged browser tab from freezing telemetry for every other operator. Dropping
// is safe only because versions make the loss detectable, which is why the two belong in the
// same test file.
func TestSlowSubscriberDoesNotBlockPublishing(t *testing.T) {
	store := testStore()
	_, done := store.Subscribe() // never read from
	defer done()

	finished := make(chan struct{})
	go func() {
		for range 200 {
			store.ApplyTelemetry([]Unit{{ID: "A", SiteID: "hotel", State: StateActive}})
		}
		close(finished)
	}()

	select {
	case <-finished:
	case <-time.After(2 * time.Second):
		t.Fatal("publishing blocked on a subscriber that stopped reading")
	}
}

// Prevents a dashboard that reloads all shift leaving a subscriber behind each time. The
// store would keep fanning every frame out to channels nobody reads, and nothing about that
// is visible until the box runs out of memory.
func TestUnsubscribeReleasesTheSubscriber(t *testing.T) {
	store := testStore()
	updates, done := store.Subscribe()

	done()
	store.ApplyTelemetry([]Unit{{ID: "A", SiteID: "hotel", State: StateActive}})

	if _, open := <-updates; open {
		t.Error("received an update after unsubscribing")
	}

	store.mu.RLock()
	defer store.mu.RUnlock()
	if n := len(store.subscribers); n != 0 {
		t.Errorf("%d subscribers still registered, want none", n)
	}
}

// Versions reach a subscriber in order, even under concurrent writers.
//
// Prevents a silent, permanent loss. Two goroutines publishing at once could deliver v6
// before v5; the client discards v5 as stale, then applies v7 against v6 without ever
// seeing a gap, so the contents of v5 are gone and nothing on screen says so.
//
// Frames may be dropped here, which is by design; only the order of what arrives is asserted.
func TestUpdatesArriveInVersionOrder(t *testing.T) {
	store := testStore()
	updates, done := store.Subscribe()

	read := make(chan error, 1)
	go func() {
		previous := int64(0)
		for update := range updates {
			if update.Version <= previous {
				read <- fmt.Errorf("version %d arrived after %d", update.Version, previous)
				return
			}
			previous = update.Version
		}
		read <- nil
	}()

	var writers sync.WaitGroup
	for range 8 {
		writers.Add(1)
		go func() {
			defer writers.Done()
			for range 25 {
				store.ApplyTelemetry([]Unit{{ID: "A", SiteID: "hotel", State: StateActive}})
			}
		}()
	}
	writers.Wait()
	done()

	select {
	case err := <-read:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the reader never finished")
	}
}
