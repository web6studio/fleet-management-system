export interface Offset {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** A position within the plan, 0–1 on each axis. */
export interface PanFocus {
  x: number;
  y: number;
}

/**
 * The arithmetic behind dragging the plan, kept apart from the event plumbing so it can be
 * checked without a DOM.
 *
 * The transform is `translate(offset) scale(zoom)` about the frame's centre. Translation is
 * applied in the parent's unscaled pixels, which is why the centring formula multiplies by
 * zoom and the limits do not.
 */

/**
 * How far the content may travel before its edge would show inside the frame.
 *
 * At zoom z the content is z times the frame, so there is `(z - 1) × frame` of overflow,
 * half of it on each side.
 */
export function panLimits(frame: Size, zoom: number): Offset {
  if (zoom <= 1) return { x: 0, y: 0 };
  return { x: ((zoom - 1) * frame.width) / 2, y: ((zoom - 1) * frame.height) / 2 };
}

export function clampPan(offset: Offset, frame: Size, zoom: number): Offset {
  const limit = panLimits(frame, zoom);
  return {
    x: clamp(offset.x, limit.x),
    y: clamp(offset.y, limit.y),
  };
}

function clamp(value: number, limit: number): number {
  const bounded = Math.max(-limit, Math.min(limit, value));
  // Negating zero yields -0, which is harmless in a transform and surprising everywhere
  // else — including in a test's expectations. Normalised here rather than at each caller.
  return bounded === 0 ? 0 : bounded;
}

/**
 * The offset that brings a point of the plan to the middle of the frame.
 *
 * Clamped, so centring on a unit near an edge moves as far as it can rather than exposing
 * blank space beside the plan.
 */
export function centreOn(focus: PanFocus, frame: Size, zoom: number): Offset {
  return clampPan(
    {
      x: -(focus.x - 0.5) * frame.width * zoom,
      y: -(focus.y - 0.5) * frame.height * zoom,
    },
    frame,
    zoom,
  );
}
