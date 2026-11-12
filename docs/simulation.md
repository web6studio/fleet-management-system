# Simulated telemetry

`internal/sim` replaces the robot fleet. It loads units from `fixtures.json`, updates
positions once per second, and passes changed units to the store through
`store.ApplyTelemetry` — the same entry point a real ingest path would use.

Everything downstream runs unmodified: versioning, ordering, gap detection, command
validation, the WebSocket stream and the frontend. `fleet.Unit` carries no indication of
where a frame came from.

## Fleet

Five series across three facilities. The ID prefix identifies the vendor where there is a
recognisable one:

| Prefix | Series | Based on |
|---|---|---|
| `PUD` | Delivery AMR | PuDu Robotics tray robots |
| `GAU` | Scrubber | Gausium floor scrubbers |
| `ORI` | Guide robot | OrionStar lobby robots |
| `KLI` | Ward runner | Hospital logistics robots (Aethon, Swisslog, Moxi) |
| `TRM` | Concourse assistant | Airport guidance robots (LG CLOi, Ottonomy) |

Vendor protocols are not simulated; all series arrive as the same `fleet.Unit`. What differs
is the signal set. Guide robots report no pose, so they cannot be drawn on a floor plan: the
UI shows them with a dashed tag reading *No position · Lobby*, and the map legend reports
how many units are affected.

The fixture set is deterministic: two units in error, one running low on battery
mid-delivery, one that stopped reporting, two without pose.

## Movement

Each unit follows a route defined against the floor plan it operates on. Delivery robots run
from the service lift along a corridor and into a room; scrubbers cover open floor in
parallel passes; concourse assistants patrol a circuit.

No path planning, collision avoidance or replanning. A test samples every route against its
plan and fails if a segment crosses a wall anywhere other than a doorway.

## Floor plans

Nine storeys, defined in `internal/sim/plans.go` and served per floor with each site. They
are code rather than data because each floor's routes are derived from the same constants as
its walls, which keeps the two consistent.

A production system would serve the occupancy grid the robots generate, rendered through a
Leaflet `L.CRS.Simple` layer. The coordinate frame is the same, so only the rendering layer
changes.

## Alarms

Alarms come from fixtures and are only acknowledged, never generated. A production system
derives them from telemetry on a server-side timer: pose unchanged while reporting active is
"not moving", a facility going silent within a few seconds is one outage rather than N.

## Limitations

- No ingest path: no batching, no producer validation, no per-unit rate limiting.
- Movement is scripted, as described above.
- `start` and `dock` are accepted but change nothing — there is no task queue.
- No persistence. State is held in a map behind a mutex and lost on restart.

## Replacing it

Write a producer that calls `store.ApplyTelemetry` with `fleet.Unit` values and delete this
package. For MQTT: subscribe to the vendor topics, map each payload to a `Unit`, and leave
unsupported fields absent. `cmd/server` changes by one line. Nothing in `internal/fleet`,
`internal/api` or the frontend changes.
