import { SEVERITY_LABEL, SEVERITY_MEANING } from "../domain/alarms";
import type { Alarm } from "../domain/types";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { StatusDisc } from "./StatusDisc";
import { SEVERITY_ICON, SEVERITY_TONE } from "./status-tone";

export interface AlarmEntryProps {
  alarm: Alarm;
  /** True while this alarm is waiting for its confirming click. */
  pending: boolean;
  /** Narrower variant for the unit inspector's own log. */
  compact?: boolean;
  onAsk: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onSelectUnit?: (unitId: string) => void;
}

/**
 * One alarm, in the console and in a unit's own log.
 *
 * Acknowledging takes two clicks. It is the only action here that cannot be undone and
 * that other operators rely on. Once owned, the next person assumes somebody is on it, so
 * a single mis-click must not be able to make that claim.
 */
export function AlarmEntry({
  alarm,
  pending,
  compact,
  onAsk,
  onConfirm,
  onCancel,
  onSelectUnit,
}: AlarmEntryProps) {
  const owned = alarm.acknowledgedBy !== null;
  const tone = SEVERITY_TONE[alarm.severity];
  const size = compact ? "sm" : "md";

  const classes = ["alarm"];
  if (compact) classes.push("alarm-compact");
  // A top-severity alarm nobody owns gets a faint wash, so it can be found while scrolling.
  if (!owned && alarm.severity === 1) classes.push("alarm-critical");

  return (
    <div className={classes.join(" ")}>
      <StatusDisc
        tone={tone}
        icon={SEVERITY_ICON[alarm.severity]}
        size={compact ? 20 : 24}
        className={owned ? "is-owned" : undefined}
      />

      <div className="alarm-body">
        <div className={owned ? "alarm-title is-owned" : "alarm-title"}>
          <strong>{alarm.kind}</strong>
          <time className="mono">{alarm.time}</time>
        </div>

        <p className={owned ? "alarm-detail is-owned" : "alarm-detail"}>
          {alarm.unitId ? (
            <button
              type="button"
              className="link mono alarm-unit"
              onClick={() => alarm.unitId && onSelectUnit?.(alarm.unitId)}
            >
              {alarm.unitId}
            </button>
          ) : null}
          <span>{alarm.detail}</span>
        </p>

        <div className="alarm-actions">
          <span
            className={`alarm-severity mono tone-${tone}${owned ? " is-owned" : ""}`}
            title={SEVERITY_MEANING[alarm.severity]}
          >
            {SEVERITY_LABEL[alarm.severity]}
          </span>

          {owned ? (
            <span className="alarm-owned">
              <Icon name="check" size={compact ? 11 : 12} />
              Acknowledged · {alarm.acknowledgedBy}
            </span>
          ) : pending ? (
            <>
              <span className="alarm-prompt">Own it?</span>
              <Button variant="primary" size={size} onClick={onConfirm}>
                Confirm
              </Button>
              <Button variant="ghost" size={size} onClick={onCancel}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" size={size} className="alarm-ack" onClick={onAsk}>
              Acknowledge
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
