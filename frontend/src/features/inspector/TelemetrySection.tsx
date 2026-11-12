import { Icon } from "../../components/Icon";
import type { FloorPlan } from "../../domain/plan";
import { toMetres, worldY } from "../../domain/plan";
import type { Unit } from "../../domain/types";
import { formatHeading, formatMetres, formatSpeed } from "../../lib/format";

export interface TelemetrySectionProps {
  unit: Unit;
  /** The plan of the unit's own storey — each one has its own coordinate frame. */
  plan: FloorPlan | undefined;
}

export function TelemetrySection({ unit, plan }: TelemetrySectionProps) {
  return (
    <section className="inspector-section">
      <h3>Location &amp; telemetry</h3>

      {unit.pose && plan ? (
        <dl className="telemetry-grid">
          <div>
            <dt>x</dt>
            <dd className="mono">{formatMetres(toMetres(unit.pose.x, plan))}</dd>
          </div>
          <div>
            <dt>y</dt>
            <dd className="mono">{formatMetres(worldY(unit.pose.y, plan))}</dd>
          </div>
          <div>
            <dt>θ heading</dt>
            <dd className="mono">{formatHeading(unit.pose.heading)}</dd>
          </div>
          <div>
            <dt>Speed</dt>
            <dd className="mono">{formatSpeed(unit.speed ?? 0)}</dd>
          </div>
        </dl>
      ) : null}

      {unit.pose && plan ? (
        <p className="telemetry-where">
          <span>
            Floor <strong className="mono">{unit.floor}</strong>
          </span>
          <span>
            Zone <strong>{unit.zone}</strong>
          </span>
          <span className="telemetry-frame">map frame, metres</span>
        </p>
      ) : (
        <p className="telemetry-nopos">
          <Icon name="noPosition" size={16} />
          <span>
            <strong>{unit.zone}</strong> — reported by zone only. This vendor sends no pose, so
            the unit can never be drawn on the map. Not a fault.
          </span>
        </p>
      )}
    </section>
  );
}
