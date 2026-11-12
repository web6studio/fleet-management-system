package sim

import (
	"fmt"

	"fms/internal/fleet"
)

// Floor plans and the routes robots drive on them.
//
// One function per storey, because a plan and the paths across it are the same drawing: a
// route written against a corridor that has since moved sends a robot through a wall. Local
// constants shared by both are what keeps them in step.
//
// In production a plan comes from the building's SLAM map and a route from a dispatched job.

// The drawing frame every storey uses: a 50 x 40 m floor, walled 1 m in from the edge.
const (
	planWidth  = 1000.0
	planHeight = 800.0
	inset      = 20.0
)

// storey is one floor: what it looks like, and where its robots drive.
type storey struct {
	plan   fleet.FloorPlan
	routes map[role][]Route
}

// role is the driving pattern a unit's job implies. A delivery robot runs errands between a
// service point and a room; a scrubber covers open floor in parallel passes; an assistant
// walks a circuit. Which one a unit has is fixture data, not something inferred from the
// model name on its chassis.
type role string

const (
	roleDeliver role = "deliver"
	roleClean   role = "clean"
	rolePatrol  role = "patrol"
	// roleDock is where a unit sits while it charges. Taken from the unit's zone rather
	// than its job, because any of them can be on a dock.
	roleDock role = "dock"
)

// buildings returns every storey of every facility, keyed by site then floor.
func buildings() map[string]map[string]storey {
	return map[string]map[string]storey{
		"hotel": {
			"F0": hotelArrival(),
			"F1": hotelGuestFloor(),
			"F2": hotelSuiteFloor(),
			"F3": hotelTopFloor(),
		},
		"clinic": {
			"F1": clinicOutpatients(),
			"F2": clinicWard(),
			"F3": clinicTheatres(),
		},
		"terminal": {
			"F1": terminalArrivals(),
			"F2": terminalDepartures(),
		},
	}
}

// ----------------------------------------------------------------------------------------
// Marienhof Hotel
// ----------------------------------------------------------------------------------------

// The lift core and the service block sit in the same place on every storey, because a lift
// shaft goes all the way up. Routes start from the lift: that is where a service robot is
// loaded and where it returns.
const (
	hotelCorridorY = 400.0
	hotelNorthRoom = 180.0
	hotelSouthRoom = 620.0
)

var hotelLift = pt(100, hotelCorridorY)

// hotelCore draws the part of a guest storey that is identical on all of them: the service
// block the robots work out of, the spine corridor, and the stair at the far end.
func hotelCore(corridorLabel string) *planner {
	return newPlan().
		add(fleet.KindRoom, 20, 20, 160, 270).
		add(fleet.KindCorridor, 20, 290, 160, 220).
		add(fleet.KindRoom, 40, 318, 52, 72).
		add(fleet.KindRoom, 108, 318, 52, 72).
		add(fleet.KindRoom, 20, 510, 160, 270).
		add(fleet.KindCorridor, 180, 330, 800, 140).
		add(fleet.KindDoor, 116, 285, 40, 10).
		add(fleet.KindDoor, 116, 505, 40, 10).
		add(fleet.KindDoor, 910, 325, 40, 10).
		add(fleet.KindDoor, 910, 465, 40, 10).
		line(cross(40, 318, 52, 72)).
		line(cross(108, 318, 52, 72)).
		line("M900 346v108M920 346v108M940 346v108M960 346v108").
		label("STAFF", 100, 160).
		label("LIFTS", 100, 450).
		label("LINEN", 100, 650).
		label(corridorLabel, 580, 406)
}

// hotelGuestFloor is a double-loaded corridor: eight rooms either side of the spine.
func hotelGuestFloor() storey {
	const pitch, firstDoor = 100.0, 254.0
	p := hotelCore("CORRIDOR A").
		row(fleet.KindRoom, 180, 20, pitch, 310, pitch, 8).
		row(fleet.KindRoom, 180, 470, pitch, 310, pitch, 8).
		doors(325, firstDoor, pitch, 28, 8).
		doors(465, firstDoor, pitch, 28, 8).
		label("NORTH WING", 530, 120).
		label("SOUTH WING", 530, 745)

	return storey{
		plan: p.done(),
		// Alternating sides gives each robot on the floor a different room, so two of them
		// are never driving the same line of corridor at the same offset, which on a map
		// reads as one robot with a rendering glitch.
		routes: map[role][]Route{
			roleDeliver: alternatingErrands(firstDoor, pitch, 8),
			roleClean:   {corridorSweep()},
		},
	}
}

// hotelSuiteFloor trades the north rank for five wide suites and keeps standard rooms south.
func hotelSuiteFloor() storey {
	const suitePitch, roomPitch = 160.0, 100.0
	p := hotelCore("CORRIDOR B").
		row(fleet.KindRoom, 180, 20, suitePitch, 310, suitePitch, 5).
		row(fleet.KindRoom, 180, 470, roomPitch, 310, roomPitch, 8).
		doors(325, 260, suitePitch, 36, 5).
		doors(465, 254, roomPitch, 28, 8).
		label("SUITES", 530, 120).
		label("SOUTH WING", 530, 745)

	return storey{
		plan: p.done(),
		routes: map[role][]Route{
			roleDeliver: append(
				errandsTo(hotelNorthRoom, 260, suitePitch, 5),
				errandsTo(hotelSouthRoom, 254, roomPitch, 8)...,
			),
			roleClean: {corridorSweep()},
		},
	}
}

// hotelTopFloor is executive suites, a spa behind the lift core, and a roof terrace east.
func hotelTopFloor() storey {
	const pitch = 200.0
	p := hotelCore("CORRIDOR C").
		row(fleet.KindRoom, 180, 20, pitch, 310, pitch, 4).
		add(fleet.KindRoom, 180, 470, 340, 310).
		rounded(fleet.KindFixture, 230, 530, 240, 110, 55).
		row(fleet.KindRoom, 520, 470, 120, 310, 120, 2).
		add(fleet.KindSlab, 760, 470, 220, 310).
		doors(325, 280, pitch, 44, 4).
		add(fleet.KindDoor, 330, 465, 44, 10).
		doors(465, 580, 120, 28, 2).
		add(fleet.KindDoor, 850, 465, 60, 10).
		label("EXECUTIVE SUITES", 580, 120).
		label("SPA", 350, 700).
		label("TERRACE", 870, 630)

	return storey{
		plan: p.done(),
		routes: map[role][]Route{
			roleDeliver: errandsTo(hotelNorthRoom, 280, pitch, 4),
		},
	}
}

// hotelArrival is the ground floor: an open lobby, back of house west, and the robot dock.
func hotelArrival() storey {
	p := newPlan().
		add(fleet.KindRoom, 20, 20, 200, 280).
		rounded(fleet.KindBay, 44, 68, 112, 44, 4).
		rounded(fleet.KindBay, 44, 138, 112, 44, 4).
		rounded(fleet.KindBay, 44, 208, 112, 44, 4).
		add(fleet.KindCorridor, 20, 300, 200, 210).
		add(fleet.KindRoom, 40, 318, 52, 72).
		add(fleet.KindRoom, 108, 318, 52, 72).
		add(fleet.KindRoom, 20, 510, 200, 270).
		add(fleet.KindCorridor, 220, 20, 760, 480).
		rounded(fleet.KindFixture, 420, 150, 320, 72, 24).
		rounded(fleet.KindFixture, 300, 330, 160, 90, 45).
		rounded(fleet.KindFixture, 620, 330, 160, 90, 45).
		add(fleet.KindRoom, 220, 500, 250, 280).
		add(fleet.KindRoom, 470, 500, 250, 280).
		add(fleet.KindRoom, 720, 500, 260, 280).
		add(fleet.KindDoor, 215, 150, 10, 60).
		add(fleet.KindDoor, 215, 380, 10, 60).
		doors(495, 330, 250, 80, 3).
		add(fleet.KindDoor, 975, 200, 10, 120).
		line(cross(40, 318, 52, 72)).
		line(cross(108, 318, 52, 72)).
		label("ROBOT DOCK", 120, 48).
		label("LIFTS", 120, 460).
		label("STAFF", 120, 650).
		label("LOBBY", 600, 270).
		label("RECEPTION", 580, 196).
		label("RESTAURANT", 340, 640).
		label("CONFERENCE", 590, 640).
		label("LUGGAGE", 850, 640)

	return storey{
		plan: p.done(),
		routes: map[role][]Route{
			roleDock: {route(false, pt(100, 90), pt(100, 160), pt(100, 230))},
		},
	}
}

// alternatingErrands sends consecutive robots to opposite sides of the corridor.
func alternatingErrands(firstDoor, pitch float64, rooms int) []Route {
	out := make([]Route, 0, rooms)
	for i := range rooms {
		roomY := hotelNorthRoom
		if i%2 == 1 {
			roomY = hotelSouthRoom
		}
		out = append(out, errand(hotelLift, hotelCorridorY, firstDoor+pitch*float64(i), roomY))
	}
	return out
}

func errandsTo(roomY, firstDoor, pitch float64, rooms int) []Route {
	out := make([]Route, 0, rooms)
	for i := range rooms {
		out = append(out, errand(hotelLift, hotelCorridorY, firstDoor+pitch*float64(i), roomY))
	}
	return out
}

// corridorSweep is three overlapping passes down the spine, which is how a corridor that
// narrow is actually scrubbed.
func corridorSweep() Route {
	return serpentine(210, hotelCorridorY-44, 950, hotelCorridorY+44, 3)
}

// ----------------------------------------------------------------------------------------
// Klinikum Sued
// ----------------------------------------------------------------------------------------

// clinicWard is the inpatient storey: wards either side of two parallel corridors, with the
// nurse station between them.
func clinicWard() storey {
	p := newPlan().
		row(fleet.KindRoom, 20, 20, 120, 240, 120, 8).
		add(fleet.KindCorridor, 20, 260, 960, 80).
		add(fleet.KindRoom, 20, 340, 180, 120).
		add(fleet.KindRoom, 280, 340, 440, 120).
		add(fleet.KindRoom, 800, 340, 180, 120).
		add(fleet.KindCorridor, 200, 340, 80, 120).
		add(fleet.KindCorridor, 720, 340, 80, 120).
		add(fleet.KindCorridor, 20, 460, 960, 80).
		add(fleet.KindRoom, 20, 540, 180, 240).
		row(fleet.KindRoom, 200, 540, 120, 240, 120, 5).
		add(fleet.KindRoom, 800, 540, 180, 240).
		doors(255, 75, 120, 30, 8).
		add(fleet.KindDoor, 90, 535, 40, 10).
		doors(535, 245, 120, 30, 5).
		add(fleet.KindDoor, 870, 535, 40, 10).
		add(fleet.KindDoor, 460, 455, 80, 10).
		add(fleet.KindDoor, 195, 380, 10, 40).
		add(fleet.KindDoor, 795, 380, 10, 40).
		label("WARD 2A", 260, 150).
		label("WARD 2B", 740, 150).
		label("NURSE STATION", 500, 406).
		label("LAB", 110, 406).
		label("PHARMACY", 890, 406).
		label("WARD 2C", 500, 680).
		label("LINEN STORE", 110, 680)

	// The nurse station is a closed block with one door, on its south side. Every route out
	// of it starts by going through that door into the south corridor; the two short link
	// corridors at x 200-280 and 720-800 are the only ways back up to the ward side.
	station, doorway := pt(500, 400), pt(500, 500)
	return storey{
		plan: p.done(),
		routes: map[role][]Route{
			// A ward runner's work is a shuttle between the station and one bed bay, or a
			// sample going down to the lab. Both are there and back, never a wander.
			roleDeliver: {
				route(false, station, doorway, pt(240, 500), pt(240, 400), pt(110, 400)),
				route(false, station, doorway, pt(240, 500), pt(240, 300), pt(195, 300), pt(195, 140)),
				route(false, station, doorway, pt(760, 500), pt(760, 300), pt(675, 300), pt(675, 140)),
				route(false, station, doorway, pt(365, 500), pt(365, 660)),
			},
		},
	}
}

// clinicOutpatients is the public storey: consulting rooms over a waiting hall.
func clinicOutpatients() storey {
	p := newPlan().
		row(fleet.KindRoom, 20, 20, 120, 220, 120, 8).
		add(fleet.KindCorridor, 20, 240, 960, 100).
		add(fleet.KindCorridor, 20, 340, 960, 260).
		roundedRow(fleet.KindFixture, 220, 400, 140, 54, 27, 240, 3).
		roundedRow(fleet.KindFixture, 220, 500, 140, 54, 27, 240, 3).
		add(fleet.KindRoom, 20, 600, 240, 180).
		add(fleet.KindRoom, 260, 600, 240, 180).
		add(fleet.KindRoom, 500, 600, 240, 180).
		add(fleet.KindRoom, 740, 600, 240, 180).
		doors(235, 75, 120, 30, 8).
		doors(595, 140, 240, 70, 4).
		label("CONSULTING", 500, 150).
		label("WAITING", 500, 370).
		label("IMAGING", 140, 700).
		label("BLOODS", 380, 700).
		label("DISPENSARY", 620, 700).
		label("RECEPTION", 860, 700)

	// Seating is laid out in blocks with aisles at 140, 380, 620 and 860, the same four
	// positions as the doors along the bottom, so a robot crossing the hall never has to
	// squeeze between two rows of chairs.
	hall := pt(500, 290)
	return storey{
		plan: p.done(),
		routes: map[role][]Route{
			roleDeliver: {
				route(false, hall, pt(860, 290), pt(860, 560), pt(860, 680)),
				errand(hall, 290, 195, 130),
				route(false, hall, pt(140, 290), pt(140, 560), pt(140, 680)),
			},
		},
	}
}

// clinicTheatres is the restricted storey: operating rooms, recovery, and sterile logistics
// which is where this building's robots charge.
func clinicTheatres() storey {
	p := newPlan().
		row(fleet.KindRoom, 20, 20, 230, 280, 240, 4).
		add(fleet.KindCorridor, 20, 300, 960, 120).
		add(fleet.KindRoom, 20, 420, 200, 360).
		rounded(fleet.KindBay, 54, 538, 112, 44, 4).
		rounded(fleet.KindBay, 54, 608, 112, 44, 4).
		rounded(fleet.KindBay, 54, 678, 112, 44, 4).
		add(fleet.KindRoom, 220, 420, 420, 360).
		add(fleet.KindRoom, 640, 420, 340, 360).
		doors(295, 135, 240, 44, 4).
		add(fleet.KindDoor, 90, 415, 60, 10).
		add(fleet.KindDoor, 400, 415, 60, 10).
		add(fleet.KindDoor, 780, 415, 60, 10).
		label("OR 1", 135, 170).
		label("OR 2", 375, 170).
		label("OR 3", 615, 170).
		label("OR 4", 855, 170).
		label("STERILE CORRIDOR", 500, 366).
		label("SUPPLY - DOCK", 120, 470).
		label("RECOVERY", 430, 470).
		label("CHANGING", 810, 470)

	return storey{
		plan: p.done(),
		routes: map[role][]Route{
			roleDock: {route(false, pt(110, 560), pt(110, 630), pt(110, 700))},
		},
	}
}

// ----------------------------------------------------------------------------------------
// Terminal 2
// ----------------------------------------------------------------------------------------

// terminalArrivals is the baggage hall and the gate line beyond it.
func terminalArrivals() storey {
	p := newPlan().
		add(fleet.KindCorridor, 20, 20, 960, 540).
		add(fleet.KindRoom, 860, 20, 120, 150).
		rounded(fleet.KindBay, 878, 60, 84, 40, 4).
		rounded(fleet.KindBay, 878, 112, 84, 40, 4).
		rounded(fleet.KindFixture, 170, 150, 260, 96, 48).
		rounded(fleet.KindFixture, 200, 180, 200, 36, 18).
		rounded(fleet.KindFixture, 540, 150, 260, 96, 48).
		rounded(fleet.KindFixture, 570, 180, 200, 36, 18).
		row(fleet.KindRoom, 140, 330, 18, 18, 200, 4).
		row(fleet.KindRoom, 140, 450, 18, 18, 200, 4).
		row(fleet.KindRoom, 20, 560, 240, 220, 240, 4).
		doors(555, 140, 240, 80, 4).
		add(fleet.KindDoor, 855, 70, 10, 60).
		label("BAGGAGE CLAIM", 485, 110).
		label("CONCOURSE", 460, 410).
		label("GATE B1", 140, 680).
		label("GATE B2", 380, 680).
		label("GATE B3", 620, 680).
		label("GATE B4", 860, 680)

	return storey{
		plan: p.done(),
		routes: map[role][]Route{
			// An assistant on a concourse walks a circuit and keeps walking it. That is a
			// loop, not a shuttle: it never doubles back on itself. The circuits run clear
			// of the pillar grid at x 140, 340, 540, 740.
			rolePatrol: {
				loop(pt(120, 480), pt(880, 480), pt(880, 300), pt(120, 300)),
				loop(pt(300, 300), pt(300, 480), pt(700, 480), pt(700, 300)),
			},
			// An escort walks a passenger from the hall to one gate and comes back.
			roleDeliver: {
				route(false, pt(480, 300), pt(380, 440), pt(380, 600)),
				route(false, pt(480, 300), pt(620, 440), pt(620, 600)),
			},
		},
	}
}

// terminalDepartures is check-in, the security rank, and the airside gates behind it.
func terminalDepartures() storey {
	p := newPlan().
		add(fleet.KindCorridor, 20, 20, 960, 340).
		roundedRow(fleet.KindFixture, 120, 90, 180, 56, 28, 220, 4).
		roundedRow(fleet.KindFixture, 120, 210, 180, 56, 28, 220, 4).
		add(fleet.KindCorridor, 20, 360, 960, 180).
		row(fleet.KindRoom, 140, 370, 60, 160, 140, 6).
		add(fleet.KindRoom, 20, 540, 300, 240).
		add(fleet.KindRoom, 320, 540, 340, 240).
		add(fleet.KindRoom, 660, 540, 320, 240).
		add(fleet.KindDoor, 125, 535, 90, 10).
		add(fleet.KindDoor, 430, 535, 120, 10).
		add(fleet.KindDoor, 760, 535, 120, 10).
		label("CHECK-IN", 500, 60).
		label("SECURITY", 500, 556).
		label("RETAIL", 170, 680).
		label("LOUNGE", 490, 680).
		label("GATES C", 820, 680)

	return storey{
		plan: p.done(),
		routes: map[role][]Route{
			// Up and down the aisle between the two rows of check-in islands, then the
			// open band in front of security. Both are shuttles: there is no way round a
			// row of desks, so a circuit here would have to drive through one.
			rolePatrol: {
				route(false, pt(60, 178), pt(960, 178)),
				route(false, pt(60, 330), pt(960, 330)),
			},
		},
	}
}

// ----------------------------------------------------------------------------------------
// Drawing
// ----------------------------------------------------------------------------------------

// planner accumulates a storey's shapes. Methods chain so a floor reads in the order it
// would be drawn: slab, rooms, circulation, openings, then what is written on it.
type planner struct {
	rects  []fleet.PlanRect
	paths  []string
	labels []fleet.PlanLabel
}

func newPlan() *planner {
	p := &planner{}
	return p.add(fleet.KindSlab, inset, inset, planWidth-2*inset, planHeight-2*inset)
}

func (p *planner) add(kind fleet.ShapeKind, x, y, w, h float64) *planner {
	p.rects = append(p.rects, fleet.PlanRect{Kind: kind, X: x, Y: y, W: w, H: h})
	return p
}

func (p *planner) rounded(kind fleet.ShapeKind, x, y, w, h, rx float64) *planner {
	p.rects = append(p.rects, fleet.PlanRect{Kind: kind, X: x, Y: y, W: w, H: h, RX: rx})
	return p
}

// row repeats a shape across the floor: a wing of rooms, a rank of security lanes.
func (p *planner) row(kind fleet.ShapeKind, x, y, w, h, pitch float64, n int) *planner {
	for i := range n {
		p.add(kind, x+pitch*float64(i), y, w, h)
	}
	return p
}

// roundedRow is row for furniture, which is drawn with its corners off.
func (p *planner) roundedRow(kind fleet.ShapeKind, x, y, w, h, rx, pitch float64, n int) *planner {
	for i := range n {
		p.rounded(kind, x+pitch*float64(i), y, w, h, rx)
	}
	return p
}

// doors cuts n openings of width w into the wall at y, centred on a row of the same pitch.
func (p *planner) doors(y, firstCentre, pitch, w float64, n int) *planner {
	for i := range n {
		p.add(fleet.KindDoor, firstCentre+pitch*float64(i)-w/2, y, w, 10)
	}
	return p
}

func (p *planner) label(text string, x, y float64) *planner {
	p.labels = append(p.labels, fleet.PlanLabel{Text: text, X: x, Y: y})
	return p
}

func (p *planner) line(d string) *planner {
	p.paths = append(p.paths, d)
	return p
}

// done closes the storey with its outer wall, which has to be drawn over everything else.
func (p *planner) done() fleet.FloorPlan {
	p.add(fleet.KindWall, inset, inset, planWidth-2*inset, planHeight-2*inset)
	return fleet.FloorPlan{
		Width:         planWidth,
		Height:        planHeight,
		UnitsPerMetre: unitsPerMetre,
		Rects:         p.rects,
		Paths:         fleet.NonNil(p.paths),
		Labels:        p.labels,
	}
}

// cross is the X a building plan puts over a lift shaft.
func cross(x, y, w, h float64) string {
	return fmt.Sprintf("M%g %gl%g %gM%g %gl%g %g", x, y, w, h, x+w, y, -w, h)
}

// ----------------------------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------------------------

// Route is the path a unit drives, in plan coordinates.
//
// A loop is driven end to start, forever. Anything else is a shuttle: the unit reaches the
// last point and comes back the way it went, which is what a delivery, a sample transfer or
// a cleaning pass actually is. Neither wanders, so a trail on the map is a path somebody
// could have dispatched rather than a random walk that merely looks busy.
type Route struct {
	Points []fleet.Point
	Loop   bool
}

func pt(x, y float64) fleet.Point { return fleet.Point{X: x, Y: y} }

// route drops repeated points, so a helper may name a corner that happens to coincide with
// the one before it without leaving a zero-length leg for the simulator to divide by.
func route(loop bool, points ...fleet.Point) Route {
	out := make([]fleet.Point, 0, len(points))
	for _, p := range points {
		if n := len(out); n > 0 && out[n-1] == p {
			continue
		}
		out = append(out, p)
	}
	return Route{Points: out, Loop: loop}
}

func loop(points ...fleet.Point) Route { return route(true, points...) }

// errand is a delivery: out of the service area, along the corridor, and in through one
// room's door. The dog-leg at the door matters: a robot enters a room through its doorway,
// not through the wall nearest the lift.
func errand(from fleet.Point, corridorY, doorX, roomY float64) Route {
	return route(false,
		from,
		pt(from.X, corridorY),
		pt(doorX, corridorY),
		pt(doorX, roomY),
	)
}

// serpentine covers a rectangle in parallel passes, the boustrophedon path a floor scrubber
// drives, turning at the end of each lane into the next one.
func serpentine(x0, y0, x1, y1 float64, lanes int) Route {
	points := make([]fleet.Point, 0, lanes*2)
	for i := range lanes {
		y := y0
		if lanes > 1 {
			y = y0 + (y1-y0)*float64(i)/float64(lanes-1)
		}
		near, far := x0, x1
		if i%2 == 1 {
			near, far = x1, x0
		}
		points = append(points, pt(near, y), pt(far, y))
	}
	return route(false, points...)
}
