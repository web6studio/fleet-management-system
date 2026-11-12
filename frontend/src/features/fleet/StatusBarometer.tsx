import type { Bucket } from "../../domain/status";
import { BUCKETS } from "../../domain/status";

export interface StatusBarometerProps {
  counts: Record<Bucket, number>;
  total: number;
  active: Bucket | null;
  onToggle: (bucket: Bucket | null) => void;
}

/**
 * Four counters that always sum to the fleet, each its own filter.
 *
 * The composition bar underneath is the same four numbers as proportion: it answers "is
 * this a good shift" in one glance, which four digits do not.
 */
export function StatusBarometer({ counts, total, active, onToggle }: StatusBarometerProps) {
  return (
    <>
      <div className="barometer">
        {BUCKETS.map(({ key, label, hint }) => {
          const pressed = active === key;
          // What the bucket holds, plus the fact that it filters: four tiles in a row do
          // not read as controls until one of them has been pressed once.
          const filters = pressed
            ? "Click to show the whole fleet again."
            : "Click to list only these.";
          return (
            <button
              key={key}
              type="button"
              className={`barometer-tile bucket-${key}`}
              aria-pressed={pressed}
              title={`${hint}\n${filters}`}
              onClick={() => onToggle(pressed ? null : key)}
            >
              <span
                className={
                  counts[key] ? "barometer-count mono" : "barometer-count mono is-zero"
                }
              >
                {counts[key]}
              </span>
              <span className="barometer-label">
                <span className="barometer-swatch" />
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="composition" aria-hidden="true">
        {BUCKETS.filter(({ key }) => counts[key] > 0).map(({ key }) => (
          <span
            key={key}
            className={`composition-part bucket-${key}`}
            style={{ width: `${(counts[key] / total) * 100}%` }}
          />
        ))}
      </div>
    </>
  );
}
