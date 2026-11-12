import type { FleetSnapshot, Unit } from "../domain/types";
import type { ServerFrame, UnitDelta } from "./wire";

/**
 * Trail points kept per unit.
 *
 * Must match `trailLength` in backend/internal/sim/sim.go: delta frames omit the trail, so
 * this is the client's half of that contract. See docs/api/websocket.md.
 */
const TRAIL_POINTS = 60;

/**
 * What applying a frame did.
 *
 * `gap` is the interesting one: the client has missed at least one frame and must not guess
 * at what it was. It asks for a snapshot and ignores deltas until one arrives — the only
 * thing that keeps a dashboard honest after a dropped frame.
 */
export type FrameResult =
  | { status: "applied"; snapshot: FleetSnapshot }
  | { status: "ignored" }
  | { status: "gap" };

/**
 * Folds one stream frame into the current snapshot.
 *
 * Pure, so the gap rule can be tested without a socket — which matters, because the failure
 * it prevents only appears under packet loss that is hard to reproduce by hand.
 */
export function applyFrame(
  current: FleetSnapshot | undefined,
  frame: ServerFrame,
): FrameResult {
  if (frame.type === "snapshot") {
    const { type: _type, ...snapshot } = frame;
    return { status: "applied", snapshot };
  }

  // Nothing to fold into yet. Even a heartbeat has to wait for the snapshot it belongs to.
  if (!current) return { status: "gap" };

  if (frame.version <= current.version) return { status: "ignored" };
  if (frame.version > current.version + 1) return { status: "gap" };

  const meta = { version: frame.version, serverTime: frame.serverTime };

  switch (frame.type) {
    case "heartbeat":
      return { status: "applied", snapshot: { ...current, ...meta } };

    case "units":
      return {
        status: "applied",
        snapshot: { ...current, ...meta, units: mergeUnits(current.units, frame.units) },
      };

    case "alarms":
      return {
        status: "applied",
        snapshot: { ...current, ...meta, alarms: mergeAlarms(current.alarms, frame.alarms) },
      };

    case "commands":
      return {
        status: "applied",
        snapshot: {
          ...current,
          ...meta,
          facilityStops: frame.facilityStops,
          unitStops: frame.unitStops,
        },
      };
  }
}

/**
 * Replaces the units a frame carries, keeping every other unit and the roster's order.
 *
 * Order is load-bearing: the registry sorts by triage, but the map and the legend walk the
 * array, and a list that reshuffles itself on every tick is unreadable.
 */
function mergeUnits(current: readonly Unit[], changed: readonly UnitDelta[]): readonly Unit[] {
  const byId = new Map(changed.map((unit) => [unit.id, unit]));
  return current.map((unit) => {
    const update = byId.get(unit.id);
    return update ? { ...update, trail: extendTrail(unit, update) } : unit;
  });
}

/**
 * Carries a unit's trail forward by one point.
 *
 * The position a unit has just left is the newest point of its history, so the trail the
 * client already holds plus the previous pose reproduces what the server would have sent.
 * A unit that has not moved adds nothing: the server only records a point while driving, so
 * a stopped or silent unit keeps the trail it had.
 */
function extendTrail(previous: Unit, update: UnitDelta): Unit["trail"] {
  const from = previous.pose;
  const to = update.pose;
  if (!from || !to || (from.x === to.x && from.y === to.y)) return previous.trail;

  const point = { x: Math.round(from.x), y: Math.round(from.y) };
  return [...previous.trail, point].slice(-TRAIL_POINTS);
}

/** Alarms are updated in place when known, appended when new, keeping sequence order. */
function mergeAlarms(
  current: FleetSnapshot["alarms"],
  changed: FleetSnapshot["alarms"],
): FleetSnapshot["alarms"] {
  const bySeq = new Map(changed.map((alarm) => [alarm.seq, alarm]));
  const merged = current.map((alarm) => bySeq.get(alarm.seq) ?? alarm);

  const known = new Set(current.map((alarm) => alarm.seq));
  const added = changed.filter((alarm) => !known.has(alarm.seq));
  return added.length === 0 ? merged : [...merged, ...added];
}
