import type { BatteryBand } from "../domain/battery";
import type { Severity, UnitState } from "../domain/types";
import type { IconName } from "./Icon";

/**
 * The bridge between domain state and the ISO palette.
 *
 * A tone is only ever a unit state, a battery band or an alarm severity. Nothing
 * interactive takes one: buttons, selection and navigation invert ink instead, so a colour
 * on this screen always answers "what is it doing", never "is this clickable".
 */
export type Tone = "active" | "idle" | "charging" | "stopped" | "error" | "offline";

export const STATE_TONE: Record<UnitState, Tone> = {
  active: "active",
  idle: "idle",
  charging: "charging",
  stopped: "stopped",
  estop: "stopped",
  error: "error",
  offline: "offline",
};

/** Colour is never alone: every disc carries a glyph as well. */
export const STATE_ICON: Record<UnitState, IconName> = {
  active: "active",
  idle: "idle",
  charging: "charging",
  stopped: "paused",
  estop: "paused",
  error: "alert",
  offline: "offline",
};

export const BAND_TONE: Record<BatteryBand, Tone> = {
  normal: "active",
  low: "charging",
  critical: "stopped",
  emergency: "error",
};

export const SEVERITY_TONE: Record<Severity, Tone> = {
  1: "error",
  2: "charging",
  3: "offline",
};

export const SEVERITY_ICON: Record<Severity, IconName> = {
  1: "alert",
  2: "alert",
  3: "info",
};
