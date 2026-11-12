import type { ReactNode } from "react";
import type { IconName } from "./Icon";
import { StatusDisc } from "./StatusDisc";
import type { Tone } from "./status-tone";

export interface BadgeProps {
  tone?: Tone | undefined;
  icon?: IconName | undefined;
  /** Neutral badges carry an outline instead of a tint, as a normal battery does. */
  neutral?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * A status badge: 16% tint, 50% border, and the solid colour only inside the disc.
 *
 * Keeping the fill weak is what lets a red badge sit next to red text without either
 * shouting the other down, and what keeps the badge legible in both themes from one recipe.
 */
export function Badge({ tone, icon, neutral, children, className }: BadgeProps) {
  const classes = ["badge"];
  if (tone && !neutral) classes.push(`tone-${tone}`, "badge-tinted");
  if (neutral) classes.push("badge-neutral");
  if (className) classes.push(className);

  return (
    <span className={classes.join(" ")}>
      {tone && icon ? <StatusDisc tone={tone} icon={icon} /> : null}
      {children}
    </span>
  );
}
