# ADR 0003: WebSocket for telemetry, HTTP for commands

## Context

The frontend needs server-pushed telemetry at 1 Hz and a way to send commands. The fleet is
shared mutable state: an emergency stop issued on one screen must appear on all others.

## Decision

Split by what the traffic is, not by what the transport supports.

**HTTP** carries requests that need a response. A command needs a status code, an
idempotency key, an audit record and a rate limit, all of which HTTP and the proxies in
front of it already provide.

**WebSocket** carries server-pushed state: a snapshot on connect, then one frame per change.
Each frame carries a version that increments by one. A client receiving
`version > local + 1` sends `resync` and ignores deltas until a snapshot arrives. Heartbeats
carry the version, so an idle client detects a gap within 15 seconds.

Commands return `202 Accepted`. The unit's next telemetry frame confirms the result, so no
mutation writes an optimistic update.

## Rejected

- **Server-Sent Events.** Sufficient for telemetry, but has no client-to-server channel, so
  `resync` would need a separate HTTP call racing the stream it repairs.
- **SSE for events plus a WebSocket for pose.** Two connections, two authentication paths
  and two reconnection strategies for a channel carrying about one percent of the bytes.
- **Polling.** Does not scale past this fleet size, and a poll races the stream it would
  eventually need.
- **Commands over the WebSocket.** Loses status codes, retry semantics and every proxy that
  understands HTTP.

## Consequences

The server holds one connection per operator, which bounds how many fit on an instance.
Dropping frames for slow subscribers is required, and is only safe because versions make the
loss detectable.
