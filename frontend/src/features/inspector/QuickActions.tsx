import { Button } from "../../components/Button";
import type { IconName } from "../../components/Icon";
import type { UnitAction } from "../../domain/actions";
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
            onClick={() => onRun(action.command)}
          >
            {action.label}
          </Button>
        ))}
      </div>

      {blocked.length > 0 ? (
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
