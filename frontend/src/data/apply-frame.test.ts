import { describe, expect, it } from "vitest";
import type { Alarm, FleetSnapshot, Unit } from "../domain/types";
import { applyFrame } from "./apply-frame";

function unit(id: string, battery = 80): Unit {
  return {
    id,
    name: id,
    series: "Test",
    siteId: "hotel",
    floor: "F1",
    zone: "Corridor A",
    pose: { x: 0, y: 0, heading: 0 },
    trail: [],
    state: "active",
    task: null,
    taskProgress: null,
    elapsed: "0m 00s",
    battery,
    voltage: 25,
    subsystems: {},
  };
}

function alarm(seq: number, acknowledgedBy: string | null = null): Alarm {
  return {
    seq,
    siteId: "hotel",
    time: "14:00:00",
    severity: 2,
    kind: "Battery low",
    unitId: "A",
    detail: "",
    acknowledgedBy,
  };
}

const base: FleetSnapshot = {
  version: 10,
  serverTime: 1_000,
  units: [unit("A"), unit("B")],
  alarms: [alarm(2), alarm(1)],
  facilityStops: [],
  unitStops: [],
};

// A missed frame is detected, never papered over.
//
// Prevents the failure that makes a live dashboard worse than a static one. Frames are
// dropped for a slow client by design, so a client that applied version 12 on top of
// version 10 would render a fleet that never existed — with nothing on screen admitting it.
// The gap has to be noticed and repaired by asking for a snapshot.
it("reports a gap when a frame is missed", () => {
  const ahead = applyFrame(base, {
    type: "units",
    version: 12,
    serverTime: 2_000,
    units: [unit("A", 50)],
  });
  expect(ahead.status).toBe("gap");

  const next = applyFrame(base, {
    type: "units",
    version: 11,
    serverTime: 2_000,
    units: [unit("A", 50)],
  });
  expect(next.status).toBe("applied");
});

// Prevents a redelivered frame rewinding the screen. Ignoring is not an optimisation here:
// applying an older version would undo state the operator can already see.
it("ignores a frame it has already applied", () => {
  const result = applyFrame(base, {
    type: "units",
    version: 10,
    serverTime: 2_000,
    units: [unit("A", 50)],
  });
  expect(result.status).toBe("ignored");
});

// Prevents rendering deltas against nothing. Until the snapshot lands there is no fleet to
// fold them into, and an empty one is a lie rather than a loading state.
it("treats any delta before the first snapshot as a gap", () => {
  const result = applyFrame(undefined, {
    type: "heartbeat",
    version: 3,
    serverTime: 1_000,
  });
  expect(result.status).toBe("gap");
});

it("takes a snapshot whatever the local version is", () => {
  const result = applyFrame(base, { type: "snapshot", ...base, version: 1 });
  expect(result).toMatchObject({ status: "applied", snapshot: { version: 1 } });
});

describe("units", () => {
  // A units frame omits the trail, so the client has to rebuild the history itself. Getting
  // this wrong is invisible until a trail is missing, frozen, or grows without limit.
  it("extends the trail with the position the unit just left", () => {
    const moved = { ...unit("A"), pose: { x: 10, y: 20, heading: 0 } };
    const result = applyFrame(base, {
      type: "units",
      version: 11,
      serverTime: 2_000,
      units: [moved],
    });
    if (result.status !== "applied") throw new Error("expected the frame to apply");

    // base put A at 0,0; that is where it was, so that is the new trail point.
    expect(result.snapshot.units[0]?.trail).toEqual([{ x: 0, y: 0 }]);
    expect(result.snapshot.units[0]?.pose).toEqual({ x: 10, y: 20, heading: 0 });
  });

  it("leaves the trail alone when the unit has not moved", () => {
    const still = { ...unit("A"), battery: 42 };
    const result = applyFrame(base, {
      type: "units",
      version: 11,
      serverTime: 2_000,
      units: [still],
    });
    if (result.status !== "applied") throw new Error("expected the frame to apply");
    expect(result.snapshot.units[0]?.trail).toEqual([]);
  });

  // Prevents a trail that grows for as long as the tab is open.
  it("caps the trail at the window the server keeps", () => {
    let snapshot = base;
    for (let step = 1; step <= 80; step += 1) {
      const result = applyFrame(snapshot, {
        type: "units",
        version: base.version + step,
        serverTime: 2_000 + step,
        units: [{ ...unit("A"), pose: { x: step, y: 0, heading: 0 } }],
      });
      if (result.status !== "applied") throw new Error("expected the frame to apply");
      snapshot = result.snapshot;
    }

    const trail = snapshot.units[0]?.trail ?? [];
    expect(trail).toHaveLength(60);
    expect(trail.at(-1)).toEqual({ x: 79, y: 0 });
  });

  // Prevents the roster reshuffling under the operator. The registry sorts by triage, but
  // the map and the legend walk this array; a list that reorders every second is unreadable.
  it("replaces only the units it carries and keeps the order", () => {
    const result = applyFrame(base, {
      type: "units",
      version: 11,
      serverTime: 2_000,
      units: [unit("B", 12)],
    });
    if (result.status !== "applied") throw new Error("expected the frame to apply");

    expect(result.snapshot.units.map((u) => u.id)).toEqual(["A", "B"]);
    expect(result.snapshot.units[0]?.battery).toBe(80);
    expect(result.snapshot.units[1]?.battery).toBe(12);
  });
});

describe("alarms", () => {
  it("updates an alarm it already knows", () => {
    const result = applyFrame(base, {
      type: "alarms",
      version: 11,
      serverTime: 2_000,
      alarms: [alarm(1, "M. Weber")],
    });
    if (result.status !== "applied") throw new Error("expected the frame to apply");

    expect(result.snapshot.alarms).toHaveLength(2);
    expect(result.snapshot.alarms.find((a) => a.seq === 1)?.acknowledgedBy).toBe("M. Weber");
  });

  it("appends one it has not seen", () => {
    const result = applyFrame(base, {
      type: "alarms",
      version: 11,
      serverTime: 2_000,
      alarms: [alarm(3)],
    });
    if (result.status !== "applied") throw new Error("expected the frame to apply");
    expect(result.snapshot.alarms.map((a) => a.seq)).toEqual([2, 1, 3]);
  });
});

describe("commands", () => {
  // Prevents a released stop looking like a stop that is still engaged. The frame carries
  // the complete list, and an empty one has to mean "nothing is held".
  it("replaces the held lists wholesale, including with nothing", () => {
    const engaged = applyFrame(base, {
      type: "commands",
      version: 11,
      serverTime: 2_000,
      facilityStops: [{ siteId: "hotel", since: 5 }],
      unitStops: ["A"],
    });
    if (engaged.status !== "applied") throw new Error("expected the frame to apply");
    expect(engaged.snapshot.unitStops).toEqual(["A"]);

    const released = applyFrame(engaged.snapshot, {
      type: "commands",
      version: 12,
      serverTime: 3_000,
      facilityStops: [],
      unitStops: [],
    });
    if (released.status !== "applied") throw new Error("expected the frame to apply");
    expect(released.snapshot.facilityStops).toEqual([]);
    expect(released.snapshot.unitStops).toEqual([]);
  });
});
