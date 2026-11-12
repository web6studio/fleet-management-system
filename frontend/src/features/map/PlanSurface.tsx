import type { FloorPlan } from "../../domain/plan";
import type { TrailSegment } from "./geometry";

export interface UnitTrail {
  unitId: string;
  segments: readonly TrailSegment[];
}

export interface PlanSurfaceProps {
  plan: FloorPlan;
  /** Dotted paths for every mapped unit. */
  trails: readonly UnitTrail[];
  /** Solid path for the selected unit, drawn last so it reads above the rest. */
  selectedTrail: readonly TrailSegment[];
}

/**
 * The building itself.
 *
 * Decorative: everything an operator can act on is an HTML control layered above this, so
 * the plan is hidden from assistive technology rather than read out as a list of rooms.
 */
export function PlanSurface({ plan, trails, selectedTrail }: PlanSurfaceProps) {
  return (
    <svg
      className="plan-surface"
      viewBox={`0 0 ${plan.width} ${plan.height}`}
      aria-hidden="true"
      focusable="false"
    >
      <title>Floor plan</title>
      {plan.rects.map((rect) => (
        <rect
          key={`${rect.kind}-${rect.x}-${rect.y}-${rect.w}-${rect.h}`}
          className={`plan-${rect.kind}`}
          x={rect.x}
          y={rect.y}
          width={rect.w}
          height={rect.h}
          rx={rect.rx}
        />
      ))}

      {plan.paths.map((d) => (
        <path key={d} className="plan-fixture-line" d={d} />
      ))}

      {plan.labels.map((label) => (
        <text key={label.text} className="plan-label" x={label.x} y={label.y}>
          {label.text}
        </text>
      ))}

      {trails.map((trail) =>
        trail.segments.map((segment) => (
          <path
            key={`${trail.unitId}-${segment.d}`}
            className="plan-trail"
            d={segment.d}
            strokeOpacity={segment.opacity}
          />
        )),
      )}
      {selectedTrail.map((segment) => (
        <path
          key={segment.d}
          className="plan-trail-selected"
          d={segment.d}
          strokeOpacity={segment.opacity}
        />
      ))}
    </svg>
  );
}
