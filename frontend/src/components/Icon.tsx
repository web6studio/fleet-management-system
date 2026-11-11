import type { ReactElement } from "react";

/**
 * The icon set, inline.
 *
 * Every glyph is drawn in `currentColor` so a status disc, a button and a legend swatch can
 * reuse the same mark without a second asset. Icons are decorative by default: the label
 * beside them carries the meaning, which is the rule that keeps colour from being the only
 * channel.
 */
export type IconName =
  | "active"
  | "idle"
  | "charging"
  | "paused"
  | "alert"
  | "offline"
  | "info"
  | "check"
  | "search"
  | "sliders"
  | "close"
  | "estop"
  | "resume"
  | "start"
  | "dock"
  | "zoomIn"
  | "zoomOut"
  | "fit"
  | "noSignal"
  | "noPosition"
  | "clock"
  | "infoCircle";

const stroke = (d: string, width = 1.6) => (
  <path className="icon-stroke" d={d} strokeWidth={width} />
);

const ICONS: Record<IconName, { box: string; body: ReactElement }> = {
  active: { box: "0 0 10 10", body: <path d="M2.8 1.8 8.6 5 2.8 8.2z" fill="currentColor" /> },
  idle: {
    box: "0 0 10 10",
    body: <circle cx="5" cy="5" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />,
  },
  charging: {
    box: "0 0 10 10",
    body: <path d="M5.9.8 2.2 5.6h2.5l-.6 3.6 3.9-5H5.5z" fill="currentColor" />,
  },
  paused: {
    box: "0 0 10 10",
    body: (
      <>
        <rect x="2.2" y="2" width="2" height="6" rx=".6" fill="currentColor" />
        <rect x="5.8" y="2" width="2" height="6" rx=".6" fill="currentColor" />
      </>
    ),
  },
  alert: {
    box: "0 0 10 10",
    body: (
      <>
        <rect x="4.2" y="1.6" width="1.6" height="4.6" rx=".6" fill="currentColor" />
        <rect x="4.2" y="7.1" width="1.6" height="1.6" rx=".6" fill="currentColor" />
      </>
    ),
  },
  offline: {
    box: "0 0 10 10",
    body: (
      <>
        <circle cx="5" cy="5" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M2.4 7.6 7.6 2.4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </>
    ),
  },
  info: {
    box: "0 0 10 10",
    body: (
      <>
        <rect x="4.2" y="1.4" width="1.6" height="1.6" rx=".6" fill="currentColor" />
        <rect x="4.2" y="3.9" width="1.6" height="4.7" rx=".6" fill="currentColor" />
      </>
    ),
  },
  check: { box: "0 0 16 16", body: stroke("m3 8.5 3 3 7-7", 2.2) },
  search: {
    box: "0 0 16 16",
    body: (
      <>
        <circle className="icon-stroke" cx="7" cy="7" r="4.5" strokeWidth="1.6" />
        {stroke("m10.5 10.5 3.5 3.5")}
      </>
    ),
  },
  sliders: {
    box: "0 0 16 16",
    body: (
      <>
        {stroke("M2 4.5h7.5M12.5 4.5H14M2 11.5h2.5M7.5 11.5H14")}
        <circle className="icon-stroke" cx="11" cy="4.5" r="1.6" strokeWidth="1.6" />
        <circle className="icon-stroke" cx="6" cy="11.5" r="1.6" strokeWidth="1.6" />
      </>
    ),
  },
  close: { box: "0 0 16 16", body: stroke("m4 4 8 8M12 4l-8 8", 2) },
  estop: {
    box: "0 0 22 22",
    body: (
      <>
        <path
          className="icon-stroke"
          d="M7.4 1.5h7.2l5.9 5.9v7.2l-5.9 5.9H7.4l-5.9-5.9V7.4z"
          strokeWidth="2"
        />
        <path d="M7 11h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </>
    ),
  },
  resume: { box: "0 0 16 16", body: stroke("M5 3.5 12 8l-7 4.5z") },
  start: { box: "0 0 16 16", body: stroke("M3 13V3M3 3h8l-1.6 2.6L11 8.2H3") },
  dock: {
    box: "0 0 16 16",
    body: (
      <>
        {stroke("M2.5 7.3 8 2.8l5.5 4.5v6.2h-11z")}
        {stroke("M8.7 7 7 9.6h2.1l-1.7 2.5")}
      </>
    ),
  },
  zoomIn: { box: "0 0 16 16", body: stroke("M8 3.5v9M3.5 8h9") },
  zoomOut: { box: "0 0 16 16", body: stroke("M3.5 8h9") },
  fit: {
    box: "0 0 16 16",
    body: stroke("M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"),
  },
  noSignal: {
    box: "0 0 16 16",
    body: stroke(
      "M2 2l12 12M3 6.3a7.4 7.4 0 0 1 3-1.7M10.5 4.8A7.4 7.4 0 0 1 13 6.3M5 8.6a4.5 4.5 0 0 1 2-1M8 12.2h.01",
      1.8,
    ),
  },
  noPosition: {
    box: "0 0 16 16",
    body: stroke(
      "M12.3 9.6c.2-.6.2-1.1.2-1.6A4.5 4.5 0 0 0 5.6 4.3M3.6 6.2c-.1.6-.1 1.1-.1 1.8C3.5 11 8 14.5 8 14.5s1.3-1 2.5-2.4M2 2l12 12",
    ),
  },
  clock: {
    box: "0 0 16 16",
    body: (
      <>
        <circle className="icon-stroke" cx="8" cy="8" r="5.5" strokeWidth="2" />
        {stroke("M8 5v3.2l2 1.3", 2)}
      </>
    ),
  },
  infoCircle: {
    box: "0 0 16 16",
    body: (
      <>
        <circle className="icon-stroke" cx="8" cy="8" r="6" strokeWidth="1.6" />
        {stroke("M8 7.2V11M8 5v.1")}
      </>
    ),
  },
};

export interface IconProps {
  name: IconName;
  size?: number;
  /** Supply a label only when the icon is the sole carrier of meaning. */
  label?: string;
  className?: string;
}

export function Icon({ name, size = 16, label, className }: IconProps) {
  const { box, body } = ICONS[name];
  return (
    <svg
      viewBox={box}
      width={size}
      height={size}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {body}
    </svg>
  );
}
