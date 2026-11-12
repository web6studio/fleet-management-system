import { Icon, type IconName } from "./Icon";
import type { Tone } from "./status-tone";

export interface StatusDiscProps {
  tone: Tone;
  icon: IconName;
  /** Outer diameter in pixels. The glyph is sized from it. */
  size?: number;
  className?: string | undefined;
}

/** The solid carrier of a status colour, and the only place a status hue appears at full strength. */
export function StatusDisc({ tone, icon, size = 16, className }: StatusDiscProps) {
  return (
    <span
      className={`status-disc tone-${tone}${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={Math.round(size * 0.62)} />
    </span>
  );
}
