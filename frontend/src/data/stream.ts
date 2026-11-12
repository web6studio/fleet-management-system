import { type ClientFrame, isServerFrame, type ServerFrame } from "./wire";

/**
 * The state of *this connection*, never of the robots.
 *
 * "The fleet is quiet" and "we have lost the server" are different problems with different
 * responses, so this is surfaced on screen rather than kept internal.
 */
export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";

export interface StreamHandlers {
  onFrame: (frame: ServerFrame) => void;
  onState: (state: ConnectionState) => void;
}

const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 15_000;
/** After this many failed attempts the screen stops promising a quick recovery. */
const ATTEMPTS_BEFORE_GIVING_UP = 5;

/**
 * The telemetry stream, with the reconnection policy that makes it usable.
 *
 * Deliberately not a React hook: the socket outlives any render, and keeping it a plain
 * object means the backoff can be reasoned about — and tested — without a component tree.
 */
export class FleetStream {
  #socket: WebSocket | undefined;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #attempts = 0;
  #stopped = false;

  constructor(
    private readonly url: string,
    private readonly handlers: StreamHandlers,
  ) {}

  start(): void {
    this.#stopped = false;
    if (this.#socket) return;
    this.#open();
    document.addEventListener("visibilitychange", this.#onVisible);
  }

  stop(): void {
    this.#stopped = true;
    document.removeEventListener("visibilitychange", this.#onVisible);
    clearTimeout(this.#retry);
    this.#retry = undefined;

    // Only an open socket is closed here. One still completing its handshake cannot be,
    // without the browser logging "WebSocket is closed before the connection is
    // established" — which is exactly what React's development double-mount produces.
    // Clearing `#socket` already makes it stale, so its own open handler closes it.
    const socket = this.#socket;
    this.#socket = undefined;
    if (socket?.readyState === WebSocket.OPEN) socket.close(1000, "client stopped");
  }

  /** Asks the server for a fresh snapshot, after the client detects it missed a frame. */
  requestResync(): void {
    this.#send({ type: "resync" });
  }

  #open(): void {
    this.handlers.onState(this.#attempts === 0 ? "connecting" : this.#reconnectingState());

    const socket = new WebSocket(this.url);
    this.#socket = socket;

    // Every handler checks that this is still the socket the client wants. A stale one can
    // outlive a stop or a reconnection, and frames from it would be older than the state
    // already on screen.
    const current = () => this.#socket === socket;

    socket.onopen = () => {
      if (!current()) {
        socket.close(1000, "client stopped");
        return;
      }
      this.#attempts = 0;
      this.handlers.onState("live");
    };

    socket.onmessage = (event) => {
      if (!current() || typeof event.data !== "string") return;
      const frame = parse(event.data);
      if (frame) this.handlers.onFrame(frame);
    };

    // `onerror` is always followed by `onclose`, so the retry lives in one place.
    socket.onclose = () => {
      if (!current()) return;
      this.#socket = undefined;
      this.#scheduleRetry();
    };
  }

  #scheduleRetry(): void {
    if (this.#stopped || this.#retry !== undefined) return;

    this.#attempts += 1;
    this.handlers.onState(this.#reconnectingState());

    // Full jitter. Without it every dashboard in a control room reconnects in the same
    // millisecond after a server restart and knocks it over again.
    const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (this.#attempts - 1));
    this.#retry = setTimeout(() => {
      this.#retry = undefined;
      this.#open();
    }, Math.random() * ceiling);
  }

  #reconnectingState(): ConnectionState {
    return this.#attempts > ATTEMPTS_BEFORE_GIVING_UP ? "offline" : "reconnecting";
  }

  /** Coming back to a tab that lost its socket should not wait out the remaining backoff. */
  #onVisible = (): void => {
    if (document.hidden || this.#stopped || this.#socket) return;
    clearTimeout(this.#retry);
    this.#retry = undefined;
    this.#open();
  };

  #send(frame: ClientFrame): void {
    if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(frame));
  }
}

function parse(data: string): ServerFrame | undefined {
  try {
    const value: unknown = JSON.parse(data);
    return isServerFrame(value) ? value : undefined;
  } catch {
    // A frame we cannot read is a frame we drop. The version gap that follows will repair
    // the state, which is a better outcome than tearing down a working connection.
    return undefined;
  }
}
