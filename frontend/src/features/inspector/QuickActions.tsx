import { Button } from "../../components/Button";
import type { IconName } from "../../components/Icon";
import { ACTION_EFFECT, type UnitAction } from "../../domain/actions";
import type { UnitCommand } from "../../domain/types";

export interface QuickActionsProps {
  actions: readonly UnitAction[];
  /** A command is already in flight. Sending a second stop helps nobody. */
  busy: boolean;
  onRun: (command: UnitCommand) => void;
}

const ACTION_ICON: Record<UnitCommand, IconName> = {
  stop: "estop",
  resume: "resume",
  start: "start",
  dock: "dock",
};

/**
 * The four controls, always visible above the scrolling body.
 *
 * Every blocked one states its reason underneath rather than only greying out. Without it
 * the operator has no next step, and no way to tell a refusal from a broken screen.
 */
export function QuickActions({ actions, busy, onRun }: QuickActionsProps) {
  const blocked = actions.filter((action) => action.blockedBy !== null);
  // One cause behind every control, as a silent unit has, is one problem. Listing it
  // once per button turns it into four, and the operator reads the list instead of the state.
  const [first] = blocked;
  const shared =
    first &&
    blocked.length === actions.length &&
    blocked.every((action) => action.blockedBy === first.blockedBy)
      ? first.blockedBy
      : null;

  return (
    <div className="quick-actions">
      <div className="quick-actions-grid">
        {actions.map((action) => (
          <Button
            key={action.command}
            variant={action.command === "stop" ? "danger" : "default"}
            size="lg"
            icon={ACTION_ICON[action.command]}
            disabled={busy || action.blockedBy !== null}
            // Scope, not a restatement of the label. A blocked control keeps its reason
            // visible in the list below as well: browsers suppress tooltips on a disabled
            // button, so the title alone would be a reason nobody can read.
            title={action.blockedBy ?? ACTION_EFFECT[action.command]}
            onClick={() => onRun(action.command)}
          >
            {action.label}
          </Button>
        ))}
      </div>

      {shared ? (
        <p className="quick-actions-reason">{shared}</p>
      ) : blocked.length > 0 ? (
        <ul className="quick-actions-reasons">
          {blocked.map((action) => (
            <li key={action.command}>
              <span>{action.label}</span> — {action.blockedBy}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
