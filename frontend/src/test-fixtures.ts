import { deriveFleet, type UnitView } from "./domain/status";
import type { Alarm, FleetSnapshot, Site, Unit } from "./domain/types";

/**
 * Fleet shapes for tests, built from the same derivation the screen uses.
 *
 * Views come out of `deriveFleet` rather than being hand-assembled, so a test can never
 * assert against a bucket or a state the real code would not have produced.
 */

export function makeUnit(id: string, overrides: Partial<Unit> = {}): Unit {
  return {
    id,
    name: id,
    series: "Delivery AMR",
    siteId: "hotel",
    floor: "F1",
    zone: "Corridor A",
    pose: { x: 100, y: 100, heading: 0 },
    trail: [],
    state: "active",
    task: "Delivery to Room 112",
    taskProgress: 0.5,
    elapsed: "1m 00s",
    battery: 80,
    voltage: 25,
    subsystems: { lidar: "ok", bumper: "ok", drive: "ok", payload: "ok" },
    ...overrides,
  };
}

export function makeAlarm(seq: number, overrides: Partial<Alarm> = {}): Alarm {
  return {
    seq,
    siteId: "hotel",
    time: "14:22:07",
    severity: 1,
    kind: "Not moving",
    unitId: "GAU-203",
    detail: "Pose unchanged for 1m 40s while reporting active",
    acknowledgedBy: null,
    ...overrides,
  };
}

export function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: "hotel",
    name: "Marienhof Hotel",
    floors: ["F2", "F1"],
    plans: {
      F1: { width: 1000, height: 800, unitsPerMetre: 20, rects: [], paths: [], labels: [] },
      F2: { width: 1000, height: 800, unitsPerMetre: 20, rects: [], paths: [], labels: [] },
    },
    ...overrides,
  };
}

export function makeSnapshot(
  units: readonly Unit[],
  overrides: Partial<FleetSnapshot> = {},
): FleetSnapshot {
  return {
    version: 1,
    serverTime: Date.UTC(2026, 10, 11, 14, 23, 12),
    units: [...units],
    alarms: [],
    facilityStops: [],
    unitStops: [],
    ...overrides,
  };
}

/** The unit views the screen would render for these units. */
export function makeViews(
  units: readonly Unit[],
  overrides: Partial<FleetSnapshot> = {},
): readonly UnitView[] {
  return deriveFleet(makeSnapshot(units, overrides)).units;
}

export function viewOf(unit: Unit, overrides: Partial<FleetSnapshot> = {}): UnitView {
  const view = makeViews([unit], overrides)[0];
  if (!view) throw new Error("deriveFleet produced no view");
  return view;
}
