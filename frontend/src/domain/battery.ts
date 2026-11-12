import type { Unit, UnitState } from "./types";

/**
 * Four bands, not one low-battery threshold, because the operational response differs at
 * each: finish the task, dock after it, cancel it, or go and fetch the unit.
 */
export type BatteryBand = "normal" | "low" | "critical" | "emergency";

export const BAND_LABEL: Record<BatteryBand, string> = {
  normal: "Normal",
  low: "Low",
  critical: "Critical",
  emergency: "Emergency",
};

export function bandOf(percent: number): BatteryBand {
  if (percent < 5) return "emergency";
  if (percent < 15) return "critical";
  if (percent <= 30) return "low";
  return "normal";
}

/**
 * Minutes of work left, fitted from the unit's own draw rather than from a nominal capacity.
 *
 * `null` while charging or silent: an estimate invented for a unit nobody is hearing from
 * is a number an operator would plan a shift around.
 */
export function runtimeMinutes(unit: Unit, state: UnitState): number | null {
  if (state === "charging" || state === "offline") return null;
  // An idle unit draws roughly a third of what a driving one does.
  return Math.round(unit.battery * (state === "idle" ? 4 : 1.3));
}

/**
 * The sentence an operator actually needs: will this unit finish what it is doing?
 *
 * Only for a unit still working on a depleted battery, the one case where the percentage
 * alone does not answer the question being asked.
 */
export function willItFinish(unit: Unit, state: UnitState): string | null {
  if (state !== "active") return null;

  const band = bandOf(unit.battery);
  const minutes = runtimeMinutes(unit, state);
  if (minutes === null) return null;

  const remaining = unit.eta?.replace(" left", "") ?? "the rest of the task";

  if (band === "low") {
    return `Yes — the task needs ${remaining} and the charge lasts about ${formatMinutes(
      minutes,
    )}. Docks automatically afterwards.`;
  }
  if (band === "critical" || band === "emergency") {
    return `Below 15% the battery policy cancels the task. Returning to dock (${remaining}); the charge lasts about ${formatMinutes(
      minutes,
    )}.`;
  }
  return null;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
