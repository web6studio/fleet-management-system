# ADR 0002 — Simulate telemetry inside the server, behind a package boundary

## Context

There is no robot fleet to connect to. Telemetry has to come from somewhere, and that
choice determines how much of the system runs on real code paths.

## Decision

`internal/sim` calls `store.ApplyTelemetry`, the same entry point a real ingest path uses.
Versioning, ordering, gap detection, command validation, the stream and the frontend all run
unmodified. `fleet.Unit` carries no provenance.

## Rejected

- **Fixtures in the browser.** Removes the server from the demo, along with the versioning
  and reconnection logic.
- **A separate producer over MQTT.** The production shape, but it adds a broker and a second
  deployable for a seam that is one function call wide.
- **Replaying recorded telemetry.** More realistic motion, but no control over the states
  that matter: low battery, stuck unit, facility outage.

## Consequences

No ingest path is exercised: no batching, no producer validation, no rate limiting. See
[simulation.md](../simulation.md) for the full list and for what replacing the package
involves.
