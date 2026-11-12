# Two build stages so the image carries the binary and nothing else: no Node, no Go
# toolchain, no source. The result is a few megabytes on scratch.

FROM node:22-alpine AS console
WORKDIR /src
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile
COPY frontend/ frontend/
COPY scripts/ scripts/
RUN pnpm --dir frontend build && node scripts/stage-console.mjs

FROM golang:1.27-alpine AS server
WORKDIR /src
COPY backend/go.mod backend/go.sum ./backend/
RUN cd backend && go mod download
COPY backend/ backend/
# The staged bundle, which go:embed compiles into the binary.
COPY --from=console /src/backend/cmd/server/ui/ backend/cmd/server/ui/
RUN cd backend && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /server ./cmd/server

FROM scratch
COPY --from=server /server /server
# No database, no volume, no config file. The port comes from the platform.
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/server"]
