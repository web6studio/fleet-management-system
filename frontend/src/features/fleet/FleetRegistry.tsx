import { useId } from "react";
import { Icon } from "../../components/Icon";
import type { Bucket, UnitView } from "../../domain/status";
import { countBuckets } from "../../domain/status";
import type { Site } from "../../domain/types";
import { StatusBarometer } from "./StatusBarometer";
import { UnitRow } from "./UnitRow";
import { useFleetFilter } from "./useFleetFilter";
import "./fleet.css";

export interface FleetRegistryProps {
  site: Site;
  /** Already ordered by triage — most urgent first. */
  units: readonly UnitView[];
  bucket: Bucket | null;
  floorFilter: string | null;
  query: string;
  shownFloor: string;
  selectedUnitId: string | null;
  onBucketChange: (bucket: Bucket | null) => void;
  onFloorFilterChange: (floor: string | null) => void;
  onQueryChange: (query: string) => void;
  onClearFilters: () => void;
  onSelectUnit: (view: UnitView) => void;
}

export function FleetRegistry({
  site,
  units,
  bucket,
  floorFilter,
  query,
  shownFloor,
  selectedUnitId,
  onBucketChange,
  onFloorFilterChange,
  onQueryChange,
  onClearFilters,
  onSelectUnit,
}: FleetRegistryProps) {
  const searchId = useId();
  const visible = useFleetFilter(units, { bucket, floor: floorFilter, query });
  const counts = countBuckets(units);
  const filtered = visible.length !== units.length;

  return (
    <section className="panel registry" id="registry" aria-label="Fleet registry" tabIndex={-1}>
      <div className="panel-head">
        <h2>Fleet</h2>
        <span className="panel-subtitle">{site.name}</span>
      </div>

      <StatusBarometer
        counts={counts}
        total={units.length}
        active={bucket}
        onToggle={onBucketChange}
      />

      <div className="registry-filters">
        <div className="search">
          <label className="visually-hidden" htmlFor={searchId}>
            Search by ID or name
          </label>
          <Icon name="search" size={15} className="search-icon" />
          <input
            id={searchId}
            type="search"
            value={query}
            placeholder="Search ID or name"
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>

        <fieldset className="floor-chips">
          <legend className="visually-hidden">Filter by floor</legend>
          <button
            type="button"
            className="chip"
            aria-pressed={floorFilter === null}
            onClick={() => onFloorFilterChange(null)}
          >
            All floors
          </button>
          {site.floors.map((floor) => (
            <button
              key={floor}
              type="button"
              className="chip"
              aria-pressed={floorFilter === floor}
              onClick={() => onFloorFilterChange(floor)}
            >
              {floor}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="registry-count">
        <span>
          {filtered ? `${visible.length} of ${units.length} units` : `${units.length} units`} ·
          sorted by severity
        </span>
        {bucket || query || floorFilter ? (
          <button type="button" className="link registry-clear" onClick={onClearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="registry-list scroll-area">
        {visible.length === 0 ? (
          <p className="registry-empty">Nothing matches that filter.</p>
        ) : (
          visible.map((view) => (
            <UnitRow
              key={view.unit.id}
              view={view}
              selected={view.unit.id === selectedUnitId}
              shownFloor={shownFloor}
              onSelect={() => onSelectUnit(view)}
            />
          ))
        )}
      </div>
    </section>
  );
}
