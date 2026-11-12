import { expect, test } from "@playwright/test";

/**
 * The operator's path through the console, against the shipped binary.
 *
 * Everything asserted here is stable by construction: the simulator seeds the same fleet
 * every run, and nothing below depends on where a robot happens to be. Positions move once
 * a second and are deliberately never asserted.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // Telemetry has arrived when the stream says so; nothing else on the page is meaningful
  // before that, and waiting for it is what keeps the rest of the suite free of sleeps.
  await expect(page.getByText("Live · 1 Hz")).toBeVisible({ timeout: 20_000 });
});

test("opens on three columns with a fleet in them", async ({ page }) => {
  await expect(page.getByRole("region", { name: "Fleet registry" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Floor plan" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Inspector" })).toBeVisible();

  await expect(page.getByRole("navigation", { name: "Facilities" })).toBeVisible();
  await expect(page.getByText(/units here/)).toBeVisible();
});

// The unit an operator must act on is the first one on screen.
//
// Unit tests prove the ordering rule and the registry renders it. This proves the whole
// chain: the server's fixtures, the wire, the derivation and the panel all agree, against
// the binary that ships.
test("puts the faulted units at the top of the registry", async ({ page }) => {
  const registry = page.getByRole("region", { name: "Fleet registry" });
  const rows = registry.getByRole("button").filter({ hasText: /^(PUD|GAU|ORI)-\d+/ });

  await expect(rows.first()).toContainText("Error");
});

test("opens a unit and explains what it will not do", async ({ page }) => {
  const registry = page.getByRole("region", { name: "Fleet registry" });
  await registry.getByRole("button", { name: /GAU-203/ }).first().click();

  const inspector = page.getByRole("region", { name: "Inspector" });
  await expect(inspector.getByRole("heading", { name: "GAU-203" })).toBeVisible();

  // A faulted unit cannot be resumed or re-tasked, and the panel says so in words rather
  // than only grey.
  await expect(inspector.getByRole("button", { name: /Resume task/ })).toBeDisabled();
  await expect(inspector.getByText(/Clear the fault first/).first()).toBeVisible();
});

// An emergency stop never lowers the attention count.
//
// Stopping a facility changes what its units are doing, not what is wrong with them. A
// counter an operator can clear by pressing a button cannot be trusted at a glance, which
// is the only way this one is read.
test("holding a facility does not clear what is wrong with it", async ({ page }) => {
  const attention = page.locator(".site-summary");
  const before = (await attention.textContent()) ?? "";
  expect(before).toMatch(/attention/);

  await page.getByRole("button", { name: /E-Stop all floors/ }).click();

  const inspector = page.getByRole("region", { name: "Inspector" });
  await expect(inspector.getByRole("heading", { name: "Confirm emergency stop" })).toBeVisible();
  await inspector.getByRole("button", { name: /^Stop all \d+ units$/ }).click();

  await expect(page.getByRole("button", { name: /Release E-Stop/ })).toBeVisible();
  await expect(attention).toHaveText(before);

  // Put the fleet back, so the specs after this one see the facility they expect.
  await page.getByRole("button", { name: /Release E-Stop/ }).click();
  await inspector.getByRole("button", { name: "Release E-Stop" }).click();
  await expect(page.getByRole("button", { name: /E-Stop all floors/ })).toBeVisible();
});

// Prevents "3 of 16" following an operator into a building they have not looked at yet.
// A filter nobody remembers setting is how a fault gets missed.
test("switching facility drops the filters set on the last one", async ({ page }) => {
  const registry = page.getByRole("region", { name: "Fleet registry" });
  await registry.getByRole("searchbox").fill("GAU");
  await expect(registry.getByText(/of \d+ units/)).toBeVisible();

  await page.getByRole("button", { name: /Klinikum Süd/ }).click();

  await expect(registry.getByRole("searchbox")).toHaveValue("");
  await expect(registry.getByText(/^\d+ units · sorted by severity$/)).toBeVisible();
});

// Prevents a hue that means "fault" changing meaning with the lighting. Surfaces flip;
// the six status colours do not.
test("keeps the status palette when the theme flips", async ({ page }) => {
  const disc = page.locator(".registry-list .status-disc").first();
  const before = await disc.evaluate((node) => getComputedStyle(node).backgroundColor);

  await page.getByRole("button", { name: "Display settings" }).click();
  await page.getByRole("button", { name: "Light" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const after = await disc.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(after).toBe(before);
});
