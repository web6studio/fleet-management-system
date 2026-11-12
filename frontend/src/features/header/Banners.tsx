import { StatusDisc } from "../../components/StatusDisc";
import type { Site } from "../../domain/types";
import { formatDuration } from "../../lib/format";

export interface BannersProps {
  site: Site;
  /** Every unit at this facility has gone silent. */
  dark: boolean;
  stopped: boolean;
  unitCount: number;
  faultCount: number;
  /** Seconds since the facility's last frame. */
  silentFor: number;
  stoppedAt: string | null;
}

/**
 * The two conditions that are about the building rather than about one unit.
 *
 * Both say the same thing in different directions: the fleet is not moving, and here is why
 * so nobody spends the first minute of an incident working it out from the unit list.
 */
export function Banners({
  site,
  dark,
  stopped,
  unitCount,
  faultCount,
  silentFor,
  stoppedAt,
}: BannersProps) {
  if (!dark && !stopped) return null;

  return (
    <>
      {dark ? (
        <div className="banner banner-error" role="alert">
          <StatusDisc tone="error" icon="noSignal" size={32} />
          <div className="banner-body">
            <strong>{site.name} stopped reporting</strong>
            <span>
              All {unitCount} units went silent within 3 seconds of each other — one site
              network or gateway fault, not {unitCount} robot faults. Positions below are last
              known.
            </span>
          </div>
          <span className="banner-age mono">silent {formatDuration(silentFor)}</span>
        </div>
      ) : null}

      {stopped ? (
        <div className="banner banner-stopped" role="status">
          <StatusDisc tone="stopped" icon="paused" size={32} />
          <div className="banner-body">
            <strong>
              {site.name} is E-stopped — {unitCount} units held where they stand
            </strong>
            <span>
              Stopping cleared no fault: {faultCount} units are still in error. Release from the
              header once the zone is clear.
            </span>
          </div>
          {stoppedAt ? <span className="banner-age mono">since {stoppedAt}</span> : null}
        </div>
      ) : null}
    </>
  );
}
