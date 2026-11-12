import { useMemo } from "react";
import { AlarmEntry } from "../../components/AlarmEntry";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { byTriage, unacknowledged } from "../../domain/alarms";
import type { Alarm, Site } from "../../domain/types";
import "./alerts.css";

export interface AlarmConsoleProps {
  site: Site;
  alarms: readonly Alarm[];
  pendingAck: number | "all" | null;
  onAsk: (target: number | "all" | null) => void;
  onAcknowledge: (alarms: readonly Alarm[]) => void;
  onSelectUnit: (unitId: string) => void;
}

/** Mode A: what is wrong at this facility, and who has taken it. */
export function AlarmConsole({
  site,
  alarms,
  pendingAck,
  onAsk,
  onAcknowledge,
  onSelectUnit,
}: AlarmConsoleProps) {
  const ordered = useMemo(() => [...alarms].sort(byTriage), [alarms]);
  const open = unacknowledged(ordered);

  return (
    <>
      <div className="panel-head">
        <h2>Alarms</h2>
        <span className="panel-subtitle">{site.name}</span>
        {open.length > 0 ? (
          <Badge tone="error" icon="alert" className="panel-head-end">
            {open.length} unacknowledged
          </Badge>
        ) : ordered.length > 0 ? (
          <Badge tone="active" icon="check" className="panel-head-end">
            All acknowledged
          </Badge>
        ) : null}
      </div>

      {open.length > 1 ? (
        <div className="alarm-bulk">
          {pendingAck === "all" ? (
            <>
              <span className="alarm-bulk-prompt">
                Take ownership of all {open.length}? Nothing is cleared.
              </span>
              <Button variant="primary" onClick={() => onAcknowledge(open)}>
                Confirm
              </Button>
              <Button variant="ghost" onClick={() => onAsk(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <span className="alarm-bulk-hint">Newest first within severity</span>
              <Button
                variant="ghost"
                className="alarm-bulk-action"
                onClick={() => onAsk("all")}
              >
                Acknowledge all {open.length}
              </Button>
            </>
          )}
        </div>
      ) : null}

      <ol className="alarm-list scroll-area">
        {ordered.map((alarm) => (
          <li key={alarm.seq}>
            <AlarmEntry
              alarm={alarm}
              pending={pendingAck === alarm.seq}
              onAsk={() => onAsk(alarm.seq)}
              onConfirm={() => onAcknowledge([alarm])}
              onCancel={() => onAsk(null)}
              onSelectUnit={onSelectUnit}
            />
          </li>
        ))}
        {ordered.length === 0 ? (
          <li className="alarm-empty">Nothing has happened at this facility this shift.</li>
        ) : null}
      </ol>
    </>
  );
}
