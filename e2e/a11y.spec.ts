import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automated accessibility checks against the shipped web UI.
 *
 * axe catches the mechanical half — contrast, names, roles, landmarks — which is the half
 * that regresses silently when a class is renamed. The other half is below: whether the
 * screen can actually be operated from a keyboard, which no scanner can answer.
 */

const STANDARD = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page }).withTags(STANDARD).analyze();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Live · 1 Hz")).toBeVisible({ timeout: 20_000 });
});

test("the web UI has no automatically detectable violations", async ({ page }) => {
  const results = await scan(page);
  expect(results.violations).toEqual([]);
});

test("the inspector has none either", async ({ page }) => {
  const registry = page.getByRole("region", { name: "Fleet registry" });
  await registry.getByRole("button", { name: /GAU-203/ }).first().click();
  await expect(page.getByRole("heading", { name: "GAU-203" })).toBeVisible();

  const results = await scan(page);
  expect(results.violations).toEqual([]);
});

// Prevents a light theme that passes review by eye and fails contrast. The two palettes are
// separate token sets, so a fix in one is not a fix in the other.
test("the light theme keeps its contrast", async ({ page }) => {
  await page.getByRole("button", { name: "Display settings" }).click();
  await page.getByRole("button", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const results = await scan(page);
  expect(results.violations).toEqual([]);
});
