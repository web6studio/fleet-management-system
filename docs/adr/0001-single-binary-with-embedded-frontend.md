# ADR 0001 — Ship a single Go binary with the frontend embedded

## Context

The product is deployed to cloud and on-premise environments. On-premise sites are hotels,
hospitals and airports: isolated networks, operations staff who are not web engineers, and
procurement that asks what has to be installed.

## Decision

One Go binary serves the HTTP API, the telemetry stream and the built React bundle via
`go:embed`.

`pnpm run build` runs the full release: vite builds the bundle, a staging script copies it
next to the server package, and `go build` compiles everything into `bin/server`.

Static file handling:

- `/assets/*` carries a content hash, served with `max-age=31536000, immutable`.
- The HTML shell is served with `no-cache`, otherwise a deployment keeps serving the
  previous bundle.
- Any path that is not a file serves the shell, so client-side routes survive a reload.
- Unmatched `/api/` paths return problem details rather than HTML.

## Rejected

**Next.js.** An App Router application requires a Node runtime at the customer site, and
server rendering gains nothing for live data behind a login.

**Node or NestJS for the backend.** Workable, but loses the single static binary.

**Serving the bundle from a CDN or separate web server.** Two artifacts to version together
and a CORS configuration, in exchange for a cache tier this traffic does not need.

## Consequences

`go:embed` cannot read outside its package directory, so the bundle is copied rather than
built in place. `backend/cmd/server/ui/unbuilt.html` is committed so `go build ./...` works
on a fresh clone and so a binary built without the frontend serves a page explaining which
step was skipped.
