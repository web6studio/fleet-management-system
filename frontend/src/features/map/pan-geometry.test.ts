import { describe, expect, it } from "vitest";
import { centreOn, clampPan, panLimits } from "./pan-geometry";

const frame = { width: 800, height: 640 };

describe("panLimits", () => {
  it("allows no travel at all when the plan fits", () => {
    expect(panLimits(frame, 1)).toEqual({ x: 0, y: 0 });
  });

  it("allows half the overflow in each direction", () => {
    expect(panLimits(frame, 2)).toEqual({ x: 400, y: 320 });
    expect(panLimits(frame, 1.5)).toEqual({ x: 200, y: 160 });
  });
});

// The plan can never be dragged off its own frame.
//
// Prevents the drag that ends with the operator looking at empty stage background. A map
// that can be lost by overshooting is a map people stop touching, which costs the zoom its
// entire reason to exist.
describe("clampPan", () => {
  it("pins an overshoot to the edge", () => {
    expect(clampPan({ x: 9_999, y: 9_999 }, frame, 2)).toEqual({ x: 400, y: 320 });
    expect(clampPan({ x: -9_999, y: -9_999 }, frame, 2)).toEqual({ x: -400, y: -320 });
  });

  it("leaves a legitimate offset alone", () => {
    expect(clampPan({ x: 120, y: -80 }, frame, 2)).toEqual({ x: 120, y: -80 });
  });

  it("holds the plan still when there is nothing to pan", () => {
    expect(clampPan({ x: 120, y: -80 }, frame, 1)).toEqual({ x: 0, y: 0 });
  });
});

describe("centreOn", () => {
  // Prevents the sign and scale errors that are invisible until someone notices the view
  // settles next to the selected unit rather than on it.
  it("leaves the middle of the plan where it is", () => {
    expect(centreOn({ x: 0.5, y: 0.5 }, frame, 2)).toEqual({ x: 0, y: 0 });
  });

  it("pulls a unit left of centre towards the middle", () => {
    // A quarter of the way across, at 2×: 0.25 × 800 × 2 = 400 to the right, which is also
    // the limit, so the clamp and the formula agree at the extreme.
    expect(centreOn({ x: 0.25, y: 0.5 }, frame, 2)).toEqual({ x: 400, y: 0 });
  });

  it("never exposes blank space beside a unit near the edge", () => {
    const limit = panLimits(frame, 2);
    const corner = centreOn({ x: 0.02, y: 0.98 }, frame, 2);
    expect(Math.abs(corner.x)).toBeLessThanOrEqual(limit.x);
    expect(Math.abs(corner.y)).toBeLessThanOrEqual(limit.y);
  });

  it("does nothing at all when the plan fits the frame", () => {
    expect(centreOn({ x: 0.1, y: 0.9 }, frame, 1)).toEqual({ x: 0, y: 0 });
  });
});
