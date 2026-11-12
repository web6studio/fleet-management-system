import { StatusDisc } from "../../components/StatusDisc";
import { STATE_ICON, STATE_TONE } from "../../components/status-tone";
import type { UnitView } from "../../domain/status";
import { BatteryTag } from "./BatteryTag";

export interface UnitRowProps {
  view: UnitView;
  selected: boolean;
  /** The floor the map is showing, so a unit elsewhere can be dimmed rather than hidden. */
  shownFloor: string;
  onSelect: () => void;
}

export function UnitRow({ view, selected, shownFloor, onSelect }: UnitRowProps) {
  const { unit, state, bucket, stateText } = view;
  const alarming = state === "error" || state === "offline" || bucket === "attention";
  const mapped = unit.floor !== null;
  const elsewhere = mapped && unit.floor !== shownFloor;

  const classes = ["unit-row"];
  if (selected) classes.push("unit-row-selected");

  return (
    <button
      type="button"
      className={classes.join(" ")}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="unit-row-head">
        <StatusDisc tone={STATE_TONE[state]} icon={STATE_ICON[state]} />
        <span className="unit-row-id mono">{unit.id}</span>
        <span className="unit-row-name">{unit.name}</span>
        <span className={alarming ? "unit-row-state unit-row-state-alarm" : "unit-row-state"}>
          {stateText}
        </span>
      </span>

      <span className="unit-row-meta">
        <span
          className={[
            "unit-row-where mono",
            mapped ? "" : "unit-row-where-nopos",
            elsewhere ? "unit-row-where-elsewhere" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {mapped ? `${unit.floor} · ${unit.zone}` : `No position · ${unit.zone}`}
        </span>
        <BatteryTag percent={unit.battery} stale={state === "offline"} />
      </span>
    </button>
  );
}
