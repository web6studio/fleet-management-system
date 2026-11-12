import { StatusDisc } from "../../components/StatusDisc";
import type { Subsystems, Unit } from "../../domain/types";
import { formatPercent } from "../../lib/format";

export interface DiagnosticsSectionProps {
  unit: Unit;
}

const SUBSYSTEMS: readonly { key: keyof Subsystems; label: string }[] = [
  { key: "lidar", label: "Lidar / SLAM navigation" },
  { key: "bumper", label: "Collision bumpers" },
  { key: "drive", label: "Drive motors & encoders" },
  { key: "payload", label: "Actuators / payload" },
];

const FAULT_DETAIL: Record<keyof Subsystems, string> = {
  lidar: "Obstructed",
  bumper: "Contact held · E42",
  drive: "Fault",
  payload: "Fault",
};

/** What "healthy" looks like differs by machine: a scrubber has a tank, a guide has a screen. */
function healthyDetail(key: keyof Subsystems, unit: Unit): string {
  switch (key) {
    case "lidar":
      return unit.localization === undefined
        ? "Tracking"
        : `SLAM ${formatPercent(unit.localization)}`;
    case "bumper":
      return "No contact";
    case "drive":
      return "Encoders agree";
    case "payload":
      return unit.id.startsWith("GAU")
        ? "Brush & tank OK"
        : unit.id.startsWith("ORI")
          ? "Display OK"
          : "Lid closed, locked";
  }
}

export function DiagnosticsSection({ unit }: DiagnosticsSectionProps) {
  return (
    <section className="inspector-section">
      <h3>Diagnostics &amp; subsystems</h3>

      <ul className="diagnostics">
        {SUBSYSTEMS.map(({ key, label }) => {
          const health = unit.subsystems[key];
          const reported = health !== undefined;
          return (
            <li
              key={key}
              className={`diagnostic${health === "fault" ? " diagnostic-fault" : ""}${
                reported ? "" : " diagnostic-absent"
              }`}
            >
              {reported ? (
                <StatusDisc
                  tone={health === "ok" ? "active" : "error"}
                  icon={health === "ok" ? "check" : "alert"}
                  size={18}
                />
              ) : (
                <span className="diagnostic-unreported" aria-hidden="true" />
              )}
              <span className="diagnostic-name">{label}</span>
              <span className="diagnostic-detail">
                {reported
                  ? health === "ok"
                    ? healthyDetail(key, unit)
                    : FAULT_DETAIL[key]
                  : "Not reported by vendor"}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="inspector-note">
        No vendor in this fleet publishes motor or CPU temperature, so there is no row for it —
        an empty gauge would read as a cold motor.
      </p>
    </section>
  );
}
