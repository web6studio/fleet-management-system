import type { FloorPlan } from "../../domain/plan";
import type { Point, Pose } from "../../domain/types";

/**
 * Turning plan coordinates into something the browser can draw.
 *
 * Only the map needs any of this. The conversions an operator *reads* — metres, world y —
 * are domain and live in `domain/plan.ts`.
 */

/**
 * Plan coordinates to screen, as percentages rather than pixels.
 *
 * The browser resolves a percentage against the frame the SVG viewBox already fills, so the
 * plan can be any size on screen without a resize observer measuring it first.
 */
export function toPercent(point: Point, plan: FloorPlan): { left: string; top: string } {
  return {
    left: `${((point.x / plan.width) * 100).toFixed(2)}%`,
    top: `${((point.y / plan.height) * 100).toFixed(2)}%`,
  };
}

/** Heading in degrees clockwise, which is the direction an SVG rotation turns. */
export function headingDegrees(pose: Pose): number {
  return Number(((-pose.heading * 180) / Math.PI).toFixed(1));
}

/**
 * How much of a unit's path the map draws, and how hard it fades towards the oldest end.
 *
 * The server keeps a full minute. Drawing all of it for every unit buries a busy floor under
 * its own history, so only the selection gets the whole route — and the fade is what lets
 * two paths that cross be told apart at the crossing, because the fresher one is brighter.
 */
export const TRAIL = {
  /** The selected unit's whole route, faded gently so it stays readable end to end. */
  selected: { samples: 60, faintest: 0.4 },
  /** Everyone else: enough to say where they came from, faded hard so crossings read. */
  others: { samples: 36, faintest: 0.1 },
} as const;

/**
 * Pieces per trail. Enough that the ramp reads as continuous at this scale, few enough that
 * a floor of a dozen units stays a few dozen paths rather than several hundred.
 */
const PIECES = 6;

export interface TrailSegment {
  d: string;
  /** Multiplier on the trail's own stroke opacity: 1 at the unit, `faintest` at the tail. */
  opacity: number;
}

export interface TrailStyle {
  samples: number;
  faintest: number;
}

/**
 * A unit's recent path, cut into pieces that fade towards the oldest end.
 *
 * Cut rather than given a gradient because an SVG gradient runs in a straight line across
 * the shape's box, while a trail turns corners — a scrubber's lane reversal would come out
 * brightest in the middle. Consecutive pieces share their joining point, so the ramp has no
 * gaps in it.
 */
export function trailSegments(
  trail: readonly Point[],
  current: Point,
  { samples, faintest }: TrailStyle,
): TrailSegment[] {
  const points = [...trail.slice(-samples), current];
  const legs = points.length - 1;
  if (legs < 1) return [];

  const pieces = Math.min(PIECES, legs);
  const out: TrailSegment[] = [];

  for (let i = 0; i < pieces; i += 1) {
    const from = Math.floor((i * legs) / pieces);
    const to = Math.floor(((i + 1) * legs) / pieces);
    const slice = points.slice(from, to + 1);
    if (slice.length < 2) continue;
    out.push({
      d: `M${slice.map((p) => `${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join(" L")}`,
      opacity: Number((faintest + ((1 - faintest) * (i + 1)) / pieces).toFixed(3)),
    });
  }
  return out;
}

/**
 * Radius of the uncertainty circle, in plan units.
 *
 * Scaled from the confidence the unit publishes: at 42% it is a wide circle, at 69% a narrow
 * one. It shows where the unit believes it is — never a status, which is why it is drawn
 * grey and dashed rather than in a status colour.
 */
export function uncertaintyRadius(confidence: number): number {
  return Math.round((1 - confidence) * 150);
}

/** The same uncertainty, phrased for the marker label. */
export function uncertaintyMetres(confidence: number): number {
  return Math.round((1 - confidence) * 7);
}
