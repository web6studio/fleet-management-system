import { useMemo } from "react";
import type { Bucket, UnitView } from "../../domain/status";

export interface FleetFilter {
  bucket: Bucket | null;
  floor: string | null;
  query: string;
}

/**
 * Applies the registry's three filters.
 *
 * Search matches id or name because an operator has one or the other depending on whether
 * they are reading a ticket or listening to a radio.
 */
export function useFleetFilter(
  units: readonly UnitView[],
  { bucket, floor, query }: FleetFilter,
): readonly UnitView[] {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();

    return units.filter(({ unit, bucket: unitBucket }) => {
      if (bucket && unitBucket !== bucket) return false;
      if (floor && unit.floor !== floor) return false;
      if (!needle) return true;
      return unit.id.toLowerCase().includes(needle) || unit.name.toLowerCase().includes(needle);
    });
  }, [units, bucket, floor, query]);
}
