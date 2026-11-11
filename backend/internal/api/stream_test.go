package api

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"fms/internal/fleet"
)

// streamTest is a running server, the store behind it, and a connected client.
type streamTest struct {
	store  *fleet.Store
	server *httptest.Server
	conn   *websocket.Conn
}

func startStream(t *testing.T) *streamTest {
	t.Helper()

	clock := time.Date(2026, 11, 11, 14, 23, 12, 0, time.UTC)
	sites := []fleet.Site{{ID: "hotel", Name: "Hotel", Floors: []string{"F1"}}}
	units := []fleet.Unit{
		{ID: "A", SiteID: "hotel", State: fleet.StateActive, Battery: 80},
		{ID: "B", SiteID: "hotel", State: fleet.StateIdle, Battery: 60},
	}
	alarms := []fleet.Alarm{{Seq: 1, SiteID: "hotel", Severity: fleet.Sev1}}

	store := fleet.NewStore(func() time.Time { return clock }, sites, units, alarms)
	server := httptest.NewServer(
		New(store, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, nil),
	)
	t.Cleanup(server.Close)

	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/stream"
	conn, _, err := websocket.Dial(testContext(t), url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })

	return &streamTest{store: store, server: server, conn: conn}
}

func testContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	return ctx
}

// frame is a decoded server frame, kept loose so one helper reads all five kinds.
type frame struct {
	Type          string               `json:"type"`
	Version       int64                `json:"version"`
	Units         []fleet.Unit         `json:"units"`
	Alarms        []fleet.Alarm        `json:"alarms"`
	FacilityStops []fleet.FacilityStop `json:"facilityStops"`
	UnitStops     []string             `json:"unitStops"`
	Raw           map[string]any       `json:"-"`
}

func (s *streamTest) read(t *testing.T) frame {
	t.Helper()
	ctx, cancel := context.WithTimeout(testContext(t), 3*time.Second)
	defer cancel()

	_, data, err := s.conn.Read(ctx)
	if err != nil {
		t.Fatalf("read frame: %v", err)
	}

	var decoded frame
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("decode frame %s: %v", data, err)
	}
	if err := json.Unmarshal(data, &decoded.Raw); err != nil {
		t.Fatalf("decode frame as object %s: %v", data, err)
	}
	return decoded
}

// A client is handed the fleet before it is handed any change.
//
// Prevents the one ordering that cannot be recovered from. Deltas are only meaningful
// against a snapshot, so a connection that delivered a change first would leave the client
// with a version it cannot reconcile and no way to tell that from packet loss.
func TestStreamOpensWithASnapshot(t *testing.T) {
	s := startStream(t)

	first := s.read(t)
	if first.Type != "snapshot" {
		t.Fatalf("first frame was %q, want snapshot", first.Type)
	}
	if len(first.Units) != 2 {
		t.Errorf("snapshot carried %d units, want 2", len(first.Units))
	}
	if len(first.Alarms) != 1 {
		t.Errorf("snapshot carried %d alarms, want 1", len(first.Alarms))
	}
	// The snapshot is the whole state, so the lists a delta would omit are present here.
	for _, key := range []string{"units", "alarms", "facilityStops", "unitStops", "version"} {
		if _, ok := first.Raw[key]; !ok {
			t.Errorf("snapshot frame has no %q", key)
		}
	}
}

// Every published change reaches the socket, in order, one version apart.
//
// Prevents the gap detector being fed numbers it cannot use. The client treats
// `version > local + 1` as a missed frame; if the wire ever skipped or reordered, a healthy
// connection would resynchronise forever.
func TestStreamDeliversChangesInOrder(t *testing.T) {
	s := startStream(t)
	opening := s.read(t)

	s.store.ApplyTelemetry([]fleet.Unit{{ID: "A", SiteID: "hotel", State: fleet.StateActive, Battery: 70}})
	if err := s.store.SendCommand("A", fleet.CommandStop); err != nil {
		t.Fatalf("stop: %v", err)
	}
	s.store.Acknowledge([]int64{1}, "you")

	want := []string{"units", "commands", "alarms"}
	for i, kind := range want {
		got := s.read(t)
		if got.Type != kind {
			t.Fatalf("frame %d was %q, want %q", i, got.Type, kind)
		}
		if expected := opening.Version + int64(i) + 1; got.Version != expected {
			t.Fatalf("frame %d version %d, want %d", i, got.Version, expected)
		}
	}
}

// Prevents a delta that omits what the client needs to apply it. A units frame without its
// units, or a commands frame without both stop lists, is a frame the client has to guess at.
func TestStreamDeltasCarryTheirPayload(t *testing.T) {
	s := startStream(t)
	s.read(t)

	s.store.ApplyTelemetry([]fleet.Unit{{ID: "B", SiteID: "hotel", State: fleet.StateActive}})
	units := s.read(t)
	if len(units.Units) != 1 || units.Units[0].ID != "B" {
		t.Errorf("units frame carried %v, want just B", units.Units)
	}

	if err := s.store.SetEmergencyStop("hotel", true); err != nil {
		t.Fatalf("e-stop: %v", err)
	}
	commands := s.read(t)
	// Both lists, always: given one without the other, a client cannot tell which it is
	// missing.
	for _, key := range []string{"facilityStops", "unitStops"} {
		value, present := commands.Raw[key]
		if !present || value == nil {
			t.Errorf("commands frame %q was %v, want a list", key, value)
		}
	}
	if len(commands.FacilityStops) != 1 {
		t.Errorf("facility stops %v, want one", commands.FacilityStops)
	}
}

// A client that missed a frame can ask for the whole fleet again.
//
// Prevents a dropped frame being permanent. Frames are dropped for a slow subscriber by
// design, so the repair path is the other half of that decision — without it the screen
// stays wrong until the operator reloads.
func TestStreamAnswersResync(t *testing.T) {
	s := startStream(t)
	s.read(t)

	s.store.ApplyTelemetry([]fleet.Unit{{ID: "A", SiteID: "hotel", State: fleet.StateIdle}})
	s.read(t)

	if err := wsjson.Write(testContext(t), s.conn, map[string]string{"type": "resync"}); err != nil {
		t.Fatalf("send resync: %v", err)
	}

	again := s.read(t)
	if again.Type != "snapshot" {
		t.Fatalf("answered a resync with %q, want snapshot", again.Type)
	}
	if len(again.Units) != 2 {
		t.Errorf("resync snapshot carried %d units, want the whole fleet", len(again.Units))
	}
}

// Prevents a frame the server does not recognise killing the connection. The contract says
// unknown frames are ignored, which is what lets a client add one without a server release.
func TestStreamIgnoresUnknownClientFrames(t *testing.T) {
	s := startStream(t)
	s.read(t)

	if err := wsjson.Write(testContext(t), s.conn, map[string]string{"type": "nonsense"}); err != nil {
		t.Fatalf("send unknown frame: %v", err)
	}
	if err := wsjson.Write(testContext(t), s.conn, map[string]string{"type": "resync"}); err != nil {
		t.Fatalf("send resync: %v", err)
	}

	if got := s.read(t); got.Type != "snapshot" {
		t.Fatalf("connection answered %q after an unknown frame, want snapshot", got.Type)
	}
}

// The handler returns when the client goes away.
//
// Prevents the leak that only shows up in a long shift. The reader goroutine is what
// notices a vanished browser tab; without it the handler blocks on a select that nothing
// will ever wake, holding a goroutine and its subscription for the life of the process.
// `httptest.Server.Close` waits for handlers to return, so a stuck one hangs this test
// rather than passing quietly. That the subscription itself is then released is pinned by
// `TestUnsubscribeReleasesTheSubscriber` in the fleet package.
func TestStreamHandlerReturnsOnDisconnect(t *testing.T) {
	s := startStream(t)
	s.read(t)

	if err := s.conn.Close(websocket.StatusNormalClosure, "done"); err != nil {
		t.Fatalf("close: %v", err)
	}

	closed := make(chan struct{})
	go func() {
		s.server.Close()
		close(closed)
	}()

	select {
	case <-closed:
	case <-time.After(5 * time.Second):
		t.Fatal("the stream handler never returned after the client disconnected")
	}
}

// Prevents the origin check being switched off by accident. A browser on another site must
// not be able to open a socket onto an operator's fleet.
func TestStreamRejectsAForeignOrigin(t *testing.T) {
	store := fleet.NewStore(time.Now, nil, nil, nil)
	server := httptest.NewServer(
		New(store, slog.New(slog.NewTextHandler(io.Discard, nil)), []string{"console.example"}, nil),
	)
	defer server.Close()

	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/stream"
	conn, _, err := websocket.Dial(testContext(t), url, &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"https://evil.example"}},
	})
	if err == nil {
		_ = conn.CloseNow()
		t.Fatal("a foreign origin was allowed to open the stream")
	}
}
