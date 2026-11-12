import { describe, expect, it } from "vitest";
import { initialUiState, inspectorMode, uiReducer, ZOOM } from "./ui-state";

const base = { ...initialUiState("dark"), siteId: "hotel", floor: "F1" };

describe("selectUnit", () => {
  // Prevents selecting a unit and being left on an empty map. The registry lists every
  // floor; the map shows one, and following the selection is the whole point of clicking.
  it("follows the unit to its floor", () => {
    const next = uiReducer(base, {
      type: "selectUnit",
      unit: { id: "PUD-152", siteId: "hotel", floor: "F3" },
    });
    expect(next.selectedUnitId).toBe("PUD-152");
    expect(next.floor).toBe("F3");
  });

  // A unit with no pose has no floor to follow it to. Clearing the map floor would blank
  // the panel for every other unit as well.
  it("leaves the map alone for a unit with no position", () => {
    const next = uiReducer(base, {
      type: "selectUnit",
      unit: { id: "ORI-114", siteId: "hotel", floor: null },
    });
    expect(next.selectedUnitId).toBe("ORI-114");
    expect(next.floor).toBe("F1");
  });

  it("deselects on a second click without moving the map", () => {
    const selected = uiReducer(base, {
      type: "selectUnit",
      unit: { id: "PUD-152", siteId: "hotel", floor: "F3" },
    });
    const next = uiReducer(selected, {
      type: "selectUnit",
      unit: { id: "PUD-152", siteId: "hotel", floor: "F3" },
    });
    expect(next.selectedUnitId).toBeNull();
    expect(next.floor).toBe("F3");
  });

  // Prevents an alarm link leaving the operator in the wrong building with a selection they
  // cannot see.
  it("switches facility when the unit belongs to another one", () => {
    const next = uiReducer(base, {
      type: "selectUnit",
      unit: { id: "KLI-308", siteId: "clinic", floor: "F1" },
    });
    expect(next.siteId).toBe("clinic");
  });
});

describe("selectSite", () => {
  // Prevents filters from one building silently hiding units in the next. "3 of 16" with a
  // filter nobody remembers setting is how an operator misses a fault.
  it("drops selection, filters and zoom when the building changes", () => {
    const dirty = [
      { type: "setBucket", bucket: "attention" } as const,
      { type: "setFloorFilter", floor: "F2" } as const,
      { type: "setQuery", query: "GAU" } as const,
      { type: "setZoom", zoom: 2 } as const,
      { type: "selectUnit", unit: { id: "PUD-101", siteId: "hotel", floor: "F1" } } as const,
    ].reduce(uiReducer, base);

    const next = uiReducer(dirty, { type: "selectSite", siteId: "clinic", floor: "F2" });
    expect(next).toMatchObject({
      siteId: "clinic",
      floor: "F2",
      bucket: null,
      floorFilter: null,
      // The search box is a filter like any other. It was the one this test forgot, and an
      // end-to-end run found a query following an operator into the next building.
      query: "",
      selectedUnitId: null,
      zoom: ZOOM.min,
    });
  });
});

describe("floor filters", () => {
  // The chip and the map are one choice shown twice. Letting them drift means the list says
  // F2 while the plan shows F1, and the operator reconciles two screens in their head.
  it("keeps the map and the chip in step", () => {
    const filtered = uiReducer(base, { type: "setFloorFilter", floor: "F3" });
    expect(filtered.floor).toBe("F3");

    const moved = uiReducer(filtered, { type: "setFloor", floor: "F0" });
    expect(moved.floorFilter).toBe("F0");
  });

  it("does not start filtering the list just because the map moved", () => {
    const next = uiReducer(base, { type: "setFloor", floor: "F0" });
    expect(next.floorFilter).toBeNull();
  });

  // Prevents arriving on an unfamiliar storey already magnified onto an arbitrary quarter
  // of it. Zoom is always aimed at something, and nothing it was aimed at is in the same
  // place one floor up.
  it("fits the new storey to the frame", () => {
    const zoomed = uiReducer(base, { type: "setZoom", zoom: ZOOM.max });
    expect(uiReducer(zoomed, { type: "setFloor", floor: "F0" }).zoom).toBe(ZOOM.min);
    expect(uiReducer(zoomed, { type: "setFloorFilter", floor: "F0" }).zoom).toBe(ZOOM.min);
  });

  it("leaves the zoom alone when the floor does not actually change", () => {
    const zoomed = uiReducer(base, { type: "setZoom", zoom: ZOOM.max });
    expect(uiReducer(zoomed, { type: "setFloor", floor: "F1" }).zoom).toBe(ZOOM.max);
  });
});

describe("inspectorMode", () => {
  // Prevents a confirmation sharing the column with something else. Deciding whether to
  // halt a building is not a decision to take beside a half-read unit panel.
  it("gives a confirmation the whole column", () => {
    const selected = uiReducer(base, {
      type: "selectUnit",
      unit: { id: "PUD-101", siteId: "hotel", floor: "F1" },
    });
    expect(inspectorMode(selected)).toBe("unit");

    const confirming = uiReducer(selected, { type: "confirm", kind: "stop" });
    expect(inspectorMode(confirming)).toBe("confirm");
    expect(confirming.selectedUnitId).toBeNull();
  });

  it("falls back to the alarm console with nothing selected", () => {
    expect(inspectorMode(base)).toBe("alarms");
  });
});

describe("setZoom", () => {
  it("clamps to the usable range", () => {
    expect(uiReducer(base, { type: "setZoom", zoom: 9 }).zoom).toBe(ZOOM.max);
    expect(uiReducer(base, { type: "setZoom", zoom: 0 }).zoom).toBe(ZOOM.min);
  });
});
