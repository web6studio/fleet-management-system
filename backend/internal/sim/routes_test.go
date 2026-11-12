package sim

import (
	"math"
	"testing"

	"fms/internal/fleet"
)

// A robot only ever leaves a room through its door.
//
// Prevents the defect that makes the map actively misleading rather than merely plain: a
// unit gliding diagonally through a ward wall, or straight across the nurse station. Routes
// are written by hand against plans written by hand, and a leg that misses a doorway by
// twenty units looks perfectly reasonable in the source.
//
// The plan is walked rather than trusted: every route is sampled finely, and each time a
// sample crosses from one enclosed space into another, a door has to be there. Circulation
// space is exempt: corridors abut each other with nothing between them, which is what makes
// them circulation space.
func TestRoutesOnlyCrossWallsAtDoors(t *testing.T) {
	const step = 2.0

	for siteID, storeys := range buildings() {
		for floor, s := range storeys {
			for role, options := range s.routes {
				for i, r := range options {
					for _, sample := range walk(r, step) {
						checkSample(t, s.plan, sample, where{siteID, floor, string(role), i})
					}
				}
			}
		}
	}
}

type where struct {
	site  string
	floor string
	role  string
	index int
}

type sample struct{ from, to fleet.Point }

func checkSample(t *testing.T, plan fleet.FloorPlan, s sample, w where) {
	t.Helper()

	if blocked := fixtureAt(plan, s.to); blocked {
		t.Errorf("%s/%s %s route %d drives through a fixture at %.0f,%.0f",
			w.site, w.floor, w.role, w.index, s.to.X, s.to.Y)
		return
	}

	before, after := spaceAt(plan, s.from), spaceAt(plan, s.to)
	if before.index == after.index || circulation(before.kind, after.kind) {
		return
	}

	mid := fleet.Point{X: (s.from.X + s.to.X) / 2, Y: (s.from.Y + s.to.Y) / 2}
	if doorAt(plan, mid) {
		return
	}
	t.Errorf("%s/%s %s route %d crosses a wall at %.0f,%.0f with no door",
		w.site, w.floor, w.role, w.index, mid.X, mid.Y)
}

// circulation is true when both sides of a boundary are open circulation space. Corridors
// are drawn as abutting rectangles with no wall between them, and a robot walking from one
// into the next has not gone through anything.
func circulation(before, after fleet.ShapeKind) bool {
	return before == fleet.KindCorridor && after == fleet.KindCorridor
}

type space struct {
	kind  fleet.ShapeKind
	index int
}

// spaceAt is the enclosed space a point sits in: the last room or corridor drawn over it,
// since later shapes are drawn on top. Slabs, walls, doors and floor markings are not
// spaces, because nothing is separated by them.
func spaceAt(plan fleet.FloorPlan, p fleet.Point) space {
	found := space{index: -1}
	for i, r := range plan.Rects {
		if (r.Kind == fleet.KindRoom || r.Kind == fleet.KindCorridor) && inside(r, p) {
			found = space{kind: r.Kind, index: i}
		}
	}
	return found
}

func doorAt(plan fleet.FloorPlan, p fleet.Point) bool {
	return anyRect(plan, fleet.KindDoor, p)
}

func fixtureAt(plan fleet.FloorPlan, p fleet.Point) bool {
	return anyRect(plan, fleet.KindFixture, p)
}

func anyRect(plan fleet.FloorPlan, kind fleet.ShapeKind, p fleet.Point) bool {
	for _, r := range plan.Rects {
		if r.Kind == kind && inside(r, p) {
			return true
		}
	}
	return false
}

func inside(r fleet.PlanRect, p fleet.Point) bool {
	return p.X >= r.X && p.X < r.X+r.W && p.Y >= r.Y && p.Y < r.Y+r.H
}

// walk samples a route at a fixed spacing, including the leg that closes a loop.
func walk(r Route, step float64) []sample {
	points := r.Points
	if r.Loop {
		points = append(append([]fleet.Point{}, points...), points[0])
	}

	var out []sample
	for i := 1; i < len(points); i++ {
		a, b := points[i-1], points[i]
		length := math.Hypot(b.X-a.X, b.Y-a.Y)
		steps := int(math.Ceil(length / step))
		previous := a
		for n := 1; n <= steps; n++ {
			t := float64(n) / float64(steps)
			next := fleet.Point{X: a.X + (b.X-a.X)*t, Y: a.Y + (b.Y-a.Y)*t}
			out = append(out, sample{from: previous, to: next})
			previous = next
		}
	}
	return out
}
