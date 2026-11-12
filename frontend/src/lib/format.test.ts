import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDuration,
  formatHeading,
  formatMetres,
  formatPercent,
  formatSpeed,
} from "./format";

describe("formatDuration", () => {
  it("pads the seconds so a column of ages stays aligned", () => {
    expect(formatDuration(5)).toBe("0m 05s");
    expect(formatDuration(134)).toBe("2m 14s");
  });

  // Prevents "-1m -3s" on screen. Clock skew between the server and this browser can make
  // an age momentarily negative, and the honest reading of that is zero rather than a
  // number that cannot exist.
  it("never reports a negative age", () => {
    expect(formatDuration(-7)).toBe("0m 00s");
  });
});

// A heading is always a compass bearing, never a negative one.
//
// Prevents "-90°" in the telemetry panel. Headings arrive in radians measured
// counter-clockwise and go negative either side of east; an operator reading a bearing out
// loud to someone standing on the floor needs 0-359.
describe("formatHeading", () => {
  it("normalises every angle into 0-359", () => {
    expect(formatHeading(0)).toBe("0°");
    expect(formatHeading(-Math.PI / 2)).toBe("270°");
    expect(formatHeading(Math.PI)).toBe("180°");
    expect(formatHeading(3 * Math.PI)).toBe("180°");
  });
});

describe("the figures an operator reads", () => {
  it("keeps two decimals on distances and speeds", () => {
    expect(formatMetres(47.5)).toBe("47.50 m");
    expect(formatSpeed(0.8)).toBe("0.80 m/s");
  });

  it("renders a confidence as a whole percentage", () => {
    expect(formatPercent(0.42)).toBe("42%");
    expect(formatPercent(1)).toBe("100%");
  });

  it("reads a timestamp as a 24-hour wall clock", () => {
    const noon = new Date(2026, 10, 11, 14, 3, 7).getTime();
    expect(formatClock(noon)).toBe("14:03:07");
  });
});
