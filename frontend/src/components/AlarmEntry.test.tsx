// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { makeAlarm } from "../test-fixtures";
import { AlarmEntry } from "./AlarmEntry";

function renderEntry(props: Partial<Parameters<typeof AlarmEntry>[0]> = {}) {
  const handlers = {
    onAsk: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onSelectUnit: vi.fn(),
  };
  render(<AlarmEntry alarm={makeAlarm(12)} pending={false} {...handlers} {...props} />);
  return handlers;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Taking ownership of an alarm costs two deliberate clicks.
//
// Acknowledging is the only act here that cannot be undone and that other operators rely
// on: once owned, the next person assumes somebody is on it. A single mis-click must not be
// able to make that claim on their behalf.
it("asks before it takes ownership", async () => {
  const { onAsk, onConfirm } = renderEntry();

  await userEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
  expect(onAsk).toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
});

it("takes ownership only on the confirming click", async () => {
  const { onConfirm } = renderEntry({ pending: true });

  expect(screen.getByText("Own it?")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(onConfirm).toHaveBeenCalledOnce();
});

it("backs out without taking it", async () => {
  const { onCancel, onConfirm } = renderEntry({ pending: true });

  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
});

// An alarm somebody owns names them, and cannot be taken again.
//
// Ownership is the record of who responded. Offering the button again invites a second
// operator to overwrite it — and the server would refuse, which reads on screen as the
// acknowledgement having failed.
it("names the owner and offers no way to re-take it", () => {
  renderEntry({ alarm: makeAlarm(12, { acknowledgedBy: "M. Weber" }) });

  expect(screen.getByText(/Acknowledged · M. Weber/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
});

// Prevents an alarm that names a unit nobody can get to. The id is the shortest path from
// "something is wrong" to the panel that says what.
it("opens the unit an alarm is about", async () => {
  const { onSelectUnit } = renderEntry();

  await userEvent.click(screen.getByRole("button", { name: "GAU-203" }));
  expect(onSelectUnit).toHaveBeenCalledWith("GAU-203");
});

// Prevents a facility-wide alarm pretending to belong to a robot. "All 4 units went silent"
// is one network fault, and there is no unit to open.
it("offers no unit link on a facility-wide alarm", () => {
  renderEntry({
    alarm: makeAlarm(13, { unitId: null, kind: "Facility unreachable" }),
  });
  expect(screen.queryByRole("button", { name: /GAU-|PUD-/ })).toBeNull();
});
