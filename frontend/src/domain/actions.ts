import type { Unit, UnitCommand, UnitState } from "./types";

export interface UnitAction {
  command: UnitCommand;
  label: string;
  /** `null` when the command can be delivered; otherwise why it cannot. */
  blockedBy: string | null;
}

/** The task string the fleet uses for a battery-policy return, which cannot be re-issued. */
const FORCED_RETURN = "Forced return to dock";

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
        ? "No link — a stop cannot be delivered"
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
        ? "No link to the unit"
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
        ? "No link to the unit"
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
        ? "No link to the unit"
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
