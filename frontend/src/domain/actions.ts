import type { Unit, UnitCommand, UnitState } from "./types";

export interface UnitAction {
  command: UnitCommand;
  label: string;
  /** `null` when the command can be sent; otherwise why it cannot. */
  blockedBy: string | null;
}

/** The task string the fleet uses for a battery-policy return, which cannot be re-issued. */
const FORCED_RETURN = "Forced return to dock";

/**
 * One wording for all four controls, so the inspector can collapse them into a single line.
 *
 * Silence blocks every command for the same reason, and four restatements of it read as four
 * separate problems. Keeping the string identical is what lets the UI say it once.
 *
 * "Stopped reporting" is the phrase the alarm list and the site banner already use for the
 * same condition, and it avoids "delivered", which on a floor of delivery robots reads as
 * the parcel rather than the command.
 */
const NOT_REPORTING =
  "This unit stopped reporting. Commands cannot reach it until it is back online.";

/**
 * What each control does, for the hover tooltip.
 *
 * The labels are verbs, but the scope of each one is the part an operator cannot guess: a
 * stop holds one unit and not the facility, a start takes the next queued mission rather
 * than repeating the last, and a dock is chosen by the unit.
 */
export const ACTION_EFFECT: Record<UnitCommand, string> = {
  stop: "Holds this unit where it stands. Every other unit keeps running.",
  resume: "Continues the task the unit was stopped on.",
  start: "Sends the next mission from the queue.",
  dock: "Sends the unit to the nearest free dock.",
};

/**
 * Which of the four controls can act right now, and the reason when one cannot.
 *
 * A present but useless control costs more than an absent one: the operator presses it,
 * nothing happens, and from then on they distrust every other button on the screen. So the
 * reason is part of the model, not a tooltip bolted on at render time.
 */
export function unitActions(unit: Unit, state: UnitState): readonly UnitAction[] {
  const offline = state === "offline";
  const facilityStopped = state === "estop";
  const operatorStopped = state === "stopped";
  const faulted = state === "error";
  const atDock = state === "charging" || unit.zone === "Dock";
  const returning = unit.task === FORCED_RETURN;

  return [
    {
      command: "stop",
      label: "Stop",
      blockedBy: offline
        ? NOT_REPORTING
        : facilityStopped
          ? "Already held by the facility E-stop"
          : operatorStopped
            ? "Already stopped"
            : null,
    },
    {
      command: "resume",
      label: "Resume task",
      blockedBy: offline
        ? NOT_REPORTING
        : facilityStopped
          ? "Release the facility E-stop from the header"
          : faulted
            ? "Clear the fault first"
            : operatorStopped
              ? null
              : "Nothing to resume — the unit is not stopped",
    },
    {
      command: "start",
      label: "Start task",
      blockedBy: offline
        ? NOT_REPORTING
        : facilityStopped
          ? "Facility E-stop is active"
          : faulted
            ? "Clear the fault first"
            : operatorStopped
              ? "Resume or release the stop first"
              : state === "active"
                ? "Busy — already on a task"
                : state === "charging" && unit.battery < 80
                  ? "Charging — ready at 80%"
                  : null,
    },
    {
      command: "dock",
      label: "Send to dock",
      blockedBy: offline
        ? NOT_REPORTING
        : atDock
          ? "Already at a dock"
          : facilityStopped
            ? "Facility E-stop is active"
            : returning
              ? "Already returning to dock"
              : null,
    },
  ];
}

/**
 * What the toast says after a command is accepted.
 *
 * Phrased as "sent", never as "done": the unit's next telemetry frame is what confirms it,
 * and that asymmetry is real rather than a UI nicety.
 */
export function commandSentMessage(command: UnitCommand, unit: Unit): string {
  switch (command) {
    case "stop":
      return `${unit.id} stopped where it stands. Every other unit keeps running.`;
    case "resume":
      return unit.task
        ? `Resume sent to ${unit.id} — continues "${unit.task}"`
        : `Resume sent to ${unit.id}`;
    case "start":
      return `Start sent to ${unit.id} — next queued mission: ${unit.nextTask ?? "from the queue"}`;
    case "dock":
      return `Send to dock sent to ${unit.id} — it picks the nearest free dock`;
  }
}
