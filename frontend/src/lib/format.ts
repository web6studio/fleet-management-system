const pad = (n: number) => String(n).padStart(2, "0");

/** "2m 14s" — how an operator says an age out loud. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}m ${pad(whole % 60)}s`;
}

/** 24-hour wall clock, because a control room is. */
export function formatClock(epochMs: number): string {
  const date = new Date(epochMs);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatMetres(value: number): string {
  return `${value.toFixed(2)} m`;
}

/** Heading in degrees clockwise from north-up, normalised to 0–359. */
export function formatHeading(radians: number): string {
  const degrees = Math.round(((radians * 180) / Math.PI) % 360);
  return `${(degrees + 360) % 360}°`;
}

export function formatSpeed(metresPerSecond: number): string {
  return `${metresPerSecond.toFixed(2)} m/s`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
