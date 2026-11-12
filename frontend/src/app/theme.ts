import type { ThemeChoice } from "./ui-state";

/** What the operator picked. `system` follows the device setting. */
const STORAGE_KEY = "fms.theme";

/** What is actually painted. */
export type Theme = "dark" | "light";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Dark is the default rather than the device setting.
 *
 * A corporate workstation is usually in light mode, and a control room is not. The device
 * preference describes the operator's general environment, not this room, so it applies
 * only when they ask for it.
 */
export function readStoredChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "system" ? stored : "dark";
  } catch {
    // Private browsing and locked-down kiosks both throw here.
    return "dark";
  }
}

export function storeChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Not being able to remember the choice is no reason to refuse it.
  }
}

export function resolveTheme(choice: ThemeChoice): Theme {
  if (choice !== "system") return choice;
  return matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Calls back when the device switches theme. Only matters while the choice is `system`. */
export function watchDeviceTheme(onChange: () => void): () => void {
  const query = matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
