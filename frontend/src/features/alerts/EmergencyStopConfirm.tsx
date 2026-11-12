import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { StatusDisc } from "../../components/StatusDisc";
import type { Site } from "../../domain/types";

export interface EmergencyStopConfirmProps {
  kind: "stop" | "release";
  site: Site;
  otherSites: readonly Site[];
  unitCount: number;
  faultCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Mode C: the confirmation, in the right column rather than in a modal.
 *
 * A modal would cover the map and the registry, the two things an operator should be
 * looking at while deciding whether to halt a building. Keeping it in the column leaves the
 * evidence on screen next to the decision.
 */
export function EmergencyStopConfirm({
  kind,
  site,
  otherSites,
  unitCount,
  faultCount,
  onConfirm,
  onCancel,
}: EmergencyStopConfirmProps) {
  const stopping = kind === "stop";
  const others = otherSites.map((s) => s.name).join(" and ");

  const facts = stopping
    ? [
        {
          head: "Every floor.",
          text: `Applies to all ${site.floors.length} floors, regardless of the floor or filter you are viewing.`,
        },
        {
          head: "Faults stay.",
          text: `${faultCount} units are in error and remain in error — stopping clears nothing.`,
        },
        {
          head: "This facility only.",
          text: `${others} keep running; their operators cannot see this screen.`,
        },
      ]
    : [
        {
          head: "Units resume their own state.",
          text: "Each unit returns to what it reports — the dashboard does not guess.",
        },
        {
          head: "Faults stay.",
          text: `${faultCount} units are still in error and will not move.`,
        },
        {
          head: "Check the zone.",
          text: "Confirm with staff on the floor that people are clear.",
        },
      ];

  return (
    <>
      <div className="panel-head">
        <StatusDisc tone={stopping ? "error" : "stopped"} icon="estop" size={28} />
        <h2>{stopping ? "Confirm emergency stop" : "Release emergency stop"}</h2>
      </div>

      <div className="confirm-body">
        <p className="confirm-lead">
          {stopping
            ? `Halt all ${unitCount} units at ${site.name} where they stand?`
            : `Release the E-stop at ${site.name} and let ${unitCount} units resume?`}
        </p>

        <ul className="confirm-facts">
          {facts.map((fact) => (
            <li className="confirm-fact" key={fact.head}>
              <Icon name="infoCircle" size={16} className="confirm-fact-icon" />
              <span>
                <strong className="confirm-fact-head">{fact.head}</strong> {fact.text}
              </span>
            </li>
          ))}
        </ul>

        <div className="confirm-actions">
          <Button
            variant={stopping ? "danger" : "outline-stop"}
            size="lg"
            block
            onClick={onConfirm}
          >
            {stopping ? `Stop all ${unitCount} units` : "Release E-Stop"}
          </Button>
          <Button variant="ghost" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        <p className="confirm-disclaimer">
          A supervisory stop sent over the network. A certified E-stop cuts power in hardware,
          which a browser cannot promise — the floor's physical E-stops remain the safety
          function.
        </p>
      </div>
    </>
  );
}
