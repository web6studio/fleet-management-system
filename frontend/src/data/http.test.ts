import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet, apiSend, streamUrl } from "./http";

function respondWith(body: unknown, init: ResponseInit = {}): void {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { ...init, headers })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requests", () => {
  it("returns the decoded body", async () => {
    respondWith({ sites: [] });
    await expect(apiGet("/sites")).resolves.toEqual({ sites: [] });
  });

  it("sends JSON and reads the answer", async () => {
    respondWith({ accepted: true }, { status: 202 });
    await expect(apiSend("POST", "/units/A/commands", { command: "stop" })).resolves.toEqual({
      accepted: true,
    });

    const [, options] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(options?.method).toBe("POST");
    expect(options?.body).toBe(JSON.stringify({ command: "stop" }));
  });
});

// A refusal reaches the operator in the server's own words.
//
// Prevents the one failure this error path exists for. The browser greys out what it expects
// to be refused, so a refusal that gets through means the unit changed between the render
// and the click. "Clear the fault on GAU-203 first" is then the only thing on screen that
// says what to do instead. A generic "request failed" would lose it.
describe("refusals", () => {
  it("surfaces the problem detail", async () => {
    respondWith(
      { title: "Command refused", status: 409, detail: "Clear the fault on GAU-203 first" },
      { status: 409, headers: { "content-type": "application/problem+json" } },
    );

    await expect(apiSend("POST", "/units/GAU-203/commands", {})).rejects.toThrowError(
      new ApiError(409, "Clear the fault on GAU-203 first"),
    );
  });

  it("falls back to the title when there is no detail", async () => {
    respondWith(
      { title: "No such endpoint", status: 404 },
      { status: 404, headers: { "content-type": "application/problem+json" } },
    );

    await expect(apiGet("/nope")).rejects.toThrowError(new ApiError(404, "No such endpoint"));
  });

  // Prevents a gateway error arriving as an empty message. A proxy or a crashed process
  // answers with HTML, and the operator still has to be told something they can report.
  it("reports the status when the answer is not problem details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>502</html>", { status: 502, statusText: "Bad Gateway" }),
      ),
    );

    await expect(apiGet("/fleet")).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      message: "502 Bad Gateway",
    });
  });
});

// Prevents a deployment needing a second origin setting. The socket follows the page, so
// the console works behind any host or proxy without being told where it is.
describe("streamUrl", () => {
  it("follows the page's scheme and host", () => {
    vi.stubGlobal("window", { location: { href: "http://fleet.local:8080/units/A" } });
    expect(streamUrl()).toBe("ws://fleet.local:8080/api/v1/stream");

    vi.stubGlobal("window", { location: { href: "https://fleet.example/" } });
    expect(streamUrl()).toBe("wss://fleet.example/api/v1/stream");
  });
});
