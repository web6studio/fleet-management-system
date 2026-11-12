# ADR 0005: Render floor plans as SVG, one per storey

## Context

The spatial question indoors is which room, not which coordinates on Earth, so a map tile
stack does not apply. Telemetry arrives at 1 Hz and the display refreshes at 60 Hz, so
markers must interpolate between readings.

## Decision

Each storey has its own plan, keyed by floor ID and served with the site. The server fails
to start if a facility lists a floor without a plan.

Three layers: the plan as one SVG, trails as paths within it, and markers as HTML buttons
positioned over it. Markers are buttons so that selection, focus and keyboard access come
from the platform rather than from hit testing. Pan and zoom write a transform through a
ref, not through React state.

Plans are defined in code using a small set of helpers, because each floor's robot routes
are derived from the same constants as its walls. A test samples every route against its
plan and fails on a segment that crosses a wall outside a doorway.

## Rejected

- **Canvas.** Faster for thousands of moving objects, but at this scale it costs hit
  testing, text rendering, focus management and accessibility, which SVG and HTML provide.
- **Leaflet with `L.CRS.Simple`.** The target once plans are real occupancy grids. Adding it
  now provides pan, zoom and tiling that three hundred lines already cover. The coordinate
  frame is the same, so the rendering layer can be swapped later.
- **One plan per facility.** Cheaper to author, but a dock level is not a guest corridor, and
  a shared plan places robots in rooms that do not exist on the displayed floor.

## Consequences

Plans are authored by hand, so they can contain errors no test detects. The wall-crossing
test covers routes, not whether a room is positioned plausibly.
