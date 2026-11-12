import { useMemo } from "react";
import { AlarmEntry } from "../../components/AlarmEntry";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { STATE_ICON, STATE_TONE } from "../../components/status-tone";
import { unitActions } from "../../domain/actions";
import { byTriage as byAlarmTriage } from "../../domain/alarms";
import type { UnitView } from "../../domain/status";
import { STATE_LABEL } from "../../domain/status";
import type { Alarm, Site, UnitCommand } from "../../domain/types";
import { formatDuration } from "../../lib/format";
import { ActiveTaskSection } from "./ActiveTaskSection";
import { DiagnosticsSection } from "./DiagnosticsSection";
import { HealthSection } from "./HealthSection";
import { QuickActions } from "./QuickActions";
import { TelemetrySection } from "./TelemetrySection";
import "./inspector.css";

export interface UnitInspectorProps {
  view: UnitView;
  site: Site;
  /** Alarms raised by this unit, newest first. */
  alarms: readonly Alarm[];
  pendingAck: number | "all" | null;
  /** A command is in flight; the controls lock until the server answers. */
  busy: boolean;
  onClose: () => void;
  onCommand: (command: UnitCommand) => void;
  onAsk: (target: number | "all" | null) => void;
  onAcknowledge: (alarms: readonly Alarm[]) => void;
}

/**
 * Mode B, ordered by the inverted pyramid: controls, then what it is doing, then its health,
 * then where it is, then its subsystems, then history.
 *
 * Controls first because they are what an operator reaches for in the seconds after
 * something goes wrong. The log is last because it is retrospective: it explains what
 * already happened, and nobody reads it before acting.
 */
export function UnitInspector({
  view,
  site,
  alarms,
  pendingAck,
  busy,
  onClose,
  onCommand,
  onAsk,
  onAcknowledge,
}: UnitInspectorProps) {
  const { unit, state } = view;
  const actions = useMemo(() => unitActions(unit, state), [unit, state]);
  const log = useMemo(() => [...alarms].sort(byAlarmTriage), [alarms]);

  const age =
    state === "offline"
      ? `Last frame ${formatDuration(unit.silentFor ?? 0)} ago`
      : "Updated 0.8 s ago";

  return (
    <>
      <div className="inspector-head">
        <div className="inspector-identity">
          <h2 className="mono">{unit.id}</h2>
          <Badge tone={STATE_TONE[state]} icon={STATE_ICON[state]}>
            {STATE_LABEL[state]}
          </Badge>
          <Button
            icon="close"
            className="inspector-close"
            onClick={onClose}
            aria-label="Close unit details and return to alarms"
          >
            Close
          </Button>
        </div>
        <p className="inspector-subtitle">
          <span>
            <strong>{unit.name}</strong> · {unit.series} · {site.name}
          </span>
          <span className="inspector-age">{age}</span>
        </p>
      </div>

      <QuickActions actions={actions} busy={busy} onRun={onCommand} />

      <div className="inspector-body scroll-area">
        <ActiveTaskSection unit={unit} state={state} />
        <HealthSection unit={unit} state={state} />
        <TelemetrySection unit={unit} plan={unit.floor ? site.plans[unit.floor] : undefined} />
        <DiagnosticsSection unit={unit} />

        <section className="inspector-section">
          <h3>Error &amp; event log</h3>
          {log.length > 0 ? (
            <div className="unit-log">
              {log.map((alarm) => (
                <AlarmEntry
                  key={alarm.seq}
                  alarm={alarm}
                  compact
                  pending={pendingAck === alarm.seq}
                  onAsk={() => onAsk(alarm.seq)}
                  onConfirm={() => onAcknowledge([alarm])}
                  onCancel={() => onAsk(null)}
                />
              ))}
            </div>
          ) : (
            <p className="inspector-note">Nothing recorded for this unit this shift.</p>
          )}
          <p className="inspector-note">
            Acknowledgement is server state: an alarm owned here is owned on every operator's
            screen.
          </p>
        </section>
      </div>
    </>
  );
}
