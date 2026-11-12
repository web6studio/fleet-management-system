// Package sim stands in for the robots.
//
// It is the one fake in the system, and it is fenced off behind this package so the seam is
// obvious. Everything downstream of it (the store, the versioning, the API, the stream)
// behaves identically whether a frame came from here or from a robot on a floor.
package sim

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"math"
	"slices"
	"time"

	"fms/internal/fleet"
)

//go:embed fixtures.json
var fixturesJSON []byte

const (
	// Plan units covered per metre. 1000 × 800 units is a 50 × 40 m floor.
	unitsPerMetre = 20.0
	// One minute of path at 1 Hz. Long enough to show the shape of a route, short enough
	// that a dozen trails on one floor do not bury the plan.
	//
	// Delta frames omit the trail and the client rebuilds it, so this must match
	// TRAIL_POINTS in frontend/src/data/apply-frame.ts. See docs/api/websocket.md.
	trailLength = 60
	// Frames advanced before the first client connects, so the demo opens with trails
	// already drawn rather than with a static picture.
	warmupTicks = trailLength + 4
)

// seed is a unit plus the parameters only the simulation needs. The embedded Unit flattens
// into the same JSON object, so the fixtures file stays readable.
type seed struct {
	fleet.Unit
	// Role is the kind of work the unit does, which is what decides the shape of its
	// route. A unit on a dock is parked regardless of its role.
	Role role `json:"role,omitempty"`
	// Cruise is its driving speed in metres per second.
	Cruise float64 `json:"cruise,omitempty"`
}

type fixtureFile struct {
	Sites       []fleet.Site  `json:"sites"`
	Units       []seed        `json:"units"`
	Alarms      []fleet.Alarm `json:"alarms"`
	OutageAlarm fleet.Alarm   `json:"outageAlarm"`
}

// World is the demo fleet as loaded from disk, ready to seed a store.
type World struct {
	Sites  []fleet.Site
	Units  []fleet.Unit
	Alarms []fleet.Alarm

	seeds  []seed
	routes map[string]Route
}

// Load reads the fixtures and places the fleet on the buildings.
//
// outageSiteID, when set, starts the demo with that facility already unreachable: every one
// of its units silent, and one alarm for the facility rather than one per unit.
func Load(outageSiteID string) (*World, error) {
	var file fixtureFile
	if err := json.Unmarshal(fixturesJSON, &file); err != nil {
		return nil, fmt.Errorf("decode fixtures: %w", err)
	}
	if outageSiteID != "" && !slices.ContainsFunc(file.Sites, func(s fleet.Site) bool {
		return s.ID == outageSiteID
	}) {
		return nil, fmt.Errorf("unknown facility %q", outageSiteID)
	}

	world := &World{
		Sites:  file.Sites,
		Alarms: file.Alarms,
		seeds:  file.Units,
		Units:  make([]fleet.Unit, 0, len(file.Units)),
		routes: make(map[string]Route, len(file.Units)),
	}

	built := buildings()
	if err := world.attachPlans(built); err != nil {
		return nil, err
	}
	if err := world.placeUnits(built, outageSiteID); err != nil {
		return nil, err
	}
	if outageSiteID != "" {
		file.OutageAlarm.SiteID = outageSiteID
		world.Alarms = append(world.Alarms, file.OutageAlarm)
	}
	return world, nil
}

// attachPlans gives each facility one plan per storey it lists.
func (w *World) attachPlans(built map[string]map[string]storey) error {
	for i := range w.Sites {
		site := &w.Sites[i]
		storeys, ok := built[site.ID]
		if !ok {
			return fmt.Errorf("facility %q has no building", site.ID)
		}
		site.Plans = make(map[string]fleet.FloorPlan, len(site.Floors))
		for _, floor := range site.Floors {
			s, ok := storeys[floor]
			if !ok {
				return fmt.Errorf("facility %q has no plan for floor %s", site.ID, floor)
			}
			site.Plans[floor] = s.plan
		}
	}
	return nil
}

// placeUnits gives every unit with a floor the route it drives and stands it on that route.
//
// A missing route is a fixture mistake and fails the process rather than being skipped: a
// unit left standing still is indistinguishable on screen from one that has broken down.
func (w *World) placeUnits(built map[string]map[string]storey, outageSiteID string) error {
	taken := make(map[string]int)

	for i := range w.seeds {
		s := &w.seeds[i]
		if s.SiteID == outageSiteID {
			s.State = fleet.StateOffline
		}

		if s.Floor != nil {
			r, start, err := pickRoute(built, *s, taken)
			if err != nil {
				return err
			}
			w.routes[s.ID] = r
			s.Pose = &fleet.Pose{X: start.X, Y: start.Y}
		}
		w.Units = append(w.Units, s.Unit)
	}
	return nil
}

// pickRoute answers which route a unit drives and where on it to stand.
//
// Units sharing a floor and a role take successive routes, so a storey does not open with
// four robots on one doorway. Where they start depends on whether they will ever move: an
// active unit begins at the top of its route and spreads out as it drives, while one that
// is parked, broken or silent is placed at the far end. That is where an interrupted job
// actually leaves a robot, and counting backwards per unit keeps two dead scrubbers off the
// same pixel.
func pickRoute(
	built map[string]map[string]storey,
	s seed,
	taken map[string]int,
) (Route, fleet.Point, error) {
	where := fmt.Sprintf("%s/%s", s.SiteID, *s.Floor)
	r := s.Role
	// A charging unit is on a bay, whatever its job is the rest of the day.
	if s.Zone == fleet.DockZone {
		r = roleDock
	}

	options := built[s.SiteID][*s.Floor].routes[r]
	if len(options) == 0 {
		return Route{}, fleet.Point{}, fmt.Errorf("%s has no %s route for %s", where, r, s.ID)
	}

	n := taken[where+"/"+string(r)]
	taken[where+"/"+string(r)] = n + 1

	chosen := options[n%len(options)]
	start := chosen.Points[0]
	if s.State != fleet.StateActive {
		start = chosen.Points[len(chosen.Points)-1-n%len(chosen.Points)]
	}
	return chosen, start, nil
}

// mover drives one unit along its route.
type mover struct {
	unit  fleet.Unit
	route Route
	// leg is the index of the point being driven to.
	leg int
	// dir is +1 or -1. A shuttle turns round at each end of its route and retraces it; a
	// loop never reverses.
	dir    int
	cruise float64
	trail  []fleet.Point
	silent int
}

// Simulator advances the fleet one tick at a time and reports what moved.
//
// Units follow the routes their buildings define: a delivery runs from the service lift to
// one room's door and back, a scrubber covers open floor in parallel passes, an assistant
// walks a circuit. None of this is navigation: nothing here plans a path or avoids
// anything. It is the shape of the work, which is what makes a trail on the map worth
// reading.
type Simulator struct {
	store    *fleet.Store
	interval time.Duration
	movers   []*mover
}

func (w *World) Simulator(store *fleet.Store, interval time.Duration) *Simulator {
	s := &Simulator{store: store, interval: interval, movers: make([]*mover, 0, len(w.seeds))}

	for _, item := range w.seeds {
		m := &mover{unit: item.Unit, route: w.routes[item.ID], cruise: item.Cruise, dir: 1}
		if item.Pose != nil {
			pose := *item.Pose
			m.unit.Pose = &pose
			at := max(slices.Index(m.route.Points, fleet.Point{X: pose.X, Y: pose.Y}), 0)
			m.leg = m.nextLeg(at)
			m.face()
		}
		s.movers = append(s.movers, m)
	}

	for range warmupTicks {
		s.advance()
	}
	store.ApplyTelemetry(s.units())
	return s
}

func (s *Simulator) Run(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if changed := s.advance(); len(changed) > 0 {
				s.store.ApplyTelemetry(changed)
			}
		}
	}
}

// advance moves the fleet by one tick and returns the units whose telemetry differs.
func (s *Simulator) advance() []fleet.Unit {
	unitStops, facilityStops := s.store.Held()
	changed := make([]fleet.Unit, 0, len(s.movers))

	for _, m := range s.movers {
		if m.unit.State == fleet.StateOffline {
			m.silent++
			silent := m.silent
			m.unit.SilentFor = &silent
			m.unit.Speed = 0
			changed = append(changed, m.snapshot())
			continue
		}

		held := unitStops[m.unit.ID] || facilityStops[m.unit.SiteID]
		driving := !held && m.unit.Pose != nil &&
			len(m.route.Points) > 1 && m.unit.State == fleet.StateActive

		if !driving {
			if m.unit.Speed != 0 {
				m.unit.Speed = 0
				changed = append(changed, m.snapshot())
			}
			continue
		}

		m.mark()
		m.drive(m.cruise * unitsPerMetre * s.interval.Seconds())
		m.unit.Speed = m.cruise
		changed = append(changed, m.snapshot())
	}
	return changed
}

// drive consumes one tick's travel along the route, crossing as many legs as it reaches.
func (m *mover) drive(remaining float64) {
	for remaining > 0 {
		target := m.route.Points[m.leg]
		dx, dy := target.X-m.unit.Pose.X, target.Y-m.unit.Pose.Y
		gap := math.Hypot(dx, dy)
		if gap > remaining {
			m.unit.Pose.X += dx / gap * remaining
			m.unit.Pose.Y += dy / gap * remaining
			break
		}
		m.unit.Pose.X, m.unit.Pose.Y = target.X, target.Y
		remaining -= gap
		m.leg = m.nextLeg(m.leg)
	}
	m.face()
}

// nextLeg is the point after the one given: the next corner of a loop, or the next step of a
// shuttle, which reverses when it runs out of route.
func (m *mover) nextLeg(leg int) int {
	n := len(m.route.Points)
	if n < 2 {
		return 0
	}
	if m.route.Loop {
		return (leg + 1) % n
	}
	if leg+m.dir < 0 || leg+m.dir >= n {
		m.dir = -m.dir
	}
	return leg + m.dir
}

// face points the unit at wherever it is going.
func (m *mover) face() {
	if len(m.route.Points) < 2 {
		return
	}
	target := m.route.Points[m.leg]
	dx, dy := target.X-m.unit.Pose.X, target.Y-m.unit.Pose.Y
	if dx == 0 && dy == 0 {
		return
	}
	// Plan y grows downwards while heading is measured counter-clockwise, so dy is negated.
	heading := math.Atan2(-dy, dx)
	if heading < 0 {
		heading += 2 * math.Pi
	}
	m.unit.Pose.Heading = heading
}

// mark records where the unit is now, dropping the oldest sample once the trail is full.
//
// Samples are rounded to whole plan units, which is 5 cm and far finer than anything the
// map can draw. Full float precision would spend bandwidth on digits nobody can see.
func (m *mover) mark() {
	m.trail = append(m.trail, fleet.Point{
		X: math.Round(m.unit.Pose.X),
		Y: math.Round(m.unit.Pose.Y),
	})
	if len(m.trail) > trailLength {
		m.trail = m.trail[1:]
	}
}

func (s *Simulator) units() []fleet.Unit {
	out := make([]fleet.Unit, 0, len(s.movers))
	for _, m := range s.movers {
		out = append(out, m.snapshot())
	}
	return out
}

// snapshot copies everything a reader could hold on to while the simulator keeps mutating.
func (m *mover) snapshot() fleet.Unit {
	unit := m.unit
	unit.Trail = fleet.NonNil(slices.Clone(m.trail))
	if m.unit.Pose != nil {
		pose := *m.unit.Pose
		unit.Pose = &pose
	}
	return unit
}
