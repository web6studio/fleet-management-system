export interface MeterProps {
  /** 0-1. Values outside the range are clamped rather than overflowing the track. */
  value: number;
  /** Any CSS colour; callers pass a token so the palette stays in one file. */
  color?: string;
  height?: number;
}

/**
 * A level bar for task progress and SLAM confidence.
 *
 * Hidden from assistive technology on purpose: every bar in this product sits beside the
 * same figure written out as text, so announcing it twice would only add noise.
 */
export function Meter({ value, color, height = 6 }: MeterProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <span className="meter" aria-hidden="true" style={{ height }}>
      <span
        className="meter-fill"
        style={{ width: `${percent}%`, ...(color ? { background: color } : {}) }}
      />
    </span>
  );
}
