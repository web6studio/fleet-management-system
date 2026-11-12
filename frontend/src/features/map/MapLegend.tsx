import { Icon } from "../../components/Icon";
import { StatusDisc } from "../../components/StatusDisc";
import { STATE_ICON, STATE_TONE } from "../../components/status-tone";
import { STATE_LABEL } from "../../domain/status";
import type { UnitState } from "../../domain/types";

export interface MapLegendProps {
  /** Units at this facility whose vendor publishes no pose at all. */
  unmappedCount: number;
}

const LEGEND_STATES: readonly UnitState[] = [
  "active",
  "idle",
  "charging",
  "stopped",
  "error",
  "offline",
];

export function MapLegend({ unmappedCount }: MapLegendProps) {
  return (
    <div className="map-legend">
      {LEGEND_STATES.map((state) => (
        <span key={state} className="map-legend-item">
          <StatusDisc tone={STATE_TONE[state]} icon={STATE_ICON[state]} size={14} />
          {STATE_LABEL[state]}
        </span>
      ))}

      <span className="map-legend-item">
        <span className="map-legend-estimate" aria-hidden="true" />
        Position estimate (SLAM &lt; 70%)
      </span>

      {/* Said out loud rather than quietly omitted: a map that drops part of the fleet
          without saying so leaves the operator counting robots that are not there. */}
      {unmappedCount > 0 ? (
        <span className="map-legend-item map-legend-unmapped">
          <Icon name="noPosition" size={14} />
          {unmappedCount} not on the map — vendor sends no position
        </span>
      ) : null}
    </div>
  );
}
