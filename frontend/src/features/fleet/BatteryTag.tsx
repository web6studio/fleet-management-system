import { BAND_TONE } from "../../components/status-tone";
import { BAND_LABEL, bandOf } from "../../domain/battery";

export interface BatteryTagProps {
  percent: number;
  /** A silent unit's charge is a last-known value, so it is shown without a band colour. */
  stale?: boolean;
}

/** Inner width of the battery glyph, in its own 17 × 10 viewBox. */
const CELL_WIDTH = 10.4;

/**
 * Charge as a level and a number.
 *
 * The glyph fills proportionally so the row can be scanned without reading digits, and the
 * band tint only appears below 30% — a wall of green pills would make the amber ones
 * invisible.
 */
export function BatteryTag({ percent, stale }: BatteryTagProps) {
  const band = bandOf(percent);
  const neutral = stale || band === "normal";
  const classes = ["battery-tag"];
  if (!neutral) classes.push(`tone-${BAND_TONE[band]}`, "battery-tag-banded");
  if (stale) classes.push("battery-tag-stale");

  return (
    <span className={classes.join(" ")} title={`Battery ${percent}% — ${BAND_LABEL[band]}`}>
      <svg width="17" height="10" viewBox="0 0 17 10" aria-hidden="true">
        <rect
          x=".75"
          y=".75"
          width="13.5"
          height="8.5"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          opacity=".8"
        />
        <rect
          x="15"
          y="3.3"
          width="1.4"
          height="3.4"
          rx=".6"
          fill="currentColor"
          opacity=".8"
        />
        <rect
          x="2.3"
          y="2.3"
          width={Math.max(1, (percent / 100) * CELL_WIDTH)}
          height="5.4"
          rx=".8"
          className="battery-tag-fill"
        />
      </svg>
      <span className="mono">{percent}%</span>
    </span>
  );
}
