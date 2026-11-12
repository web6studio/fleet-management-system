// Package fleet is the domain: what a unit is, what an alarm is, and the one store that
// holds the current truth about both. It knows nothing about HTTP or WebSockets.
package fleet

// State is what a vendor reports about a unit.
//
// An operator stop and a facility emergency stop are deliberately absent: those are things
// done to a unit, not things it reports, and the client folds them in when it derives what
// to show. Keeping them out of this type is what stops a command from being mistaken for
// telemetry.
type State string

const (
	StateActive   State = "active"
	StateIdle     State = "idle"
	StateCharging State = "charging"
	StateError    State = "error"
	StateOffline  State = "offline"
)

// Health is a subsystem's condition. A subsystem the vendor never mentions is absent from
// Subsystems entirely. That is a capability gap, never a fault.
type Health string

const (
	HealthOK    Health = "ok"
	HealthFault Health = "fault"
)

type Subsystems struct {
	Lidar   Health `json:"lidar,omitempty"`
	Bumper  Health `json:"bumper,omitempty"`
	Drive   Health `json:"drive,omitempty"`
	Payload Health `json:"payload,omitempty"`
}

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Pose is a position on a floor plan with a heading in radians counter-clockwise from +x.
type Pose struct {
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Heading float64 `json:"heading"`
}

type Unit struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Series string  `json:"series"`
	SiteID string  `json:"siteId"`
	Floor  *string `json:"floor"`
	Zone   string  `json:"zone"`
	Pose   *Pose   `json:"pose"`
	// Trail is the recent path in plan coordinates, oldest first.
	Trail        []Point    `json:"trail"`
	State        State      `json:"state"`
	Activity     string     `json:"activity,omitempty"`
	Task         *string    `json:"task"`
	TaskProgress *float64   `json:"taskProgress"`
	Elapsed      string     `json:"elapsed"`
	ETA          string     `json:"eta,omitempty"`
	NextTask     string     `json:"nextTask,omitempty"`
	Battery      float64    `json:"battery"`
	Voltage      float64    `json:"voltage"`
	Speed        float64    `json:"speed"`
	Localization *float64   `json:"localization,omitempty"`
	ErrorCode    string     `json:"errorCode,omitempty"`
	SilentFor    *int       `json:"silentFor,omitempty"`
	Subsystems   Subsystems `json:"subsystems"`
}

type Severity int

const (
	Sev1 Severity = 1
	Sev2 Severity = 2
	Sev3 Severity = 3
)

type Alarm struct {
	Seq      int64    `json:"seq"`
	SiteID   string   `json:"siteId"`
	Time     string   `json:"time"`
	Severity Severity `json:"severity"`
	Kind     string   `json:"kind"`
	// UnitID is nil for facility-wide alarms: the point of those is that they are one
	// fault rather than one per silent unit.
	UnitID *string `json:"unitId"`
	Detail string  `json:"detail"`
	// AcknowledgedBy is server state. An alarm owned on one screen is owned on every
	// screen, and ownership is first-writer-wins.
	AcknowledgedBy *string `json:"acknowledgedBy"`
}

// ShapeKind is what a rectangle on a floor plan represents. The console styles each kind
// differently, so a plan is drawn from these rather than from colours baked into fixtures.
type ShapeKind string

const (
	KindSlab     ShapeKind = "slab"
	KindRoom     ShapeKind = "room"
	KindCorridor ShapeKind = "corridor"
	KindDoor     ShapeKind = "door"
	KindBay      ShapeKind = "bay"
	KindWall     ShapeKind = "wall"
	KindFixture  ShapeKind = "fixture"
)

type PlanRect struct {
	Kind ShapeKind `json:"kind"`
	X    float64   `json:"x"`
	Y    float64   `json:"y"`
	W    float64   `json:"w"`
	H    float64   `json:"h"`
	RX   float64   `json:"rx,omitempty"`
}

type PlanLabel struct {
	Text string  `json:"text"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

type FloorPlan struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	// UnitsPerMetre converts plan coordinates to building metres.
	UnitsPerMetre float64     `json:"unitsPerMetre"`
	Rects         []PlanRect  `json:"rects"`
	Paths         []string    `json:"paths"`
	Labels        []PlanLabel `json:"labels"`
}

type Site struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Floors lists the highest storey first, the order a building is read in.
	Floors []string `json:"floors"`
	// Plans is one plan per storey, keyed by floor id.
	//
	// Storeys of one building are not alike: a dock level is not a guest corridor. Drawing a
	// single plan for all of them puts robots in rooms that do not exist on the floor being
	// shown.
	Plans map[string]FloorPlan `json:"plans"`
}

// FacilityStop records a facility-wide emergency stop and when it was ordered.
type FacilityStop struct {
	SiteID string `json:"siteId"`
	Since  int64  `json:"since"`
}

// Command is an instruction for one unit. It is accepted, never applied synchronously: the
// unit's next telemetry frame is what confirms it.
type Command string

const (
	CommandStop   Command = "stop"
	CommandResume Command = "resume"
	CommandStart  Command = "start"
	CommandDock   Command = "dock"
)

func ParseCommand(s string) (Command, bool) {
	switch Command(s) {
	case CommandStop, CommandResume, CommandStart, CommandDock:
		return Command(s), true
	default:
		return "", false
	}
}

// Snapshot is one consistent view of the fleet, and the payload of both GET /fleet and the
// stream's snapshot frame.
type Snapshot struct {
	Version       int64          `json:"version"`
	ServerTime    int64          `json:"serverTime"`
	Units         []Unit         `json:"units"`
	Alarms        []Alarm        `json:"alarms"`
	FacilityStops []FacilityStop `json:"facilityStops"`
	UnitStops     []string       `json:"unitStops"`
}

// NonNil keeps a required list a list.
//
// A nil slice marshals to `null`, which forces every client to special-case "no trail" and
// "nothing is stopped". Every list in this package's wire types is required by the contract.
func NonNil[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return items
}

// Operational constants the server enforces when it validates a command.
const (
	// StartTaskMinBattery is the charge a docked unit must reach before it may be re-tasked.
	StartTaskMinBattery = 80.0
	// DockZone is the zone a unit reports while it sits on a charging bay.
	DockZone = "Dock"
	// ForcedReturnTask is the task the battery policy assigns when it cancels work.
	ForcedReturnTask = "Forced return to dock"
)
