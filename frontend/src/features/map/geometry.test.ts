import { describe, expect, it } from "vitest";
import type { Point } from "../../domain/types";
import { TRAIL, type TrailSegment, trailSegments } from "./geometry";

const style = { samples: 60, faintest: 0.1 };

/** A straight run of `n` samples, one plan unit apart. */
function run(n: number): Point[] {
  return Array.from({ length: n }, (_, i) => ({ x: i, y: 0 }));
}

function ends(segment: TrailSegment): { first: string; last: string } {
  const points = segment.d.replace("M", "").split(" L");
  return { first: points[0] ?? "", last: points[points.length - 1] ?? "" };
}

// A trail never breaks into disconnected pieces.
//
// Prevents the defect the fade introduces and nothing else would catch: the path is cut into
// segments so each can carry its own opacity, and an off-by-one in the cut leaves gaps every
// few samples. On screen that is not an obvious bug: it reads as a dotted line, which is
// exactly what an unselected trail already looks like.
describe("trailSegments", () => {
  it("hands each piece on to the next at the same point", () => {
    const segments = trailSegments(run(40), { x: 40, y: 0 }, style);
    expect(segments.length).toBeGreaterThan(1);

    for (let i = 1; i < segments.length; i += 1) {
      const previous = ends(segments[i - 1] as TrailSegment);
      const current = ends(segments[i] as TrailSegment);
      expect(current.first).toBe(previous.last);
    }
  });

  // Prevents the ramp running the wrong way, which would dim the unit's current position
  // and leave the oldest history as the brightest thing on the plan.
  it("brightens towards the unit and reaches full strength at it", () => {
    const segments = trailSegments(run(40), { x: 40, y: 0 }, style);
    const opacities = segments.map((segment) => segment.opacity);

    expect(opacities).toEqual([...opacities].sort((a, b) => a - b));
    expect(opacities.at(0)).toBeGreaterThan(0);
    expect(opacities.at(-1)).toBe(1);
  });

  it("fades the selection less hard than the rest of the floor", () => {
    const [selected] = trailSegments(run(40), { x: 40, y: 0 }, TRAIL.selected);
    const [other] = trailSegments(run(40), { x: 40, y: 0 }, TRAIL.others);
    expect(selected?.opacity).toBeGreaterThan(other?.opacity ?? 1);
  });

  // Prevents the whole minute being drawn for every unit, which is the clutter the two
  // budgets exist to avoid.
  it("draws only the most recent samples", () => {
    const segments = trailSegments(run(200), { x: 200, y: 0 }, { samples: 10, faintest: 0.1 });
    const oldest = ends(segments[0] as TrailSegment).first;
    expect(oldest).toBe("190 0");
  });

  it("draws nothing at all for a unit that has not moved yet", () => {
    expect(trailSegments([], { x: 5, y: 5 }, style)).toEqual([]);
  });

  it("still joins up when there are fewer samples than pieces", () => {
    const segments = trailSegments(run(3), { x: 3, y: 0 }, style);
    expect(segments.length).toBeGreaterThan(0);
    expect(ends(segments.at(-1) as TrailSegment).last).toBe("3 0");
  });
});
