import { describe, expect, it } from "vitest";
import { unitActions } from "./actions";
import type { Unit, UnitState } from "./types";

function unit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: "PUD-101",
    name: "Room Service 1",
    series: "Delivery AMR",
    siteId: "hotel",
    floor: "F1",
    zone: "Corridor A",
    pose: { x: 0, y: 0, heading: 0 },
    trail: [],
    state: "active",
    task: "Delivery to Room 112",
    taskProgress: 0.5,
    elapsed: "1m 00s",
    battery: 80,
    voltage: 25,
    subsystems: {},
    ...overrides,
  };
}

const blocked = (state: UnitState, u = unit()) =>
  Object.fromEntries(unitActions(u, state).map((a) => [a.command, a.blockedBy]));

// A control that cannot act always says why.
//
// Prevents the defect this whole model exists to avoid. A present but dead button makes an
// operator press it, see nothing happen, and from then on distrust every other control on
// the screen. Greying out answers "no"; only the reason answers "why", and without it the
// operator has no next step.
it("gives every blocked action a reason", () => {
  const states: UnitState[] = [
    "active",
    "idle",
    "charging",
    "error",
    "offline",
    "stopped",
    "estop",
  ];

  for (const state of states) {
    for (const action of unitActions(unit({ battery: 50 }), state)) {
      if (action.blockedBy !== null) expect(action.blockedBy.length).toBeGreaterThan(0);
    }
  }
});

describe("availability", () => {
  it("offers nothing to a unit that stopped reporting", () => {
    const reasons = blocked("offline");
    expect(Object.values(reasons).every((reason) => reason !== null)).toBe(true);
  });

  // Prevents an operator chasing a unit the facility E-stop already holds. The fix is in
  // the header, and the reason has to point there rather than leaving them clicking.
  it("sends a held unit back to the facility control", () => {
    expect(blocked("estop").resume).toMatch(/header/);
  });

  // Prevents resuming around a fault. The unit will not move until the condition clears, so
  // offering Resume would promise something the fleet cannot deliver.
  it("requires a fault to be cleared before resume or start", () => {
    const reasons = blocked("error");
    expect(reasons.resume).toMatch(/fault/i);
    expect(reasons.start).toMatch(/fault/i);
  });

  it("allows stop and dock on a healthy working unit", () => {
    const reasons = blocked("active");
    expect(reasons.stop).toBeNull();
    expect(reasons.dock).toBeNull();
    expect(reasons.start).toMatch(/Busy/);
  });

  // Prevents sending a unit to a dock it is already on, and re-issuing a return the battery
  // policy has already started.
  it("refuses to re-dock a unit that is already there or on its way", () => {
    expect(blocked("charging").dock).toMatch(/Already at a dock/);
    expect(blocked("active", unit({ task: "Forced return to dock" })).dock).toMatch(
      /Already returning/,
    );
  });

  // Prevents starting work on a unit that would not survive it.
  it("holds a charging unit back until 80%", () => {
    expect(blocked("charging", unit({ battery: 64 })).start).toMatch(/80%/);
    expect(blocked("charging", unit({ battery: 88 })).start).toBeNull();
  });
});
