// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byTriage } from "../../domain/status";
import { makeSite, makeUnit, makeViews } from "../../test-fixtures";
import { FleetRegistry } from "./FleetRegistry";

const fleet = [
  makeUnit("PUD-101", { state: "active", battery: 78 }),
  makeUnit("PUD-118", { state: "idle", battery: 41 }),
  makeUnit("PUD-152", { state: "active", battery: 16 }),
  makeUnit("GAU-203", { state: "error", battery: 52, errorCode: "E42" }),
  makeUnit("PUD-166", { state: "offline", battery: 58, floor: "F2" }),
];

function renderRegistry(overrides: Partial<Parameters<typeof FleetRegistry>[0]> = {}) {
  const props = {
    site: makeSite(),
    units: [...makeViews(fleet)].sort(byTriage),
    bucket: null,
    floorFilter: null,
    query: "",
    shownFloor: "F1",
    selectedUnitId: null,
    onBucketChange: vi.fn(),
    onFloorFilterChange: vi.fn(),
    onQueryChange: vi.fn(),
    onClearFilters: vi.fn(),
    onSelectUnit: vi.fn(),
    ...overrides,
  };
  render(<FleetRegistry {...props} />);
  return props;
}

/** A barometer tile, matched on its own shape: a count followed by its label. "Offline"
 *  alone would also match the row of a unit that is offline. */
function tile(label: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(String.raw`^\d+\s*${label}$`) });
}

/** The unit ids, in the order their rows appear. Chips and counters are not rows. */
function renderedOrder(): string[] {
  return screen
    .getAllByRole("button")
    .map((element) => /^(?:PUD|GAU)-\d+/.exec(element.textContent ?? "")?.[0])
    .filter((id): id is string => id !== undefined);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The row an operator must act on is the row they see first.
//
// The ordering rule is tested on its own in `domain/status`, which is the wrong place to
// catch this one: the registry could sort correctly and still render the array it was given.
// Only rendering proves the panel puts the fault at the top.
it("renders the fleet in triage order, faults first", () => {
  renderRegistry();
  expect(renderedOrder()).toEqual(["GAU-203", "PUD-166", "PUD-152", "PUD-101", "PUD-118"]);
});

describe("the barometer", () => {
  // Prevents four counters that describe a different fleet than the list beneath them.
  it("counts every unit exactly once", () => {
    renderRegistry();
    const counts = ["Attention", "Active", "Standby", "Offline"].map((label) =>
      Number(tile(label).textContent?.match(/\d+/)?.[0] ?? -1),
    );
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(fleet.length);
  });

  it("asks for a filter when a tile is pressed", async () => {
    const props = renderRegistry();
    await userEvent.click(tile("Attention"));
    expect(props.onBucketChange).toHaveBeenCalledWith("attention");
  });
});

describe("filters", () => {
  it("shows only what matches, and says how many it hid", () => {
    renderRegistry({ query: "GAU" });
    expect(renderedOrder()).toEqual(["GAU-203"]);
    expect(screen.getByText(/1 of 5 units/)).toBeTruthy();
  });

  // Prevents a filter nobody remembers setting. "3 of 16" with no way back is how a fault
  // gets missed.
  it("offers a way out of a filter, and nothing to clear without one", async () => {
    const props = renderRegistry({ bucket: "attention" });
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(props.onClearFilters).toHaveBeenCalled();

    renderRegistry();
    expect(screen.queryAllByRole("button", { name: "Clear filters" })).toHaveLength(1);
  });

  it("says so when a filter matches nothing", () => {
    renderRegistry({ query: "nothing-like-this" });
    expect(screen.getByText("Nothing matches that filter.")).toBeTruthy();
  });
});

// Prevents a unit on another storey reading as missing. It is dimmed, not hidden: the
// registry lists the whole facility while the map shows one floor.
it("marks a unit that is not on the shown floor", () => {
  renderRegistry();
  const row = screen.getByRole("button", { name: /PUD-166/ });
  expect(within(row).getByText(/F2 ·/)).toBeTruthy();
});

it("reports the unit a row belongs to when it is clicked", async () => {
  const props = renderRegistry();
  await userEvent.click(screen.getByRole("button", { name: /GAU-203/ }));
  expect(props.onSelectUnit).toHaveBeenCalledWith(
    expect.objectContaining({ unit: expect.objectContaining({ id: "GAU-203" }) }),
  );
});
