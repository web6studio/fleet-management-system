import type { Alarm, FacilityStop, FleetSnapshot, Site, Unit } from "../domain/types";

/**
 * The envelope of the API, as specified in `docs/api/openapi.yaml` and
 * `docs/api/websocket.md`.
 *
 * The entities themselves (`Unit`, `Alarm`, `Site`) are the domain types unchanged. Both
 * ends of this contract are written together, and a mapping layer between two identical
 * shapes is ceremony that only ever drifts.
 */

export interface SitesResponse {
  sites: readonly Site[];
}

export interface AcceptedResponse {
  accepted: true;
}

export interface AcknowledgeResponse {
  /** How many alarms changed owner. Zero is a normal answer. */
  acknowledged: number;
}

/** RFC 9457 problem details. `detail` is written for an operator and shown to one. */
export interface Problem {
  title: string;
  status: number;
  detail?: string;
}

/** Every stream frame carries the version the fleet reached once it was applied. */
interface FrameMeta {
  version: number;
  serverTime: number;
}

export type ServerFrame =
  | ({ type: "snapshot" } & FleetSnapshot)
  | ({ type: "units"; units: readonly UnitDelta[] } & FrameMeta)
  | ({ type: "alarms"; alarms: readonly Alarm[] } & FrameMeta)
  | ({
      type: "commands";
      facilityStops: readonly FacilityStop[];
      unitStops: readonly string[];
    } & FrameMeta)
  | ({ type: "heartbeat" } & FrameMeta);

/**
 * A unit in a `units` frame: everything except the trail.
 *
 * The trail grows by one point per tick, so the server sends only the new pose and the
 * client extends the history it already holds. See `docs/api/websocket.md`.
 */
export type UnitDelta = Omit<Unit, "trail">;

export type ClientFrame = { type: "resync" };

/**
 * Narrows an unknown message to a frame we handle.
 *
 * Unknown types are dropped rather than treated as an error, so the server can add a frame
 * without waiting for a client release.
 */
export function isServerFrame(value: unknown): value is ServerFrame {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "snapshot" ||
    type === "units" ||
    type === "alarms" ||
    type === "commands" ||
    type === "heartbeat"
  );
}
