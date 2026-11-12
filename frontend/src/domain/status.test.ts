import { describe, expect, it } from "vitest";
import {
  BUCKETS,
  byTriage,
  countBuckets,
  countNeedingAttention,
  deriveFleet,
  floorToOpen,
} from "./status";
import type { FleetSnapshot, ReportedState, Unit } from "./types";

function unit(id: string, overrides: Partial<Unit> = {}): Unit {
  return {
    id,
    name: id,
    series: "Test",
    siteId: "hotel",
    floor: "F1",
    zone: "Corridor A",
    pose: { x: 0, y: 0, heading: 0 },
    trail: [],
    state: "active" as ReportedState,
    task: null,
    taskProgress: null,
    elapsed: "0m 00s",
    battery: 80,
    voltage: 25,
    subsystems: {},
    ...overrides,
  };
}

function snapshot(units: Unit[], overrides: Partial<FleetSnapshot> = {}): FleetSnapshot {
  return {
    version: 1,
    serverTime: 0,
    units,
    alarms: [],
    facilityStops: [],
    unitStops: [],
    ...overrides,
  };
}

// The four barometer counters always add up to the fleet.
//
// Prevents the defect that makes a status summary worse than no summary. Seven states
// collapse into four counters, and if any state landed in two buckets, or in none, the
// tiles would describe a different number of units than exist.
it("partitions every unit into exactly one bucket", () => {
  const units = [
    unit("A", { state: "active" }),
    unit("B", { state: "idle" }),
    unit("C", { state: "charging", battery: 9 }),
    unit("D", { state: "error" }),
    unit("E", { state: "offline" }),
    unit("F", { state: "active", battery: 4 }),
  ];
  const fleet = deriveFleet(snapshot(units));
  const counts = countBuckets(fleet.units);

  const total = BUCKETS.reduce((sum, { key }) => sum + counts[key], 0);
  expect(total).toBe(units.length);
});

// An emergency stop never lowers the attention count.
//
// Prevents the worst possible property of an attention counter: that it can be cleared by
// pressing a button. Stopping a facility changes what its units are doing, not what is
// wrong with them. A fault stays a fault and a flat battery keeps draining.
it("keeps faults and flat batteries in attention while the facility is stopped", () => {
  const units = [
    unit("FAULT", { state: "error" }),
    unit("FLAT", { state: "active", battery: 7 }),
    unit("FINE", { state: "active", battery: 80 }),
  ];

  const running = deriveFleet(snapshot(units));
  const stopped = deriveFleet(
    snapshot(units, { facilityStops: [{ siteId: "hotel", since: 0 }] }),
  );

  expect(countNeedingAttention(running.units)).toBe(2);
  expect(countNeedingAttention(stopped.units)).toBe(2);
  expect(stopped.byId.get("FAULT")?.state).toBe("error");
  expect(stopped.byId.get("FLAT")?.bucket).toBe("attention");
});

// A whole facility going quiet is one condition, not N.
//
// Prevents forty log lines for one failed switch. The operator's response to a dark site is
// to call the network team, not to dispatch forty rescues, and the screen has to say which
// of those it is.
it("reports a facility where every unit is silent as dark", () => {
  const partly = deriveFleet(
    snapshot([unit("A", { state: "offline" }), unit("B", { state: "active" })]),
  );
  expect(partly.darkSites.has("hotel")).toBe(false);

  const all = deriveFleet(
    snapshot([unit("A", { state: "offline" }), unit("B", { state: "offline" })]),
  );
  expect(all.darkSites.has("hotel")).toBe(true);
  expect(all.byId.get("A")?.stateText).toBe("Offline · site silent");
});

describe("deriveState", () => {
  // Prevents a command being mistaken for telemetry. An operator stop is something done to
  // the unit; a fault is something true about it, and the fault has to win.
  it("lets a fault outrank both kinds of stop", () => {
    const fleet = deriveFleet(
      snapshot([unit("A", { state: "error" })], {
        facilityStops: [{ siteId: "hotel", since: 0 }],
        unitStops: ["A"],
      }),
    );
    expect(fleet.byId.get("A")?.state).toBe("error");
  });

  it("distinguishes a facility stop from an operator stop", () => {
    const units = [unit("A"), unit("B")];
    const fleet = deriveFleet(snapshot(units, { unitStops: ["A"] }));
    expect(fleet.byId.get("A")?.state).toBe("stopped");
    expect(fleet.byId.get("B")?.state).toBe("active");

    const held = deriveFleet(
      snapshot(units, { facilityStops: [{ siteId: "hotel", since: 0 }] }),
    );
    expect(held.byId.get("B")?.state).toBe("estop");
  });
});

describe("byTriage", () => {
  // Prevents an alphabetical list. The row an operator must act on has to be the row they
  // see first, without scrolling and without sorting.
  it("puts faults above flat batteries, and both above healthy units", () => {
    const fleet = deriveFleet(
      snapshot([
        unit("IDLE", { state: "idle" }),
        unit("FLAT", { state: "active", battery: 8 }),
        unit("FAULT", { state: "error" }),
        unit("BUSY", { state: "active" }),
      ]),
    );

    const order = [...fleet.units].sort(byTriage).map((view) => view.unit.id);
    expect(order).toEqual(["FAULT", "FLAT", "BUSY", "IDLE"]);
  });

  it("breaks a tie on the emptier battery", () => {
    const fleet = deriveFleet(
      snapshot([
        unit("FULLER", { state: "error", battery: 60 }),
        unit("EMPTIER", { state: "error", battery: 20 }),
      ]),
    );
    const order = [...fleet.units].sort(byTriage).map((view) => view.unit.id);
    expect(order).toEqual(["EMPTIER", "FULLER"]);
  });
});

describe("floorToOpen", () => {
  // Prevents landing an operator on an empty plan while the barometer beside it reports
  // faults they cannot see. A fixed index, such as the top floor, does exactly that
  // whenever the trouble happens to be somewhere else.
  it("opens on the floor with the most units needing attention", () => {
    const fleet = deriveFleet(
      snapshot([
        unit("A", { floor: "F3", state: "active" }),
        unit("B", { floor: "F3", state: "active" }),
        unit("C", { floor: "F3", state: "active" }),
        unit("D", { floor: "F1", state: "error" }),
      ]),
    );
    expect(floorToOpen(["F3", "F2", "F1"], fleet.units)).toBe("F1");
  });

  it("falls back to the busiest floor when nothing is wrong", () => {
    const fleet = deriveFleet(
      snapshot([
        unit("A", { floor: "F2" }),
        unit("B", { floor: "F2" }),
        unit("C", { floor: "F3" }),
      ]),
    );
    expect(floorToOpen(["F3", "F2", "F1"], fleet.units)).toBe("F2");
  });

  it("still answers for a facility with no units at all", () => {
    expect(floorToOpen(["F2", "F1"], [])).toBe("F2");
    expect(floorToOpen([], [])).toBeUndefined();
  });
});
