import { Icon } from "../../components/Icon";
import { STATE_ICON, STATE_TONE } from "../../components/status-tone";
import type { FloorPlan } from "../../domain/plan";
import type { UnitView } from "../../domain/status";
import { hasUncertainPosition } from "../../domain/status";
import { headingDegrees, toPercent, uncertaintyMetres, uncertaintyRadius } from "./geometry";

export interface UnitMarkerProps {
  view: UnitView;
  plan: FloorPlan;
  selected: boolean;
  /** Markers counter-scale so they stay one size however far the plan is zoomed. */
  zoom: number;
  onSelect: () => void;
}

export function UnitMarker({ view, plan, selected, zoom, onSelect }: UnitMarkerProps) {
  const { unit, state, stateText } = view;
  if (!unit.pose) return null;

  const tone = STATE_TONE[state];
  const uncertain = hasUncertainPosition(unit, state);
  const confidence = unit.localization ?? 1;
  const offline = state === "offline";
  const held = state === "estop" || state === "stopped";
  // Heading only means something while the unit is driving; a charging or silent unit shows
  // its state glyph instead of pointing somewhere it is not going.
  const showsHeading = !offline && state !== "charging";

  const label = offline
    ? `${unit.id} · last seen`
    : uncertain
      ? `${unit.id} · ±${uncertaintyMetres(confidence)} m`
      : unit.id;

  // What the chip beside the marker cannot fit. Everything here is also one click away in
  // the inspector; the hint exists so a floor can be read without opening every unit on it.
  const hint = [
    `${unit.id} — ${stateText}`,
    unit.task,
    `Battery ${Math.round(unit.battery)}% · ${unit.zone}`,
  ]
    .filter(Boolean)
    .join("\n");

  const classes = ["marker", `tone-${tone}`];
  if (selected) classes.push("marker-selected");
  if (offline) classes.push("marker-offline");

  return (
    <button
      type="button"
      className={classes.join(" ")}
      style={{ ...toPercent(unit.pose, plan), transform: `scale(${(1 / zoom).toFixed(3)})` }}
      aria-pressed={selected}
      title={hint}
      onClick={onSelect}
    >
      {uncertain ? (
        <span
          className="marker-uncertainty"
          aria-hidden="true"
          style={{
            width: uncertaintyRadius(confidence),
            height: uncertaintyRadius(confidence),
          }}
        />
      ) : null}
      {state === "error" ? <span className="marker-ping" aria-hidden="true" /> : null}
      {selected ? <span className="marker-ring" aria-hidden="true" /> : null}

      <span className="marker-disc" aria-hidden="true">
        {showsHeading ? (
          <span
            className="marker-heading"
            style={{ transform: `rotate(${headingDegrees(unit.pose)}deg)` }}
          >
            <Icon name="active" size={12} />
          </span>
        ) : (
          <Icon name={STATE_ICON[state]} size={11} />
        )}
      </span>

      {held ? (
        <span className="marker-held" aria-hidden="true">
          <Icon name="paused" size={7} />
        </span>
      ) : null}

      <span className="marker-label mono">{label}</span>
      <span className="visually-hidden">
        {stateText}
        {uncertain ? ", position uncertain" : ""}
      </span>
    </button>
  );
}
