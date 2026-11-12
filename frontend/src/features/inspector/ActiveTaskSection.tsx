import { Meter } from "../../components/Meter";
import type { Unit, UnitState } from "../../domain/types";

export interface ActiveTaskSectionProps {
  unit: Unit;
  state: UnitState;
}

/** Why the unit is not doing the work it still has. Idle is not one of these. */
const HELD_NOTE: Partial<Record<UnitState, string>> = {
  estop:
    "Held by the facility E-stop. Not the same as idle — this unit has work and is not doing it.",
  stopped: "Stopped by an operator. Resume task to continue where it left off.",
  error: "Stopped by the fault. The task resumes once the condition clears.",
};

const PROGRESS_COLOR: Partial<Record<UnitState, string>> = {
  error: "var(--st-error)",
  estop: "var(--st-stopped)",
  stopped: "var(--st-stopped)",
  offline: "var(--st-offline)",
};

export function ActiveTaskSection({ unit, state }: ActiveTaskSectionProps) {
  const standingBy = state === "idle" || state === "charging";
  const hasTask = unit.task !== null && !standingBy;
  const held = HELD_NOTE[state];

  return (
    <section className="inspector-section">
      <h3>Active task</h3>

      {hasTask ? (
        <>
          <p className="task-name">{unit.task}</p>
          {unit.taskProgress !== null ? (
            <>
              <Meter
                value={unit.taskProgress}
                color={PROGRESS_COLOR[state] ?? "var(--st-active)"}
              />
              <p className="task-meta mono">
                <span>{Math.round(unit.taskProgress * 100)}% complete</span>
                <span>elapsed {unit.elapsed}</span>
                {state === "active" && unit.eta ? <span>{unit.eta}</span> : null}
              </p>
            </>
          ) : null}
        </>
      ) : (
        <p className="task-idle">
          {state === "charging" ? "No task — charging at the dock." : "No task — standing by."}
          {unit.nextTask ? ` Next queued: ${unit.nextTask}.` : ""}
        </p>
      )}

      {held ? <p className="task-held">{held}</p> : null}
    </section>
  );
}
