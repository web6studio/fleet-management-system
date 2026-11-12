import { expect, test } from "@playwright/test";

/**
 * Operating the screen without a mouse.
 *
 * axe cannot answer this: a page can pass every automated rule and still be unusable from a
 * keyboard. What makes it work here is that every control is a real `<button>` — the
 * assertions below are what stop that quietly becoming a `<div onClick>`.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Live · 1 Hz")).toBeVisible({ timeout: 20_000 });
});

// The inspector is reachable without passing thirty controls first.
//
// The registry lists every unit and the map carries a button per robot. Without a way past
// them, a keyboard user tabs about thirty times to reach the panel the actions are on —
// which in practice means the screen is mouse-only.
test("offers a way past the long lists", async ({ page }) => {
  await page.keyboard.press("Tab");

  const skip = page.getByRole("link", { name: "Skip to the fleet registry" });
  await expect(skip).toBeFocused();

  await page.getByRole("link", { name: "Skip to the inspector" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Inspector" })).toBeFocused();
});

// Every control can be reached and operated from the keyboard.
//
// Prevents the regression that a `<div onClick>` introduces: it looks identical, works with
// a mouse, and is invisible to Tab. Selecting a unit from the registry is the path an
// operator takes most, so it is the one pinned here.
test("selects a unit from the registry with the keyboard alone", async ({ page }) => {
  const registry = page.getByRole("region", { name: "Fleet registry" });
  const firstRow = registry.getByRole("button").filter({ hasText: /^(PUD|GAU|ORI)-\d+/ }).first();

  await firstRow.focus();
  await expect(firstRow).toBeFocused();
  await page.keyboard.press("Enter");

  const inspector = page.getByRole("region", { name: "Inspector" });
  await expect(inspector.getByRole("heading", { name: /^(PUD|GAU|ORI)-\d+$/ })).toBeVisible();
});

// Prevents a popover that traps or ignores the keyboard. Escape is the only way out that
// needs no pointer, and a dialog without it is a dead end.
test("closes the display settings with Escape", async ({ page }) => {
  await page.getByRole("button", { name: "Display settings" }).click();
  await expect(page.getByRole("dialog", { name: "Display" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Display" })).toBeHidden();
});

// Prevents focus styling that exists in the stylesheet but never shows. A keyboard user who
// cannot see where they are is no better off than one who cannot move.
test("shows where the focus is", async ({ page }) => {
  await page.getByRole("button", { name: /E-Stop all floors/ }).focus();

  const outline = await page
    .getByRole("button", { name: /E-Stop all floors/ })
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return `${style.outlineStyle} ${style.outlineWidth}`;
    });

  expect(outline).not.toBe("none 0px");
});
