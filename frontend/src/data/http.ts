import type { Problem } from "./wire";

const API_BASE = "/api/v1";

/**
 * A request the server refused, carrying the reason it gave.
 *
 * The UI disables controls it expects to be refused, so one of these reaching an operator
 * means the unit's state changed between the render and the click. The server's wording is
 * shown rather than a generic failure, because it is the only thing that says what to do
 * next.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  return unwrap<T>(response);
}

export async function apiSend<T>(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap<T>(response);
}

async function unwrap<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;

  // Problem details carry an operator-facing sentence; anything else only has a status.
  if (response.headers.get("content-type")?.includes("problem+json")) {
    const problem = (await response.json()) as Problem;
    throw new ApiError(response.status, problem.detail || problem.title);
  }
  throw new ApiError(response.status, `${response.status} ${response.statusText}`);
}

/** The stream's URL, derived from the page so a deployment needs no second origin setting. */
export function streamUrl(): string {
  const url = new URL(`${API_BASE}/stream`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
