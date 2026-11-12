import type { UnitView } from "../../domain/status";

export interface FloorSwitcherProps {
  floors: readonly string[];
  current: string;
  units: readonly UnitView[];
  onSelect: (floor: string) => void;
}

/**
 * Floating floor control, highest storey at the top.
 *
 * Each row carries its unit count and a red dot when something on that floor needs
 * attention — which is why this is a stack of buttons and not a dropdown: it answers
 * "where is the fleet, and where is the trouble" before being opened.
 */
export function FloorSwitcher({ floors, current, units, onSelect }: FloorSwitcherProps) {
  return (
    <nav className="floor-switcher" aria-label="Floor">
      {floors.map((floor) => {
        const onFloor = units.filter((view) => view.unit.floor === floor);
        const needsAttention = onFloor.some(
          (view) => view.bucket === "attention" || view.bucket === "offline",
        );
        // Spoken after the digits on the chip, so the accessible name contains the
        // visible text. Replacing it would make the control unspeakable.
        const spoken = ` units${needsAttention ? ", needs attention" : ""}`;

        return (
          <button
            key={floor}
            type="button"
            className="floor-switcher-item"
            aria-pressed={floor === current}
            title={`Floor ${floor}, ${onFloor.length}${spoken}`}
            onClick={() => onSelect(floor)}
          >
            {needsAttention ? (
              <span className="floor-switcher-flag" aria-hidden="true" />
            ) : null}
            <span className="mono floor-switcher-name">{floor}</span>
            <span className="mono floor-switcher-count">{onFloor.length}</span>
            <span className="visually-hidden">{spoken}</span>
          </button>
        );
      })}
    </nav>
  );
}
