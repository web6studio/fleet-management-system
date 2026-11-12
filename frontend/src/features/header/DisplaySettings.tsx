import type { ThemeChoice } from "../../app/ui-state";
import { IconButton } from "../../components/Button";
import { Popover } from "../../components/Popover";

export interface DisplaySettingsProps {
  open: boolean;
  theme: ThemeChoice;
  onOpenChange: (open: boolean) => void;
  onThemeChange: (theme: ThemeChoice) => void;
}

const THEMES: readonly { value: ThemeChoice; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

/**
 * Display preferences live behind their own control.
 *
 * A theme switch sitting loose in the header, next to an emergency stop, trains exactly the
 * wrong reflex. It also gives the next preference, whether that is density or units or
 * refresh rate, a home that is not the header.
 */
export function DisplaySettings({
  open,
  theme,
  onOpenChange,
  onThemeChange,
}: DisplaySettingsProps) {
  return (
    <div className="settings">
      <IconButton
        icon="sliders"
        label="Display settings"
        variant="ghost"
        size="lg"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      />
      <Popover open={open} title="Display" onClose={() => onOpenChange(false)}>
        <fieldset className="segmented">
          <legend className="visually-hidden">Theme</legend>
          {THEMES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => onThemeChange(value)}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <p className="settings-note">
          Dark is the control-room default and Light is for stations in daylight. System follows
          the device setting. Status colours are identical in both themes.
        </p>
      </Popover>
    </div>
  );
}
