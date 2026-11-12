import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ConnectionState, FleetStream } from "./stream";
import type { ServerFrame } from "./wire";

/**
 * A socket the test drives by hand.
 *
 * The reconnection policy is the point of this file, and it is all timing: real sockets and
 * real timers would make every assertion a race. Here the handshake, the drop and the clock
 * are all explicit, so a failure means the policy is wrong rather than the machine slow.
 */
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  /** Every socket the client has opened, oldest first. */
  static opened: FakeSocket[] = [];

  readyState: number = FakeSocket.CONNECTING;
  readonly sent: string[] = [];
  closedWith: { code: number; reason: string } | undefined;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.opened.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code: number, reason: string): void {
    this.closedWith = { code, reason };
    this.readyState = FakeSocket.CLOSED;
  }

  /** The handshake completing. */
  finishHandshake(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  deliver(frame: unknown): void {
    this.onmessage?.({ data: typeof frame === "string" ? frame : JSON.stringify(frame) });
  }

  /** The connection dropping from the far end. */
  drop(): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
}

let states: ConnectionState[];
let frames: ServerFrame[];

function startStream(): FleetStream {
  const stream = new FleetStream("ws://test/stream", {
    onState: (state) => states.push(state),
    onFrame: (frame) => frames.push(frame),
  });
  stream.start();
  return stream;
}

/** The socket the client is currently using. */
function latest(): FakeSocket {
  const socket = FakeSocket.opened.at(-1);
  if (!socket) throw new Error("the client opened no socket");
  return socket;
}

/** Runs the scheduled retry, whatever delay it was given. */
function runRetry(): void {
  vi.runOnlyPendingTimers();
}

beforeEach(() => {
  vi.useFakeTimers();
  // Full jitter picks a delay in [0, ceiling). Drawing the maximum makes the ceiling itself
  // the observable value; the other end of the range is asserted separately.
  vi.spyOn(Math, "random").mockReturnValue(1);

  FakeSocket.opened = [];
  states = [];
  frames = [];

  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("connecting", () => {
  it("reports connecting, then live once the handshake finishes", () => {
    startStream();
    expect(states).toEqual(["connecting"]);

    latest().finishHandshake();
    expect(states).toEqual(["connecting", "live"]);
  });

  it("passes frames through and drops what it cannot read", () => {
    startStream();
    latest().finishHandshake();

    latest().deliver({ type: "heartbeat", version: 4, serverTime: 1 });
    latest().deliver("not json at all");
    latest().deliver({ type: "something-new", version: 5 });

    expect(frames).toHaveLength(1);
    expect(frames[0]?.type).toBe("heartbeat");
  });
});

// A dropped connection comes back on its own.
//
// Prevents the failure mode an operator cannot diagnose: a screen that looks live, is not,
// and stays that way until somebody reloads. Everything below is about the client noticing
// and recovering without being asked.
describe("reconnecting", () => {
  it("opens a new socket after the old one drops", () => {
    startStream();
    latest().finishHandshake();
    expect(FakeSocket.opened).toHaveLength(1);

    latest().drop();
    expect(states.at(-1)).toBe("reconnecting");

    runRetry();
    expect(FakeSocket.opened).toHaveLength(2);

    latest().finishHandshake();
    expect(states.at(-1)).toBe("live");
  });

  // Prevents a reconnect storm. Without a growing delay, every dashboard in a control room
  // hammers a restarting server in a tight loop and keeps it down.
  it("doubles the ceiling on each failure, up to a cap", () => {
    startStream();

    const delays: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      latest().drop();
      delays.push(vi.getTimerCount() > 0 ? nextDelay() : -1);
      runRetry();
    }

    // 500 ms doubling, clamped at 15 s. Drawn at the top of the jitter range, so these
    // are the ceilings themselves.
    expect(delays).toEqual([500, 1_000, 2_000, 4_000, 8_000, 15_000, 15_000]);
  });

  // Prevents the whole room reconnecting in the same millisecond. Full jitter means the
  // delay is drawn from the entire range below the ceiling, not from a window around it.
  it("draws the delay from zero up to the ceiling", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    startStream();
    latest().drop();
    expect(nextDelay()).toBe(0);
  });

  // Prevents a screen that promises a recovery it is no longer attempting quickly. After
  // enough failures the operator is told the connection is gone, not that it is coming back.
  it("gives up promising a quick recovery after repeated failures", () => {
    startStream();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      latest().drop();
      runRetry();
    }
    expect(states.at(-1)).toBe("offline");
  });

  it("starts the backoff over once a connection succeeds", () => {
    startStream();
    latest().drop();
    runRetry();
    latest().drop();
    runRetry();
    latest().finishHandshake();

    latest().drop();
    expect(nextDelay()).toBe(500);
  });
});

// A socket the client has let go never writes into the screen.
//
// Prevents the subtlest failure here. A replaced socket can still be mid-delivery, and its
// frames are older than what is already rendered — applying them would walk the dashboard
// backwards with nothing on screen admitting it.
describe("stale sockets", () => {
  it("ignores frames from a socket that has been replaced", () => {
    startStream();
    const first = latest();
    first.finishHandshake();

    first.drop();
    runRetry();
    const second = latest();
    second.finishHandshake();
    expect(second).not.toBe(first);

    first.deliver({ type: "heartbeat", version: 1, serverTime: 1 });
    expect(frames).toHaveLength(0);

    second.deliver({ type: "heartbeat", version: 2, serverTime: 2 });
    expect(frames).toHaveLength(1);
  });

  // Prevents the browser logging "WebSocket is closed before the connection is established"
  // on every page load. React's development double-mount stops a stream whose socket is
  // still shaking hands, and closing one in that state is what produces the warning.
  it("does not close a socket that is still shaking hands", () => {
    const stream = startStream();
    const socket = latest();
    expect(socket.readyState).toBe(FakeSocket.CONNECTING);

    stream.stop();
    expect(socket.closedWith).toBeUndefined();

    // It closes itself the moment the handshake lands, so nothing is left open either.
    socket.finishHandshake();
    expect(socket.closedWith?.code).toBe(1000);
  });

  it("closes an open socket when stopped, and stops retrying", () => {
    const stream = startStream();
    latest().finishHandshake();

    stream.stop();
    expect(latest().closedWith?.code).toBe(1000);

    latest().drop();
    runRetry();
    expect(FakeSocket.opened).toHaveLength(1);
  });
});

describe("resync", () => {
  // Prevents the repair request vanishing into a socket that cannot carry it. The client
  // asks for a snapshot exactly when it has detected a gap; a silent no-op there leaves the
  // screen wrong indefinitely.
  it("sends a resync over an open socket", () => {
    const stream = startStream();
    latest().finishHandshake();

    stream.requestResync();
    expect(latest().sent).toEqual([JSON.stringify({ type: "resync" })]);
  });

  it("says nothing while the socket is not open", () => {
    const stream = startStream();
    stream.requestResync();
    expect(latest().sent).toEqual([]);
  });
});

/** The delay the client scheduled its next attempt with. */
function nextDelay(): number {
  const timers = vi.getTimerCount();
  if (timers === 0) throw new Error("no retry was scheduled");
  // advanceTimersToNextTimer runs it; the elapsed clock is the delay it was given.
  const before = vi.getMockedSystemTime()?.getTime() ?? Date.now();
  vi.advanceTimersToNextTimer();
  const after = vi.getMockedSystemTime()?.getTime() ?? Date.now();
  return after - before;
}
