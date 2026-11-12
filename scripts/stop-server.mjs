// Stops whatever is listening on the project's ports: the server on 8080, the Vite dev
// server on 5173.
//
// Exists because a backgrounded `pnpm start` has no terminal to Ctrl-C in, and the kill
// incantation differs per platform (taskkill against netstat output on Windows, lsof and
// kill elsewhere). `pnpm stop` is the same two keystrokes everywhere.

import { execFileSync } from "node:child_process";

const PORTS = [8080, 5173];

function listeners(port) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
      return [
        ...new Set(
          out
            .split("\n")
            .filter((line) => line.includes(`:${port} `) && line.includes("LISTENING"))
            .map((line) => line.trim().split(/\s+/).at(-1))
            .filter((pid) => pid && pid !== "0"),
        ),
      ];
    }
    const out = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  } catch {
    // netstat/lsof exit non-zero when nothing matches; an empty port is not an error.
    return [];
  }
}

function stop(pid) {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", pid, "/t", "/f"], { stdio: "ignore" });
  } else {
    process.kill(Number(pid), "SIGTERM");
  }
}

let stopped = 0;
for (const port of PORTS) {
  for (const pid of listeners(port)) {
    stop(pid);
    stopped += 1;
    console.log(`stopped pid ${pid} on port ${port}`);
  }
}

if (stopped === 0) console.log(`nothing listening on ${PORTS.join(" or ")}`);
