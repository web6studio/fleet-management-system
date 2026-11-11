/**
 * What a floor plan is, and how its coordinate frame relates to the building.
 *
 * The geometry of a storey is domain knowledge, not a rendering detail: a unit's position
 * means nothing without the frame it is expressed in. The plans themselves arrive from the
 * server with each site.
 */

export type ShapeKind = "slab" | "room" | "corridor" | "door" | "bay" | "wall" | "fixture";

export interface PlanRect {
  kind: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
}

export interface PlanLabel {
  text: string;
  x: number;
  y: number;
}

export interface FloorPlan {
  width: number;
  height: number;
  /** Plan units per metre. 1000 × 800 units is a 50 × 40 m floor. */
  unitsPerMetre: number;
  rects: readonly PlanRect[];
  /** Stroked details: lift shafts, crossed-out service rooms. */
  paths: readonly string[];
  labels: readonly PlanLabel[];
}

/** Plan units to metres, for anything an operator reads as a distance. */
export function toMetres(units: number, plan: FloorPlan): number {
  return units / plan.unitsPerMetre;
}

/**
 * Plan y to world y.
 *
 * The plan counts y downwards like every raster; the building counts it upwards from its
 * south-west corner. Reporting the raw value would put a unit on the wrong side of the
 * floor in every coordinate an operator reads out loud.
 */
export function worldY(planY: number, plan: FloorPlan): number {
  return toMetres(plan.height - planY, plan);
}
