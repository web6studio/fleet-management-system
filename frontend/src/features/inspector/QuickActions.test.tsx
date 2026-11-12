// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { unitActions } from "../../domain/actions";
import { makeUnit, viewOf } from "../../test-fixtures";
import { QuickActions } from "./QuickActions";

function renderActions(unit = makeUnit("PUD-101"), snapshotOverrides = {}) {
  const view = viewOf(unit, snapshotOverrides);
  const onRun = vi.fn();
  render(
    <QuickActions actions={unitActions(view.unit, view.state)} busy={false} onRun={onRun} />,
  );
  return onRun;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// A control that cannot act is dead *and* says why, on screen.
//
// `domain/actions` already proves every blocked action carries a reason. This proves the
// panel puts that reason in front of the operator rather than dropping it: a greyed-out
// button with the explanation left in a prop is exactly the screen that teaches people to
// distrust every other control.
it("disables a blocked action and prints its reason", () => {
  renderActions(makeUnit("GAU-203", { state: "error", errorCode: "E42" }));

  expect(screen.getByRole("button", { name: /Resume task/ })).toHaveProperty("disabled", true);

  // Each reason is attributed to the action it blocks. A bare list of sentences would not
  // tell an operator which dead button it is about.
  const reasons = screen.getAllByRole("listitem").map((item) => item.textContent);
  expect(reasons).toContain("Resume task — Clear the fault first");
});

it("leaves an action that can run enabled, with nothing to explain", async () => {
  const onRun = renderActions(makeUnit("PUD-101", { state: "active" }));

  const stop = screen.getByRole("button", { name: /Stop/ });
  expect(stop).toHaveProperty("disabled", false);

  await userEvent.click(stop);
  expect(onRun).toHaveBeenCalledWith("stop");
});

// Prevents a second stop being sent while the first is still in flight. The server would
// refuse it, and the operator would read the refusal as the first one having failed.
it("holds every control while a command is in flight", () => {
  const view = viewOf(makeUnit("PUD-101"));
  render(
    <QuickActions actions={unitActions(view.unit, view.state)} busy={true} onRun={vi.fn()} />,
  );
  for (const button of screen.getAllByRole("button")) {
    expect(button).toHaveProperty("disabled", true);
  }
});

// Prevents a unit that has gone quiet accepting orders: nothing can be delivered to it.
it("blocks everything on a unit with no link, and says so", () => {
  renderActions(makeUnit("PUD-166", { state: "offline" }));

  for (const button of screen.getAllByRole("button")) {
    expect(button).toHaveProperty("disabled", true);
  }
  const reasons = screen.getAllByRole("listitem").map((item) => item.textContent);
  expect(reasons).toContain("Stop — No link — a stop cannot be delivered");
});
