import { useEffect, useMemo, useReducer } from "react";
import { Toast } from "../components/Toast";
import { ApiError } from "../data/http";
import {
  useAcknowledgeAlarms,
  useEmergencyStop,
  useFleet,
  useFleetStream,
  useSites,
  useUnitCommand,
} from "../data/queries";
import { commandSentMessage } from "../domain/actions";
import { byTriage, deriveFleet, floorToOpen, type UnitView } from "../domain/status";
import type { Alarm, Site, UnitCommand } from "../domain/types";
import { AlarmConsole } from "../features/alerts/AlarmConsole";
import { EmergencyStopConfirm } from "../features/alerts/EmergencyStopConfirm";
import { FleetRegistry } from "../features/fleet/FleetRegistry";
import { Banners } from "../features/header/Banners";
import { Header } from "../features/header/Header";
import { UnitInspector } from "../features/inspector/UnitInspector";
import { FloorPlanPanel } from "../features/map/FloorPlanPanel";
import { formatClock } from "../lib/format";
import {
  applyTheme,
  readStoredChoice,
  resolveTheme,
  storeChoice,
  watchDeviceTheme,
} from "./theme";
import { initialUiState, inspectorMode, uiReducer } from "./ui-state";
import "./app.css";

const TOAST_MS = 3600;

export function App() {
  const sites = useSites();
  const fleet = useFleet();
  const connection = useFleetStream();

  const [ui, dispatch] = useReducer(uiReducer, undefined, () =>
    initialUiState(readStoredChoice()),
  );

  useEffect(() => {
    applyTheme(resolveTheme(ui.theme));
    storeChoice(ui.theme);
    // Only a `system` choice cares about the device flipping; the listener is cheap enough
    // not to be worth conditioning on it.
    return watchDeviceTheme(() => applyTheme(resolveTheme(ui.theme)));
  }, [ui.theme]);

  useEffect(() => {
    if (!ui.toast) return;
    const timer = setTimeout(() => dispatch({ type: "toast", message: null }), TOAST_MS);
    return () => clearTimeout(timer);
  }, [ui.toast]);

  const toast = (message: string) => dispatch({ type: "toast", message });
  const refused = (error: unknown) =>
    toast(error instanceof ApiError ? error.message : "The server could not be reached");

  const unitCommand = useUnitCommand();
  const emergencyStop = useEmergencyStop();
  const acknowledgeAlarms = useAcknowledgeAlarms();

  const snapshot = fleet.data;
  const view = useMemo(() => (snapshot ? deriveFleet(snapshot) : null), [snapshot]);

  const siteList = sites.data ?? [];
  const site = siteList.find((candidate) => candidate.id === ui.siteId) ?? siteList[0];

  const siteUnits = useMemo(
    () => (view ? view.units.filter((u) => u.unit.siteId === site?.id).sort(byTriage) : []),
    [view, site?.id],
  );
  const siteAlarms = useMemo(
    () => snapshot?.alarms.filter((alarm) => alarm.siteId === site?.id) ?? [],
    [snapshot?.alarms, site?.id],
  );

  const selected = ui.selectedUnitId ? view?.byId.get(ui.selectedUnitId) : undefined;
  const stoppedSiteIds = useMemo(
    () => snapshot?.facilityStops.map((stop) => stop.siteId) ?? [],
    [snapshot?.facilityStops],
  );

  const selectUnit = (unit: UnitView) =>
    dispatch({
      type: "selectUnit",
      unit: { id: unit.unit.id, siteId: unit.unit.siteId, floor: unit.unit.floor },
    });

  const selectUnitById = (unitId: string) => {
    const found = view?.byId.get(unitId);
    if (found) selectUnit(found);
  };

  const runCommand = (command: UnitCommand) => {
    if (!selected) return;
    const unit = selected.unit;
    unitCommand.mutate(
      { unitId: unit.id, command },
      { onSuccess: () => toast(commandSentMessage(command, unit)), onError: refused },
    );
  };

  const acknowledge = (alarms: readonly Alarm[]) => {
    dispatch({ type: "askAck", target: null });
    acknowledgeAlarms.mutate(
      alarms.map((alarm) => alarm.seq),
      {
        onSuccess: () =>
          toast(
            alarms.length === 1
              ? `Acknowledged — you own ${alarms[0]?.unitId ?? "this alarm"}. The condition is still active.`
              : `All ${alarms.length} alarms acknowledged — ownership recorded, nothing cleared.`,
          ),
        onError: refused,
      },
    );
  };

  const selectSite = (next: Site) => {
    const units = view?.units.filter((u) => u.unit.siteId === next.id) ?? [];
    dispatch({
      type: "selectSite",
      siteId: next.id,
      floor: floorToOpen(next.floors, units) ?? "",
    });
  };

  if (sites.isError || fleet.isError) {
    return <StartupFailure onRetry={() => window.location.reload()} />;
  }
  if (!site || !snapshot || !view) {
    return <StartupPending />;
  }

  const floor = ui.floor || floorToOpen(site.floors, siteUnits) || "";
  const isStopped = stoppedSiteIds.includes(site.id);
  const isDark = view.darkSites.has(site.id);
  const faultCount = siteUnits.filter((unit) => unit.state === "error").length;
  const stoppedAt = snapshot.facilityStops.find((stop) => stop.siteId === site.id)?.since;
  // Every unit here is silent, so any of their ages answers "how long has this been dark".
  const silentFor = Math.max(0, ...siteUnits.map((unit) => unit.unit.silentFor ?? 0));

  const confirmEmergencyStop = () => {
    const engaged = ui.confirm === "stop";
    dispatch({ type: "confirm", kind: null });
    emergencyStop.mutate(
      { siteId: site.id, engaged },
      {
        onSuccess: () =>
          toast(
            engaged
              ? `${site.name} E-stopped — ${siteUnits.length} units held. Other facilities unaffected.`
              : `E-stop released at ${site.name} — units resume their own reported states.`,
          ),
        onError: refused,
      },
    );
  };

  return (
    <div className="app">
      {/* The registry lists every unit and the map carries a button per robot, so reaching
          the inspector by Tab alone means passing thirty controls. Landmarks solve this for
          a screen reader; a keyboard user with sight needs these. */}
      <nav className="skip-links" aria-label="Skip to">
        <a href="#registry">Skip to the fleet registry</a>
        <a href="#floor-plan">Skip to the floor plan</a>
        <a href="#inspector">Skip to the inspector</a>
      </nav>

      <Header
        sites={siteList}
        fleet={view}
        siteUnits={siteUnits}
        currentSite={site}
        stoppedSiteIds={stoppedSiteIds}
        serverTime={snapshot.serverTime}
        theme={ui.theme}
        settingsOpen={ui.settingsOpen}
        onSelectSite={selectSite}
        onSettingsOpenChange={(open) => dispatch({ type: "settings", open })}
        onThemeChange={(theme) => dispatch({ type: "setTheme", theme })}
        onEmergencyStop={() =>
          dispatch({ type: "confirm", kind: isStopped ? "release" : "stop" })
        }
      />

      <Banners
        site={site}
        dark={isDark}
        stopped={isStopped}
        unitCount={siteUnits.length}
        faultCount={faultCount}
        silentFor={silentFor}
        stoppedAt={stoppedAt ? formatClock(stoppedAt) : null}
      />

      <main className="columns">
        <FleetRegistry
          site={site}
          units={siteUnits}
          bucket={ui.bucket}
          floorFilter={ui.floorFilter}
          query={ui.query}
          shownFloor={floor}
          selectedUnitId={ui.selectedUnitId}
          onBucketChange={(bucket) => dispatch({ type: "setBucket", bucket })}
          onFloorFilterChange={(next) => dispatch({ type: "setFloorFilter", floor: next })}
          onQueryChange={(query) => dispatch({ type: "setQuery", query })}
          onClearFilters={() => dispatch({ type: "clearFilters" })}
          onSelectUnit={selectUnit}
        />

        <FloorPlanPanel
          site={site}
          units={siteUnits}
          floor={floor}
          zoom={ui.zoom}
          selectedUnitId={ui.selectedUnitId}
          connection={connection}
          dark={isDark}
          stopped={isStopped}
          silentFor={silentFor}
          onSelectFloor={(next) => dispatch({ type: "setFloor", floor: next })}
          onZoom={(zoom) => dispatch({ type: "setZoom", zoom })}
          onSelectUnit={selectUnit}
        />

        <section
          className="panel inspector"
          id="inspector"
          aria-label="Inspector"
          tabIndex={-1}
        >
          {inspectorMode(ui) === "confirm" && ui.confirm ? (
            <EmergencyStopConfirm
              kind={ui.confirm}
              site={site}
              otherSites={siteList.filter((candidate) => candidate.id !== site.id)}
              unitCount={siteUnits.length}
              faultCount={faultCount}
              onConfirm={confirmEmergencyStop}
              onCancel={() => dispatch({ type: "confirm", kind: null })}
            />
          ) : selected ? (
            <UnitInspector
              view={selected}
              site={site}
              alarms={siteAlarms.filter((alarm) => alarm.unitId === selected.unit.id)}
              pendingAck={ui.pendingAck}
              busy={unitCommand.isPending}
              onClose={() => dispatch({ type: "selectUnit", unit: null })}
              onCommand={runCommand}
              onAsk={(target) => dispatch({ type: "askAck", target })}
              onAcknowledge={acknowledge}
            />
          ) : (
            <AlarmConsole
              site={site}
              alarms={siteAlarms}
              pendingAck={ui.pendingAck}
              onAsk={(target) => dispatch({ type: "askAck", target })}
              onAcknowledge={acknowledge}
              onSelectUnit={selectUnitById}
            />
          )}
        </section>
      </main>

      <Toast message={ui.toast} />
    </div>
  );
}

/**
 * Before the first snapshot there is nothing truthful to draw.
 *
 * Skeleton panels would imply a fleet exists and is merely late; an empty frame with a line
 * of text says what is actually happening.
 */
function StartupPending() {
  return (
    <div className="app app-startup">
      <p>Connecting to the fleet…</p>
    </div>
  );
}

function StartupFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="app app-startup">
      <p>
        <strong>The fleet service is not reachable.</strong>
      </p>
      <p>Nothing on this screen would be current, so nothing is shown.</p>
      <button type="button" className="btn btn-primary btn-lg" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
