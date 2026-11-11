import type { FleetSnapshot, Unit, UnitState } from "./types";

/** Barometer buckets. The four always partition the fleet, so the counters sum to it. */
export type Bucket = "attention" | "active" | "standby" | "offline";

export const BUCKETS: readonly { key: Bucket; label: string; hint: string }[] = [
  {
    key: "attention",
    label: "Attention",
    hint: "Faults, flat batteries and units that stopped reporting — the ones somebody has to do something about.",
  },
  { key: "active", label: "Active", hint: "Driving a task right now." },
  {
    key: "standby",
    label: "Standby",
    hint: "Idle, charging or held. Available, and nothing is wrong with them.",
  },
  {
    key: "offline",
    label: "Offline",
    hint: "No telemetry at all. The position on the map is the last one that arrived.",
  },
];

export const STATE_LABEL: Record<UnitState, string> = {
  active: "Active",
  idle: "Idle",
  charging: "Charging",
  stopped: "Stopped",
  estop: "E-stopped",
  error: "Error",
  offline: "Offline",
};

/** Below this the battery alone puts a unit in the attention bucket. */
const CRITICAL_BATTERY = 15;

/** Below this SLAM confidence the map draws an uncertainty circle instead of a point. */
export const LOW_CONFIDENCE = 0.7;

/**
 * Everything derived from one snapshot that more than one panel needs.
 *
 * Computed once per frame and passed down, so the registry, the map and the inspector can
 * never disagree about what a unit is doing.
 */
export interface FleetView {
  units: readonly UnitView[];
  byId: ReadonlyMap<string, UnitView>;
  /** Sites where every unit went silent — one infrastructure fault, not N robot faults. */
  darkSites: ReadonlySet<string>;
}

export interface UnitView {
  unit: Unit;
  state: UnitState;
  bucket: Bucket;
  /** The line an operator reads first: what it is doing, or what is wrong with it. */
  stateText: string;
  /** Rank for triage. Lower is more urgent. */
  rank: number;
}

/**
 * State priority: silence, then a fault, then a facility stop, then an operator stop, then
 * whatever the unit reports.
 *
 * A stop never outranks a fault. If it did, the attention counter could be zeroed by
 * pressing a button — the worst property an attention counter can have.
 */
function deriveState(
  unit: Unit,
  { facilityStopped, operatorStopped }: { facilityStopped: boolean; operatorStopped: boolean },
): UnitState {
  if (unit.state === "offline") return "offline";
  if (unit.state === "error") return "error";
  if (facilityStopped) return "estop";
  if (operatorStopped) return "stopped";
  return unit.state;
}

function bucketOf(unit: Unit, state: UnitState): Bucket {
  if (state === "error") return "attention";
  if (state === "offline") return "offline";
  // A flat battery counts wherever the unit is, not only while it is driving. Charging is
  // the one exception: a unit at 9% on a dock is recovering, not a problem. Scoping this to
  // active units would let the attention counter fall when an operator presses E-stop,
  // which is the one thing that counter must never do.
  if (state !== "charging" && unit.battery < CRITICAL_BATTERY) return "attention";
  if (state === "active") return "active";
  return "standby";
}

const RANK: Record<UnitState, number> = {
  error: 0,
  offline: 2,
  estop: 3,
  stopped: 3,
  active: 4,
  idle: 5,
  charging: 6,
};

function rankOf(unit: Unit, state: UnitState): number {
  // A critical battery sits directly below a fault: it is about to become one, and it is
  // the only entry in this list that a few minutes can change.
  if (state !== "charging" && state !== "offline" && unit.battery < CRITICAL_BATTERY) return 1;
  return RANK[state];
}

function stateTextOf(unit: Unit, state: UnitState, siteIsDark: boolean): string {
  switch (state) {
    case "error":
      return unit.errorCode ? `Error: ${unit.errorCode}` : "Error";
    case "offline":
      return siteIsDark ? "Offline · site silent" : "Offline";
    case "active":
      return unit.activity ?? "Navigating";
    default:
      return STATE_LABEL[state];
  }
}

/**
 * A facility is dark when every one of its units has gone quiet.
 *
 * Reported as one condition rather than N, because that is what it is: a switch, a gateway
 * or an access point, not forty simultaneous robot faults.
 */
function findDarkSites(snapshot: FleetSnapshot): Set<string> {
  const total = new Map<string, number>();
  const silent = new Map<string, number>();

  for (const unit of snapshot.units) {
    total.set(unit.siteId, (total.get(unit.siteId) ?? 0) + 1);
    if (unit.state === "offline") silent.set(unit.siteId, (silent.get(unit.siteId) ?? 0) + 1);
  }

  const dark = new Set<string>();
  for (const [siteId, count] of total) {
    if (count > 0 && silent.get(siteId) === count) dark.add(siteId);
  }
  return dark;
}

export function deriveFleet(snapshot: FleetSnapshot): FleetView {
  const darkSites = findDarkSites(snapshot);
  const facilityStops = new Set(snapshot.facilityStops.map((stop) => stop.siteId));
  const unitStops = new Set(snapshot.unitStops);

  const units = snapshot.units.map((unit) => {
    const state = deriveState(unit, {
      facilityStopped: facilityStops.has(unit.siteId),
      operatorStopped: unitStops.has(unit.id),
    });
    return {
      unit,
      state,
      bucket: bucketOf(unit, state),
      stateText: stateTextOf(unit, state, darkSites.has(unit.siteId)),
      rank: rankOf(unit, state),
    } satisfies UnitView;
  });

  return { units, byId: new Map(units.map((u) => [u.unit.id, u])), darkSites };
}

/** Most urgent first; within the same urgency, the emptiest battery, then by id. */
export function byTriage(a: UnitView, b: UnitView): number {
  return (
    a.rank - b.rank || a.unit.battery - b.unit.battery || a.unit.id.localeCompare(b.unit.id)
  );
}

export function countBuckets(views: readonly UnitView[]): Record<Bucket, number> {
  const counts: Record<Bucket, number> = { attention: 0, active: 0, standby: 0, offline: 0 };
  for (const view of views) counts[view.bucket] += 1;
  return counts;
}

/** Units an operator has to do something about: faults, flat batteries and silence. */
export function countNeedingAttention(views: readonly UnitView[]): number {
  return views.filter((v) => v.bucket === "attention" || v.bucket === "offline").length;
}

/**
 * The floor to open a facility on.
 *
 * Whichever storey has the most units needing attention, then the busiest. Opening on a
 * fixed index — the top floor, or the one below it — regularly lands an operator on an empty
 * plan while the barometer beside it reports faults they cannot see.
 */
export function floorToOpen(
  floors: readonly string[],
  units: readonly UnitView[],
): string | undefined {
  let best: { floor: string; attention: number; total: number } | undefined;

  for (const floor of floors) {
    const onFloor = units.filter((view) => view.unit.floor === floor);
    const attention = onFloor.filter(
      (view) => view.bucket === "attention" || view.bucket === "offline",
    ).length;
    const candidate = { floor, attention, total: onFloor.length };

    if (
      !best ||
      candidate.attention > best.attention ||
      (candidate.attention === best.attention && candidate.total > best.total)
    ) {
      best = candidate;
    }
  }
  return best?.floor ?? floors[0];
}

export function isMapped(unit: Unit): boolean {
  return unit.pose !== null && unit.floor !== null;
}

export function hasUncertainPosition(unit: Unit, state: UnitState): boolean {
  return (
    state !== "offline" && unit.localization !== undefined && unit.localization < LOW_CONFIDENCE
  );
}
