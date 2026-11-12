import type { FloorPlan } from "./plan";

/**
 * The vocabulary of the product. Nothing here knows about React or about which transport
 * delivered the data.
 */

/** What a vendor reports about itself. */
export type ReportedState = "active" | "idle" | "charging" | "error" | "offline";

/**
 * What the dashboard shows, once operator and facility commands are folded in.
 *
 * `stopped` and `estop` are never reported by a unit. They are things an operator did to
 * it, and keeping them out of {@link ReportedState} is what stops a command from being
 * mistaken for telemetry.
 */
export type UnitState = ReportedState | "stopped" | "estop";

/** A subsystem is healthy, faulted, or not published by this vendor at all. */
export type Health = "ok" | "fault";

export interface Subsystems {
  lidar?: Health;
  bumper?: Health;
  drive?: Health;
  payload?: Health;
}

export interface Point {
  x: number;
  y: number;
}

/** Plan coordinates, with heading in radians counter-clockwise from +x. */
export interface Pose extends Point {
  heading: number;
}

export interface Site {
  id: string;
  name: string;
  /** Highest floor first, the order a building is read in. */
  floors: readonly string[];
  /** One plan per storey, keyed by floor id. A dock level is not a guest corridor. */
  plans: Readonly<Record<string, FloorPlan>>;
}

export interface Unit {
  id: string;
  name: string;
  /** Model family, derived from the id prefix by the vendor catalogue. */
  series: string;
  siteId: string;
  /** `null` when the vendor publishes no pose at all; such a unit can never be mapped. */
  floor: string | null;
  zone: string;
  pose: Pose | null;
  /** Recent path in plan coordinates, oldest first. */
  trail: readonly Point[];
  state: ReportedState;
  /** Present-tense verb for an active unit: "Navigating", "Cleaning", "Escorting". */
  activity?: string;
  task: string | null;
  /** 0-1, or `null` when the task reports no progress. */
  taskProgress: number | null;
  elapsed: string;
  eta?: string;
  /** Queued next mission, shown when the unit is idle or charging. */
  nextTask?: string;
  battery: number;
  voltage: number;
  speed?: number;
  /** SLAM confidence, 0-1. Absent for vendors that do not publish it. */
  localization?: number;
  /** Short operator-facing fault, e.g. "E42" or "not moving". */
  errorCode?: string;
  /** Seconds since the last frame, for a unit that has gone quiet. */
  silentFor?: number;
  subsystems: Subsystems;
}

export type Severity = 1 | 2 | 3;

export interface Alarm {
  seq: number;
  siteId: string;
  /** Wall-clock the condition was raised, as the server recorded it. */
  time: string;
  severity: Severity;
  kind: string;
  /** `null` for facility-wide alarms: the point of those is that they are one fault, not N. */
  unitId: string | null;
  detail: string;
  /** Who owns it. Server state: an alarm owned on one screen is owned on every screen. */
  acknowledgedBy: string | null;
}

/** A facility-wide stop, with the moment it was ordered so the banner can say "since". */
export interface FacilityStop {
  siteId: string;
  since: number;
}

/**
 * One consistent view of the world.
 *
 * Commands live here rather than in view state because they are facts about the fleet that
 * every operator shares: a unit stopped from one station is stopped on every station.
 */
export interface FleetSnapshot {
  /**
   * Monotonic, incremented once per published change. The stream carries the same counter,
   * so a client can tell it missed a frame and ask for a fresh snapshot rather than
   * rendering confidently stale units.
   */
  version: number;
  /** Unix milliseconds, from the server's clock. */
  serverTime: number;
  units: readonly Unit[];
  alarms: readonly Alarm[];
  /** Sites held by a facility-wide emergency stop. */
  facilityStops: readonly FacilityStop[];
  /** Units stopped individually by an operator. */
  unitStops: readonly string[];
}

export type UnitCommand = "stop" | "resume" | "start" | "dock";
