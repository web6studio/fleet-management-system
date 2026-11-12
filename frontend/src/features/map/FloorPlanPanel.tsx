import { useMemo, useRef } from "react";
import { ZOOM } from "../../app/ui-state";
import { IconButton } from "../../components/Button";
import type { ConnectionState } from "../../data/stream";
import { isMapped, type UnitView } from "../../domain/status";
import type { Site } from "../../domain/types";
import { formatDuration } from "../../lib/format";
import { FloorSwitcher } from "./FloorSwitcher";
import { TRAIL, type TrailSegment, trailSegments } from "./geometry";
import { MapLegend } from "./MapLegend";
import { PlanSurface, type UnitTrail } from "./PlanSurface";
import { UnitMarker } from "./UnitMarker";
import { type PanFocus, usePanZoom } from "./usePanZoom";
import "./map.css";

export interface FloorPlanPanelProps {
  site: Site;
  units: readonly UnitView[];
  floor: string;
  zoom: number;
  selectedUnitId: string | null;
  connection: ConnectionState;
  /** Every unit here has gone silent — markers are last-known positions. */
  dark: boolean;
  stopped: boolean;
  silentFor: number;
  onSelectFloor: (floor: string) => void;
  onZoom: (zoom: number) => void;
  onSelectUnit: (view: UnitView) => void;
}

export function FloorPlanPanel({
  site,
  units,
  floor,
  zoom,
  selectedUnitId,
  connection,
  dark,
  stopped,
  silentFor,
  onSelectFloor,
  onZoom,
  onSelectUnit,
}: FloorPlanPanelProps) {
  const plan = site.plans[floor];

  const onFloor = useMemo(
    () => units.filter((view) => isMapped(view.unit) && view.unit.floor === floor),
    [units, floor],
  );
  const unmapped = units.filter((view) => !isMapped(view.unit)).length;

  const { trails, selectedTrail } = useMemo(() => {
    const others: UnitTrail[] = [];
    let selected: TrailSegment[] = [];
    for (const view of onFloor) {
      if (!view.unit.pose) continue;
      const isSelected = view.unit.id === selectedUnitId;
      const segments = trailSegments(
        view.unit.trail,
        view.unit.pose,
        isSelected ? TRAIL.selected : TRAIL.others,
      );
      if (segments.length === 0) continue;
      if (isSelected) selected = segments;
      else others.push({ unitId: view.unit.id, segments });
    }
    return { trails: others, selectedTrail: selected };
  }, [onFloor, selectedUnitId]);

  // Read through a ref: the view re-centres when the selection changes, not every time the
  // selected unit takes a step.
  const selectedPose = onFloor.find((view) => view.unit.id === selectedUnitId)?.unit.pose;
  const focus = useRef<PanFocus | null>(null);
  focus.current =
    selectedPose && plan
      ? { x: selectedPose.x / plan.width, y: selectedPose.y / plan.height }
      : null;

  const pan = usePanZoom(zoom, selectedUnitId, focus);

  return (
    <section className="panel map-panel" id="floor-plan" aria-label="Floor plan" tabIndex={-1}>
      <div className="panel-head map-head">
        <h2>{site.name}</h2>
        <span className="floor-tag mono">{floor}</span>
        <span className="panel-subtitle">{onFloor.length} units on this floor</span>
        <LiveIndicator
          connection={connection}
          dark={dark}
          stopped={stopped}
          silentFor={silentFor}
        />
      </div>

      <div className="map-stage">
        {plan ? (
          <div
            className={[
              "map-frame",
              pan.pannable ? "map-frame-pannable" : "",
              pan.panning ? "map-frame-panning" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            ref={pan.frameRef}
            onPointerDown={pan.onPointerDown}
          >
            <div className="map-scaler" ref={pan.contentRef}>
              <PlanSurface plan={plan} trails={trails} selectedTrail={selectedTrail} />
              {onFloor.map((view) => (
                <UnitMarker
                  key={view.unit.id}
                  view={view}
                  plan={plan}
                  zoom={zoom}
                  selected={view.unit.id === selectedUnitId}
                  onSelect={() => onSelectUnit(view)}
                />
              ))}
            </div>

            <div
              className="map-scale-bar"
              aria-hidden="true"
              style={{ width: `${10 * zoom}%` }}
            >
              <span className="map-scale-rule" />
              <span className="mono">5 m</span>
            </div>
          </div>
        ) : (
          // A storey with no surveyed plan is a gap in the data, not an empty building.
          // Drawing a blank frame would say the floor is clear of robots, which it is not.
          <p className="map-no-plan">
            No plan has been surveyed for {floor}. Units on this storey are listed beside it.
          </p>
        )}

        <FloorSwitcher
          floors={site.floors}
          current={floor}
          units={units}
          onSelect={onSelectFloor}
        />

        <fieldset className="map-zoom">
          <legend className="visually-hidden">Zoom</legend>
          <IconButton
            icon="zoomIn"
            label="Zoom in"
            variant="ghost"
            size="sm"
            disabled={zoom >= ZOOM.max}
            onClick={() => onZoom(zoom + ZOOM.step)}
          />
          <IconButton
            icon="zoomOut"
            label="Zoom out"
            variant="ghost"
            size="sm"
            disabled={zoom <= ZOOM.min}
            onClick={() => onZoom(zoom - ZOOM.step)}
          />
          <IconButton
            icon="fit"
            label="Fit floor"
            variant="ghost"
            size="sm"
            disabled={zoom <= ZOOM.min}
            onClick={() => onZoom(ZOOM.min)}
          />
        </fieldset>
      </div>

      <MapLegend unmappedCount={unmapped} />
    </section>
  );
}

/**
 * Two different kinds of silence, kept apart.
 *
 * "This facility has stopped reporting" is about the robots; "we lost the server" is about
 * this browser. Collapsing them would let a dropped socket look like a dark building.
 */
function LiveIndicator({
  connection,
  dark,
  stopped,
  silentFor,
}: {
  connection: ConnectionState;
  dark: boolean;
  stopped: boolean;
  silentFor: number;
}) {
  // "Live · 1 Hz" is four characters of jargon standing in for the one thing an operator
  // has to trust about this screen. The hint spells out which of the two silences this is.
  const [tone, text, hint] =
    connection === "offline"
      ? [
          "bad",
          "No connection to the server",
          "This browser cannot reach the fleet service. Nothing on this screen is current.",
        ]
      : connection === "reconnecting"
        ? [
            "warn",
            "Reconnecting — these numbers are ageing",
            "The stream dropped and is being retried with a growing delay. What is shown is the last state that arrived.",
          ]
        : connection === "connecting"
          ? ["warn", "Connecting…", "Opening the telemetry stream."]
          : dark
            ? [
                "bad",
                `No telemetry for ${formatDuration(silentFor)}`,
                "The stream is fine; the facility is not. Every unit here has stopped reporting — one network fault, not many robot faults.",
              ]
            : stopped
              ? [
                  "ok",
                  "Live · 1 Hz · units held",
                  "Telemetry is arriving once a second. The units are standing still because an emergency stop is engaged, not because anything is wrong.",
                ]
              : [
                  "ok",
                  "Live · 1 Hz",
                  "Telemetry is arriving once a second. Every figure on this screen is a frame the robots sent within the last second.",
                ];

  return (
    <output className={`map-live map-live-${tone}`} title={hint}>
      <span className="map-live-dot" aria-hidden="true" />
      {text}
    </output>
  );
}
