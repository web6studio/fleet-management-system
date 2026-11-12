import type { Bucket } from "../domain/status";

/** What the operator picked. `system` follows the device setting. */
export type ThemeChoice = "dark" | "light" | "system";

/** Which panel the right column is showing. Derived, never stored. */
export type InspectorMode = "alarms" | "unit" | "confirm";

export interface UiState {
  siteId: string;
  /** Floor drawn on the map. */
  floor: string;
  /** Floor chip in the registry. `null` is "All floors". */
  floorFilter: string | null;
  selectedUnitId: string | null;
  bucket: Bucket | null;
  query: string;
  confirm: "stop" | "release" | null;
  /** Alarm awaiting its second click, or "all" for the bulk acknowledgement. */
  pendingAck: number | "all" | null;
  settingsOpen: boolean;
  zoom: number;
  theme: ThemeChoice;
  toast: string | null;
}

export type UiAction =
  | { type: "selectSite"; siteId: string; floor: string }
  | { type: "selectUnit"; unit: UnitRef | null }
  | { type: "setFloor"; floor: string }
  | { type: "setFloorFilter"; floor: string | null }
  | { type: "setBucket"; bucket: Bucket | null }
  | { type: "setQuery"; query: string }
  | { type: "clearFilters" }
  | { type: "confirm"; kind: "stop" | "release" | null }
  | { type: "askAck"; target: number | "all" | null }
  | { type: "settings"; open: boolean }
  | { type: "setTheme"; theme: ThemeChoice }
  | { type: "setZoom"; zoom: number }
  | { type: "toast"; message: string | null };

export interface UnitRef {
  id: string;
  siteId: string;
  floor: string | null;
}

export const ZOOM = { min: 1, max: 2.5, step: 0.5 } as const;

export function initialUiState(theme: ThemeChoice): UiState {
  return {
    // The facility and the storey are chosen once the fleet arrives: until then there is
    // nothing to be on.
    siteId: "",
    floor: "",
    floorFilter: null,
    selectedUnitId: null,
    bucket: null,
    query: "",
    confirm: null,
    pendingAck: null,
    settingsOpen: false,
    zoom: ZOOM.min,
    theme,
    toast: null,
  };
}

export function inspectorMode(state: UiState): InspectorMode {
  if (state.confirm) return "confirm";
  return state.selectedUnitId ? "unit" : "alarms";
}

/**
 * All view state in one reducer.
 *
 * Server state (what the units report, who owns which alarm, which facilities are held)
 * lives in the fleet source. Keeping the two apart is what stops a click from writing into
 * something the next telemetry frame will silently overwrite.
 */
export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case "selectSite":
      // A different building is a different context: selection, filters and zoom belong to
      // the one being left.
      return {
        ...state,
        siteId: action.siteId,
        floor: action.floor,
        floorFilter: null,
        selectedUnitId: null,
        bucket: null,
        query: "",
        confirm: null,
        pendingAck: null,
        zoom: ZOOM.min,
      };

    case "selectUnit": {
      if (!action.unit) return { ...state, selectedUnitId: null, pendingAck: null };
      const { id, siteId, floor } = action.unit;
      const deselect = state.selectedUnitId === id;
      return {
        ...state,
        selectedUnitId: deselect ? null : id,
        siteId: deselect ? state.siteId : siteId,
        // Follow the unit to its floor, rather than leaving the operator on an empty map
        // wondering where it went.
        floor: !deselect && floor ? floor : state.floor,
        floorFilter: !deselect && floor && state.floorFilter ? floor : state.floorFilter,
        confirm: null,
        pendingAck: null,
      };
    }

    case "setFloor":
      return {
        ...showFloor(state, action.floor),
        floorFilter: state.floorFilter ? action.floor : null,
      };

    case "setFloorFilter":
      return action.floor === null
        ? { ...state, floorFilter: null }
        : { ...showFloor(state, action.floor), floorFilter: action.floor };

    case "setBucket":
      return { ...state, bucket: action.bucket };

    case "setQuery":
      return { ...state, query: action.query };

    case "clearFilters":
      return { ...state, bucket: null, query: "", floorFilter: null };

    case "confirm":
      // A confirmation takes over the right column, so nothing else may be showing there.
      return { ...state, confirm: action.kind, selectedUnitId: null, pendingAck: null };

    case "askAck":
      return { ...state, pendingAck: action.target };

    case "settings":
      return { ...state, settingsOpen: action.open };

    case "setTheme":
      return { ...state, theme: action.theme };

    case "setZoom":
      return { ...state, zoom: clamp(action.zoom, ZOOM.min, ZOOM.max) };

    case "toast":
      return { ...state, toast: action.message };
  }
}

/**
 * Draws a different storey, fitting it to the frame.
 *
 * Zoom is always aimed at something, a wing or a corridor or one robot, and none of that
 * is in the same place one floor up. `selectUnit` is the exception: it follows a unit across
 * floors and re-centres on it, so the magnification still points at what was asked for.
 */
function showFloor(state: UiState, floor: string): UiState {
  return state.floor === floor ? state : { ...state, floor, zoom: ZOOM.min };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
