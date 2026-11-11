import { describe, expect, it } from "vitest";
import { bandOf, formatMinutes, runtimeMinutes, willItFinish } from "./battery";
import type { Unit } from "./types";

function unit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: "PUD-152",
    name: "Room Service 8",
    series: "Delivery AMR",
    siteId: "hotel",
    floor: "F3",
    zone: "South wing",
    pose: { x: 0, y: 0, heading: 0 },
    trail: [],
    state: "active",
    task: "Delivery to Room 318",
    taskProgress: 0.88,
    elapsed: "7m 25s",
    eta: "≈ 2 min left",
    battery: 16,
    voltage: 23.4,
    subsystems: {},
    ...overrides,
  };
}

describe("bandOf", () => {
  // Prevents an off-by-one at a threshold an operator plans around: 30% is still low, 31%
  // is normal, and the band is what decides whether a task gets cancelled.
  it("places each boundary on the side the policy expects", () => {
    expect(bandOf(31)).toBe("normal");
    expect(bandOf(30)).toBe("low");
    expect(bandOf(15)).toBe("low");
    expect(bandOf(14)).toBe("critical");
    expect(bandOf(5)).toBe("critical");
    expect(bandOf(4)).toBe("emergency");
  });
});

describe("runtimeMinutes", () => {
  // No runtime estimate is ever invented.
  //
  // Prevents the failure that makes a diagnostics panel actively harmful. An operator plans
  // a shift around this number. A unit on charge is gaining, not spending; a silent unit is
  // not reporting at all. In both cases a blank is the only honest answer.
  it("returns nothing for a unit that is charging or silent", () => {
    expect(runtimeMinutes(unit(), "charging")).toBeNull();
    expect(runtimeMinutes(unit(), "offline")).toBeNull();
    expect(runtimeMinutes(unit(), "active")).not.toBeNull();
  });

  // An idle unit is not driving, so the same charge lasts longer. Using one rate for both
  // would under-report every parked unit and send them to dock early.
  it("expects an idle unit to last longer than a driving one", () => {
    const driving = runtimeMinutes(unit({ battery: 60 }), "active") ?? 0;
    const parked = runtimeMinutes(unit({ battery: 60 }), "idle") ?? 0;
    expect(parked).toBeGreaterThan(driving);
  });
});

describe("willItFinish", () => {
  // Prevents the callout appearing where it answers nothing. On a healthy battery the
  // percentage already answers the question, and a reassurance nobody asked for is noise
  // that teaches operators to skip the panel.
  it("speaks only for a working unit that is running down", () => {
    expect(willItFinish(unit({ battery: 80 }), "active")).toBeNull();
    expect(willItFinish(unit({ battery: 16 }), "idle")).toBeNull();
    expect(willItFinish(unit({ battery: 16 }), "active")).toContain("Docks automatically");
  });

  it("says the task will be cancelled below the critical band", () => {
    expect(willItFinish(unit({ battery: 9 }), "active")).toContain("cancels the task");
  });
});

describe("formatMinutes", () => {
  it("reads as an operator would say it", () => {
    expect(formatMinutes(42)).toBe("42 min");
    expect(formatMinutes(125)).toBe("2h 05m");
  });
});
