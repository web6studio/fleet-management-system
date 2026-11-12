import { Badge } from "../../components/Badge";
import { Icon } from "../../components/Icon";
import { Meter } from "../../components/Meter";
import { BAND_TONE } from "../../components/status-tone";
import {
  BAND_LABEL,
  bandOf,
  formatMinutes,
  runtimeMinutes,
  willItFinish,
} from "../../domain/battery";
import { LOW_CONFIDENCE } from "../../domain/status";
import type { Unit, UnitState } from "../../domain/types";
import { formatPercent } from "../../lib/format";

export interface HealthSectionProps {
  unit: Unit;
  state: UnitState;
}

export function HealthSection({ unit, state }: HealthSectionProps) {
  const band = bandOf(unit.battery);
  const minutes = runtimeMinutes(unit, state);
  const verdict = willItFinish(unit, state);
  const confidence = unit.localization;
  const lowConfidence = confidence !== undefined && confidence < LOW_CONFIDENCE;

  return (
    <section className="inspector-section">
      <h3>Battery &amp; core health</h3>

      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Charge</span>
          <span className="metric-value mono">{unit.battery}%</span>
          <Badge
            tone={BAND_TONE[band]}
            neutral={band === "normal"}
            className="metric-badge"
            icon={band === "normal" ? undefined : "alert"}
          >
            {BAND_LABEL[band]}
          </Badge>
        </div>

        <div className="metric">
          <span className="metric-label">Runtime left</span>
          <span className="metric-value mono">
            {minutes === null ? "—" : formatMinutes(minutes)}
          </span>
          <span className="metric-note">
            {state === "charging"
              ? "on charge"
              : state === "offline"
                ? "no telemetry"
                : "from own discharge"}
          </span>
        </div>

        <div className="metric">
          <span className="metric-label">Voltage</span>
          <span className="metric-value mono">{unit.voltage.toFixed(1)} V</span>
          <span className="metric-note">nominal 25.2 V</span>
        </div>
      </div>

      {verdict ? (
        <div className={`callout tone-${BAND_TONE[band]}`}>
          <span className="callout-disc">
            <Icon name="clock" size={12} />
          </span>
          <span>
            <strong>Will it finish?</strong> {verdict}
          </span>
        </div>
      ) : null}

      {confidence !== undefined && state !== "offline" ? (
        <div className="confidence">
          <p className="confidence-head">
            <span>Localisation confidence (SLAM)</span>
            <strong className="mono">{formatPercent(confidence)}</strong>
          </p>
          <Meter
            value={confidence}
            height={5}
            color={lowConfidence ? "var(--st-stopped)" : "var(--fg2)"}
          />
          {lowConfidence ? (
            <p className="confidence-note">
              Below 70% the unit is unsure where it is. The map shows a dashed circle: it is
              somewhere inside, not exactly at the dot.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
