// Starts the built binary for the end-to-end suite.
//
// Exists because the binary is `bin/server` on Linux and `bin/server.exe` on Windows, and a
// Playwright `webServer.command` is a single string. Fifty lines of shell per platform, or
// this.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = ["server", "server.exe"].map((name) => join(root, "bin", name));
const binary = candidates.find(existsSync);

if (!binary) {
  console.error("No built server found. Run `pnpm run build` first.");
  process.exit(1);
}

const server = spawn(binary, process.argv.slice(2), { stdio: "inherit" });
server.on("exit", (code) => process.exit(code ?? 0));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
