import type { Alarm, Severity } from "./types";

export const SEVERITY_LABEL: Record<Severity, string> = {
  1: "SEV 1",
  2: "SEV 2",
  3: "SEV 3",
};

/**
 * What each severity asks of the operator.
 *
 * "SEV 2" is a number, and a number only means something to somebody who already knows the
 * scheme. The chip keeps the short form, because that is what gets scanned down a column;
 * this is what it expands to.
 */
export const SEVERITY_MEANING: Record<Severity, string> = {
  1: "Severity 1 — the unit has stopped doing its job. Someone has to go to it.",
  2: "Severity 2 — degraded, and heading for a stoppage. Deal with it this shift.",
  3: "Severity 3 — a record of something that happened. Nothing to do.",
};

/**
 * Unacknowledged first, then most severe, then newest.
 *
 * Acknowledged alarms stay in the list. Acknowledging records ownership, not resolution,
 * and hiding them would be the system claiming a condition cleared itself.
 */
export function byTriage(a: Alarm, b: Alarm): number {
  const aOwned = a.acknowledgedBy !== null;
  const bOwned = b.acknowledgedBy !== null;
  if (aOwned !== bOwned) return aOwned ? 1 : -1;
  if (!aOwned && a.severity !== b.severity) return a.severity - b.severity;
  return b.seq - a.seq;
}

export function unacknowledged(alarms: readonly Alarm[]): readonly Alarm[] {
  return alarms.filter((alarm) => alarm.acknowledgedBy === null);
}
