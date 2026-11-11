# WebSocket stream

`GET /api/v1/stream`

Carries server-pushed state changes. Requests that need a response go over HTTP — see
[openapi.yaml](openapi.yaml) and
[ADR 0003](../adr/0003-websocket-for-telemetry-http-for-commands.md).

## Frames

Each frame is a JSON object with a `type` field. Clients must ignore unknown types so the
server can add one without a client release.

### Server to client

| `type` | Payload | Sent |
|---|---|---|
| `snapshot` | `version`, `serverTime`, `units`, `alarms`, `facilityStops`, `unitStops` | On connect and in response to `resync` |
| `units` | `version`, `serverTime`, `units` (changed only, no `trail`) | Every telemetry tick |
| `alarms` | `version`, `serverTime`, `alarms` (changed only) | On raise or acknowledgement |
| `commands` | `version`, `serverTime`, `facilityStops`, `unitStops` | When an operator stops or releases a unit or facility |
| `heartbeat` | `version`, `serverTime` | Every 15 s while idle |

`snapshot` uses the same schema as `GET /api/v1/fleet`.

### Trails

Units in a `units` frame omit `trail`. A trail grows by one point per tick, so sending the
whole history every second re-sends what the client already has — about 70% of the frame.

The client reconstructs it: when a unit's pose changes, the position it just left becomes
the newest trail point. A unit whose pose is unchanged keeps its trail, because the server
only records a point while a unit is driving.

Both sides cap the trail at **60 points**. The values must match: the client has no other
way to know the server's window. A `snapshot` carries the full trail, so a resync repairs
any drift.

### Client to server

| `type` | Meaning |
|---|---|
| `resync` | Request a full snapshot |

Commands are not sent over the WebSocket.

## Versioning

`version` is monotonic and increments by one per published change. Each frame carries the
version after the change was applied. The client tracks the last version it applied:

| Condition | Action |
|---|---|
| `frame.version == local + 1` | Apply the frame |
| `frame.version <= local` | Duplicate; ignore |
| `frame.version > local + 1` | Gap; send `resync` and ignore deltas until the snapshot arrives |

Heartbeats carry the version, so an idle client detects a missed frame within 15 seconds.

The server drops frames for subscribers that cannot keep up. Version tracking is what makes
that safe.

## Reconnection

Exponential backoff with full jitter: `random(0, min(cap, base * 2^n))`, base 500 ms, cap
15 s. Jitter prevents all clients reconnecting simultaneously after a server restart.

Reconnection always begins with a fresh `snapshot`, because the client cannot know what it
missed while disconnected.

Connection state refers to the client's connection, not to the robots:

| State | Meaning |
|---|---|
| `connecting` | First attempt, nothing rendered yet |
| `live` | Frames arriving |
| `reconnecting` | Disconnected, retrying; displayed data is ageing |
| `offline` | Still retrying; displayed data is the last known state |

## Keepalive

The server sends a `heartbeat` every 15 seconds in addition to the library's ping/pong. The
interval is below the 60-second idle timeout applied by a default nginx ingress.
