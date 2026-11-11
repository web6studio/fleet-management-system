package fleet

import (
	"fmt"
	"maps"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"
)

// UpdateKind names what changed, and maps one-to-one onto a stream frame type.
type UpdateKind string

const (
	UpdateSnapshot UpdateKind = "snapshot"
	UpdateUnits    UpdateKind = "units"
	UpdateAlarms   UpdateKind = "alarms"
	UpdateCommands UpdateKind = "commands"
)

// Update is one published change. Only the fields the kind names are populated.
type Update struct {
	Kind          UpdateKind
	Version       int64
	ServerTime    int64
	Units         []Unit
	Alarms        []Alarm
	FacilityStops []FacilityStop
	UnitStops     []string
}

// RefusedError is a command the fleet will not carry out, with a reason an operator can act
// on. The UI disables controls it expects to be refused, so this reaching a client means the
// unit's state changed between the render and the click.
type RefusedError struct {
	Status int
	Detail string
}

func (e *RefusedError) Error() string { return e.Detail }

func notFound(format string, args ...any) error {
	return &RefusedError{Status: http.StatusNotFound, Detail: fmt.Sprintf(format, args...)}
}

func refused(format string, args ...any) error {
	return &RefusedError{Status: http.StatusConflict, Detail: fmt.Sprintf(format, args...)}
}

// Store holds the current truth about the fleet and publishes every change.
//
// It is the only writer of the version counter, which is what lets a client that missed a
// frame notice the gap and ask for a fresh snapshot.
type Store struct {
	now func() time.Time

	mu            sync.RWMutex
	sites         map[string]Site
	siteOrder     []string
	units         map[string]Unit
	order         []string // units keep their seeded order, so the wire payload is stable
	alarms        []Alarm
	facilityStops map[string]int64
	unitStops     map[string]bool
	version       int64

	subscribers map[chan Update]struct{}
}

func NewStore(now func() time.Time, sites []Site, units []Unit, alarms []Alarm) *Store {
	s := &Store{
		now:           now,
		sites:         make(map[string]Site, len(sites)),
		units:         make(map[string]Unit, len(units)),
		order:         make([]string, 0, len(units)),
		alarms:        slices.Clone(alarms),
		facilityStops: make(map[string]int64),
		unitStops:     make(map[string]bool),
		subscribers:   make(map[chan Update]struct{}),
	}
	for _, site := range sites {
		s.sites[site.ID] = site
		s.siteOrder = append(s.siteOrder, site.ID)
	}
	for _, unit := range units {
		s.units[unit.ID] = unit
		s.order = append(s.order, unit.ID)
	}
	return s
}

func (s *Store) Sites() []Site {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Configured order, not alphabetical: the first facility is the one an operator opens
	// on, and that is a deployment decision rather than an accident of naming.
	out := make([]Site, 0, len(s.siteOrder))
	for _, id := range s.siteOrder {
		out = append(out, s.sites[id])
	}
	return out
}

func (s *Store) Snapshot() Snapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.snapshotLocked()
}

func (s *Store) snapshotLocked() Snapshot {
	units := make([]Unit, 0, len(s.order))
	for _, id := range s.order {
		units = append(units, s.units[id])
	}
	return Snapshot{
		Version:       s.version,
		ServerTime:    s.nowMillis(),
		Units:         units,
		Alarms:        slices.Clone(s.alarms),
		FacilityStops: s.facilityStopsLocked(),
		UnitStops:     s.unitStopsLocked(),
	}
}

// Subscribe returns a channel of updates and the function that closes it.
//
// Sends are non-blocking: a subscriber that cannot keep up loses frames rather than stalling
// the fleet. That is safe precisely because every frame carries a version, so the next one
// it does receive tells it to resynchronise.
func (s *Store) Subscribe() (<-chan Update, func()) {
	ch := make(chan Update, 32)

	s.mu.Lock()
	s.subscribers[ch] = struct{}{}
	s.mu.Unlock()

	return ch, func() {
		s.mu.Lock()
		if _, ok := s.subscribers[ch]; ok {
			delete(s.subscribers, ch)
			close(ch)
		}
		s.mu.Unlock()
	}
}

// ApplyTelemetry records a batch of units reported by the producer and publishes them.
func (s *Store) ApplyTelemetry(changed []Unit) {
	if len(changed) == 0 {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, unit := range changed {
		if _, known := s.units[unit.ID]; !known {
			continue // the fleet roster is fixed at start-up; an unknown id is a bug upstream
		}
		s.units[unit.ID] = unit
	}
	update := s.bumpLocked(UpdateUnits)
	update.Units = slices.Clone(changed)
	s.publishLocked(update)
}

// SendCommand validates an instruction and records its effect.
//
// The browser disables controls it expects to be refused; this decides whether they are.
func (s *Store) SendCommand(unitID string, command Command) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	unit, ok := s.units[unitID]
	if !ok {
		return notFound("No unit %s", unitID)
	}
	if err := s.checkCommandLocked(unit, command); err != nil {
		return err
	}

	switch command {
	case CommandStop:
		s.unitStops[unitID] = true
	case CommandResume:
		delete(s.unitStops, unitID)
	case CommandStart, CommandDock:
		// Both re-task the unit. The simulator owns no task queue, so the fleet reports no
		// change until its next frame — which is what a real command path looks like too.
	}

	s.publishCommandsLocked()
	return nil
}

func (s *Store) checkCommandLocked(unit Unit, command Command) error {
	facilityStopped := s.facilityStops[unit.SiteID] != 0
	operatorStopped := s.unitStops[unit.ID]

	if unit.State == StateOffline {
		return refused("No link to %s — the command cannot be delivered", unit.ID)
	}

	switch command {
	case CommandStop:
		switch {
		case facilityStopped:
			return refused("%s is already held by the facility emergency stop", unit.ID)
		case operatorStopped:
			return refused("%s is already stopped", unit.ID)
		}

	case CommandResume:
		switch {
		case facilityStopped:
			return refused("Release the emergency stop at this facility first")
		case unit.State == StateError:
			return refused("Clear the fault on %s first", unit.ID)
		case !operatorStopped:
			return refused("%s is not stopped — there is nothing to resume", unit.ID)
		}

	case CommandStart:
		switch {
		case facilityStopped:
			return refused("The facility emergency stop is engaged")
		case unit.State == StateError:
			return refused("Clear the fault on %s first", unit.ID)
		case operatorStopped:
			return refused("Resume %s before starting new work", unit.ID)
		case unit.State == StateActive:
			return refused("%s is already on a task", unit.ID)
		case unit.State == StateCharging && unit.Battery < StartTaskMinBattery:
			return refused("%s is charging — ready at %.0f%%", unit.ID, StartTaskMinBattery)
		}

	case CommandDock:
		switch {
		case facilityStopped:
			return refused("The facility emergency stop is engaged")
		case unit.State == StateCharging || unit.Zone == DockZone:
			return refused("%s is already at a dock", unit.ID)
		case unit.Task != nil && *unit.Task == ForcedReturnTask:
			return refused("%s is already returning to a dock", unit.ID)
		}
	}
	return nil
}

// SetEmergencyStop engages or releases the stop for one facility, every floor.
func (s *Store) SetEmergencyStop(siteID string, engaged bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.sites[siteID]; !ok {
		return notFound("No facility %s", siteID)
	}
	if engaged {
		if _, already := s.facilityStops[siteID]; !already {
			s.facilityStops[siteID] = s.nowMillis()
		}
	} else {
		delete(s.facilityStops, siteID)
	}

	s.publishCommandsLocked()
	return nil
}

// Acknowledge records ownership of alarms and reports how many changed.
//
// First writer wins: an alarm somebody already owns is left alone, so a late click cannot
// erase who actually took it.
func (s *Store) Acknowledge(seqs []int64, operator string) int {
	s.mu.Lock()
	defer s.mu.Unlock()

	wanted := make(map[int64]bool, len(seqs))
	for _, seq := range seqs {
		wanted[seq] = true
	}

	changed := make([]Alarm, 0, len(seqs))
	for i := range s.alarms {
		if !wanted[s.alarms[i].Seq] || s.alarms[i].AcknowledgedBy != nil {
			continue
		}
		owner := operator
		s.alarms[i].AcknowledgedBy = &owner
		changed = append(changed, s.alarms[i])
	}
	if len(changed) == 0 {
		return 0
	}

	update := s.bumpLocked(UpdateAlarms)
	update.Alarms = changed
	s.publishLocked(update)
	return len(changed)
}

// Held reports which units the producer must not move: those stopped individually and those
// at a facility under emergency stop.
func (s *Store) Held() (unitStops map[string]bool, facilityStops map[string]bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	sites := make(map[string]bool, len(s.facilityStops))
	for id := range s.facilityStops {
		sites[id] = true
	}
	return maps.Clone(s.unitStops), sites
}

// publishCommandsLocked announces what an operator changed: both stop lists, every time,
// because a client that receives one without the other cannot tell which it is missing.
func (s *Store) publishCommandsLocked() {
	update := s.bumpLocked(UpdateCommands)
	update.FacilityStops = s.facilityStopsLocked()
	update.UnitStops = s.unitStopsLocked()
	s.publishLocked(update)
}

func (s *Store) bumpLocked(kind UpdateKind) Update {
	s.version++
	return Update{Kind: kind, Version: s.version, ServerTime: s.nowMillis()}
}

// publishLocked fans an update out while the write lock is still held.
//
// Holding it is the point: releasing first would let two writers deliver their versions out
// of order, and a client that sees v6 before v5 discards v5 as stale without ever learning
// it missed something. Sends are non-blocking, so the lock is held only for a channel send
// per subscriber.
func (s *Store) publishLocked(update Update) {
	for ch := range s.subscribers {
		select {
		case ch <- update:
		default:
			// Dropped. The subscriber's next frame carries a version it cannot reconcile,
			// and it will ask for a snapshot.
		}
	}
}

func (s *Store) facilityStopsLocked() []FacilityStop {
	out := make([]FacilityStop, 0, len(s.facilityStops))
	for siteID, since := range s.facilityStops {
		out = append(out, FacilityStop{SiteID: siteID, Since: since})
	}
	slices.SortFunc(out, func(a, b FacilityStop) int { return strings.Compare(a.SiteID, b.SiteID) })
	return out
}

func (s *Store) unitStopsLocked() []string {
	// Built with make rather than collected, so "nothing is stopped" stays an empty list
	// rather than `null`.
	out := make([]string, 0, len(s.unitStops))
	for id := range s.unitStops {
		out = append(out, id)
	}
	slices.Sort(out)
	return out
}

func (s *Store) nowMillis() int64 { return s.now().UnixMilli() }
