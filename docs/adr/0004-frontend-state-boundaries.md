# ADR 0004 — Separate server state from view state

## Context

The frontend is one screen with three columns reading the same data at the same instant.
Two risks follow: each panel deriving its own interpretation of a unit's state, and server
state and UI state being written by the same code.

## Decision

**Derive once per frame.** `deriveFleet(snapshot)` produces the state, bucket, triage rank
and status text for each unit. All three columns render that result.

**Server state lives in the query cache** and is written only by the stream client. View
state — selection, filters, zoom, theme, pending confirmations — lives in a reducer. The two
do not overlap.

**No optimistic updates.** A command is accepted, not applied; the screen changes when the
server reports the change.

**Safety rules are structural**, not conventions: status colours are tone classes, a blocked
control carries its reason as a domain field, and the emergency-stop invariant has a test.

## Rejected

- **A state management library (Redux Toolkit, Zustand).** View state is one reducer of
  about 150 lines, and server state is already in a cache that tracks request status. A
  store between them would have to resolve precedence on every frame.
- **Optimistic updates with rollback.** A rollback is a second incorrect statement about the
  fleet. On a control surface, the correct answer to "did it work" is "the robot has not
  reported yet".
- **A router.** One screen. Selection lives in the reducer rather than the URL, which costs
  deep links; restoring them is about thirty lines when a second screen needs them.

## Consequences

Derivation runs over the whole fleet on every frame. At this size it takes microseconds;
past a few thousand units it would need per-unit memoisation.
