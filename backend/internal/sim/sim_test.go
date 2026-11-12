package sim

import (
	"encoding/json"
	"math"
	"testing"
	"time"

	"fms/internal/fleet"
)

func load(t *testing.T) *World {
	t.Helper()
	world, err := Load("")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	return world
}

func run(t *testing.T, ticks int) *Simulator {
	t.Helper()
	world := load(t)
	store := fleet.NewStore(time.Now, world.Sites, world.Units, world.Alarms)
	sim := world.Simulator(store, time.Second)
	for range ticks {
		sim.advance()
	}
	return sim
}

// Every robot stays inside the building it is driving in.
//
// Prevents the defect an operator reports as "the map is broken": a marker sitting in the
// grey outside the walls, or sliding through a room it has no door into. Routes are written
// by hand against plans written by hand, and nothing but this check notices when one of the
// two moves.
func TestUnitsStayOnTheirFloor(t *testing.T) {
	sim := run(t, 400)

	for _, m := range sim.movers {
		if m.unit.Pose == nil {
			continue
		}
		plan := planFor(t, m.unit)
		if m.unit.Pose.X < inset || m.unit.Pose.X > plan.Width-inset ||
			m.unit.Pose.Y < inset || m.unit.Pose.Y > plan.Height-inset {
			t.Errorf("%s drove outside %s/%s at %.0f,%.0f",
				m.unit.ID, m.unit.SiteID, *m.unit.Floor, m.unit.Pose.X, m.unit.Pose.Y)
		}
		for _, p := range m.route.Points {
			if p.X < inset || p.X > plan.Width-inset || p.Y < inset || p.Y > plan.Height-inset {
				t.Errorf("%s has a waypoint outside its floor at %.0f,%.0f", m.unit.ID, p.X, p.Y)
			}
		}
	}
}

func planFor(t *testing.T, unit fleet.Unit) fleet.FloorPlan {
	t.Helper()
	world := load(t)
	for _, site := range world.Sites {
		if site.ID == unit.SiteID {
			return site.Plans[*unit.Floor]
		}
	}
	t.Fatalf("no plan for %s/%s", unit.SiteID, *unit.Floor)
	return fleet.FloorPlan{}
}

// Prevents the whole building being drawn as one storey repeated. A dock level is not a
// guest corridor, and showing the same rooms on every floor makes the plan decorative. An
// operator cannot tell F1 from F3 and stops reading the map at all.
func TestEveryStoreyHasItsOwnPlan(t *testing.T) {
	for _, site := range load(t).Sites {
		seen := make(map[string]string, len(site.Floors))
		for _, floor := range site.Floors {
			encoded, err := json.Marshal(site.Plans[floor])
			if err != nil {
				t.Fatalf("marshal %s/%s: %v", site.ID, floor, err)
			}
			if other, repeat := seen[string(encoded)]; repeat {
				t.Errorf("%s draws %s and %s identically", site.ID, other, floor)
			}
			seen[string(encoded)] = floor
		}
	}
}

// Prevents a fleet that drives to the end of its routes and parks there. A shuttle has to
// turn round, and the reversal is the one line of the stepper with no visible symptom until
// several minutes in, by which time every robot on the floor has stopped moving.
func TestShuttlesTurnRound(t *testing.T) {
	sim := run(t, 1)

	var subject *mover
	for _, m := range sim.movers {
		if !m.route.Loop && len(m.route.Points) > 1 && m.unit.State == fleet.StateActive {
			subject = m
			break
		}
	}
	if subject == nil {
		t.Fatal("no shuttling unit in the fixtures")
	}

	start := *subject.unit.Pose
	far := 0.0
	returned := false
	for range 2000 {
		subject.drive(subject.cruise * unitsPerMetre)
		away := math.Hypot(subject.unit.Pose.X-start.X, subject.unit.Pose.Y-start.Y)
		far = math.Max(far, away)
		if far > 50 && away < 5 {
			returned = true
			break
		}
	}
	if !returned {
		t.Errorf("%s never came back: furthest %.0f units from its start", subject.unit.ID, far)
	}
}

// Prevents a trail that outgrows its budget. The trail is the bulk of every telemetry frame,
// and a window that only ever grows turns a 1 Hz stream into a leak.
func TestTrailStopsGrowing(t *testing.T) {
	sim := run(t, trailLength*3)

	for _, m := range sim.movers {
		if len(m.trail) > trailLength {
			t.Errorf("%s kept %d samples, cap is %d", m.unit.ID, len(m.trail), trailLength)
		}
		for _, p := range m.trail {
			if p.X != math.Trunc(p.X) || p.Y != math.Trunc(p.Y) {
				t.Errorf("%s published an unrounded trail sample %v", m.unit.ID, p)
			}
		}
	}
}
