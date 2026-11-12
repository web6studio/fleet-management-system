import { Icon } from "../../components/Icon";
import { StatusDisc } from "../../components/StatusDisc";
import type { FleetView } from "../../domain/status";
import { countNeedingAttention } from "../../domain/status";
import type { Site } from "../../domain/types";

export interface FacilityTabsProps {
  sites: readonly Site[];
  fleet: FleetView;
  currentSiteId: string;
  stoppedSiteIds: readonly string[];
  onSelect: (site: Site) => void;
}

/**
 * One flag per tab, worst condition first: unreachable, then faults, then nominal.
 *
 * The point is that an operator learns a facility is in trouble without opening it — and,
 * separately, never has to wonder why its units are standing still, which is what the
 * second orange flag answers.
 */
export function FacilityTabs({
  sites,
  fleet,
  currentSiteId,
  stoppedSiteIds,
  onSelect,
}: FacilityTabsProps) {
  const stopped = new Set(stoppedSiteIds);

  return (
    <nav className="facility-tabs" aria-label="Facilities">
      {sites.map((site) => {
        const units = fleet.units.filter((u) => u.unit.siteId === site.id);
        const dark = fleet.darkSites.has(site.id);
        const needing = countNeedingAttention(units);
        const isStopped = stopped.has(site.id);
        const current = site.id === currentSiteId;

        const condition = dark
          ? ", no telemetry"
          : needing > 0
            ? `, ${needing} need attention`
            : ", nominal";

        // The flag beside the name is a shape and a colour; this is the sentence it means.
        // It is appended to the visible label rather than replacing it: an accessible name
        // that does not contain the words on the control cannot be spoken to activate it.
        const spoken = `${condition}${isStopped ? ", E-stopped" : ""}`;

        return (
          <button
            key={site.id}
            type="button"
            className="facility-tab"
            aria-current={current}
            title={`${site.name}${spoken}`}
            onClick={() => onSelect(site)}
          >
            <span>{site.name}</span>
            {dark ? (
              <StatusDisc tone="error" icon="noSignal" size={18} />
            ) : needing > 0 ? (
              <span className="facility-count mono">{needing}</span>
            ) : (
              <span className="facility-ok" />
            )}
            {isStopped ? (
              <span className="facility-stopped">
                <Icon name="paused" size={8} />
              </span>
            ) : null}
            <span className="visually-hidden">{spoken}</span>
          </button>
        );
      })}
    </nav>
  );
}
