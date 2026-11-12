import type { ThemeChoice } from "../../app/ui-state";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { StatusDisc } from "../../components/StatusDisc";
import { countBuckets, type FleetView, type UnitView } from "../../domain/status";
import type { Site } from "../../domain/types";
import { formatClock } from "../../lib/format";
import { DisplaySettings } from "./DisplaySettings";
import { FacilityTabs } from "./FacilityTabs";
import "./header.css";

export interface HeaderProps {
  sites: readonly Site[];
  fleet: FleetView;
  siteUnits: readonly UnitView[];
  currentSite: Site;
  stoppedSiteIds: readonly string[];
  serverTime: number;
  theme: ThemeChoice;
  settingsOpen: boolean;
  onSelectSite: (site: Site) => void;
  onSettingsOpenChange: (open: boolean) => void;
  onThemeChange: (theme: ThemeChoice) => void;
  onEmergencyStop: () => void;
}

export function Header({
  sites,
  fleet,
  siteUnits,
  currentSite,
  stoppedSiteIds,
  serverTime,
  theme,
  settingsOpen,
  onSelectSite,
  onSettingsOpenChange,
  onThemeChange,
  onEmergencyStop,
}: HeaderProps) {
  const counts = countBuckets(siteUnits);
  const isStopped = stoppedSiteIds.includes(currentSite.id);

  return (
    <header className="app-header">
      <div className="brand">
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
          <rect width="30" height="30" rx="8" className="brand-tile" />
          <path d="M22.4 7.6 9.8 12.4l5.4 2.4 2.4 5.4z" className="brand-mark" />
          <circle cx="11.6" cy="18.4" r="1.6" className="brand-mark" opacity=".7" />
          <circle cx="8.2" cy="21.8" r="1.25" className="brand-mark" opacity=".45" />
        </svg>
        <h1>Fleet Management System</h1>
      </div>

      <FacilityTabs
        sites={sites}
        fleet={fleet}
        currentSiteId={currentSite.id}
        stoppedSiteIds={stoppedSiteIds}
        onSelect={onSelectSite}
      />

      <p className="site-summary">
        <strong className="mono">{siteUnits.length}</strong> units here
        {/* Spelled out with the barometer's own words. One badge reading "4 need
            attention" beside a tile reading "Attention 3" looks like a bug, every time. */}
        {counts.attention + counts.offline > 0 ? (
          <Badge tone="error" icon="alert">
            {[
              counts.attention > 0 ? `${counts.attention} attention` : null,
              counts.offline > 0 ? `${counts.offline} offline` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Badge>
        ) : (
          <Badge tone="active" icon="check">
            All nominal
          </Badge>
        )}
      </p>

      <time
        className="clock mono"
        dateTime={new Date(serverTime).toISOString()}
        title="Server time — the clock these readings are stamped with, not this computer's."
      >
        {formatClock(serverTime)}
      </time>

      <DisplaySettings
        open={settingsOpen}
        theme={theme}
        onOpenChange={onSettingsOpenChange}
        onThemeChange={onThemeChange}
      />

      {isStopped ? (
        <Button variant="outline-stop" size="lg" onClick={onEmergencyStop}>
          <StatusDisc tone="stopped" icon="resume" size={18} />
          Release E-Stop
          <span className="visually-hidden"> at {currentSite.name}</span>
        </Button>
      ) : (
        <Button variant="danger" size="lg" icon="estop" onClick={onEmergencyStop}>
          E-Stop all floors
          <span className="visually-hidden"> — every unit at {currentSite.name}</span>
        </Button>
      )}
    </header>
  );
}
