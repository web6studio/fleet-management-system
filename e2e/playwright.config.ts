import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the shipped artifact.
 *
 * `pnpm run build` produces one binary carrying the API, the stream and the web UI, and
 * that is what these specs drive. Running them against `vite dev` would leave the embedding,
 * the cache headers and the SPA fallback untested.
 */
export default defineConfig({
  testDir: ".",
  outputDir: "./.results",

  // The fleet is one mutable thing behind one process: an emergency stop engaged by one
  // spec is visible to every other. Serial execution is the honest way to test a server
  // with state, and the suite is small enough that it costs seconds.
  fullyParallel: false,
  workers: 1,

  // A retry would hide a real race rather than report it. If a spec here is flaky, that is
  // the finding.
  retries: 0,
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "node ../scripts/run-built-server.mjs",
    url: "http://127.0.0.1:8080/api/v1/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
