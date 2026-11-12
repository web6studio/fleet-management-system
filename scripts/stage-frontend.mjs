// Moves the vite build to where `go:embed` can see it.
//
// `go:embed` cannot reach outside its own package directory, so the bundle has to be copied
// rather than built in place. Done in Node, which pnpm already requires, so the project
// still needs neither make nor a POSIX shell.
//
// `ui/unbuilt.html` is committed and survives: it is what `go:embed` anchors on in a fresh
// clone, and what the binary serves when nobody ran this script.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "frontend", "dist");
const to = join(root, "backend", "cmd", "server", "ui");

/** The one file in `to` that is checked in rather than generated. */
const KEEP = "unbuilt.html";

if (!existsSync(from)) {
  console.error(`stage-frontend: ${from} does not exist. Run the front-end build first.`);
  process.exit(1);
}

mkdirSync(to, { recursive: true });

// Clear the previous bundle. Asset names carry a content hash, so without this every build
// leaves its predecessor behind and the binary grows release by release.
for (const entry of readdirSync(to)) {
  if (entry !== KEEP) rmSync(join(to, entry), { recursive: true, force: true });
}

cpSync(from, to, { recursive: true });

const staged = readdirSync(to).filter((entry) => entry !== KEEP);
console.log(`stage-frontend: ${staged.length} entries staged into backend/cmd/server/ui`);
