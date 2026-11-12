# Contributing

## Commands

```sh
pnpm install          # workspace: frontend and e2e
pnpm run dev          # API on :8080, vite dev server on :5173
pnpm run check        # lint, type check, unit tests
pnpm run build        # produces bin/server
pnpm start            # runs the built binary
pnpm run test:e2e     # Playwright against the built binary
pnpm run fmt
```

`pnpm run check` must pass before a commit. CI runs the same scripts; a disagreement between
them is a bug in the scripts.

All commands are defined in the root `package.json`, so the project needs neither make nor a
POSIX shell.

## Before changing structure

Read [docs/architecture.md](docs/architecture.md). Design decisions are recorded in
[docs/adr/](docs/adr/); a change that contradicts one needs a superseding ADR.

## Dependencies

Do not add a dependency that replaces roughly fifty lines of code. A new dependency is
documented in `docs/architecture.md` with the reason it was added.

Check before adding: released within the last six months, more than one maintainer,
permissive licence, no install scripts, and the package name spelled correctly.

## Backend

- Standard library plus `github.com/coder/websocket`. No framework, ORM or code generation.
- Three packages: `fleet`, `sim`, `api`. A fourth requires an ADR.
- Log keys are snake_case. Do not use `fmt.Println`.
- The version counter increments by exactly one per published change, and updates are
  published while the write lock is held.
- Required lists are always serialised as lists. A nil Go slice marshals to `null`, which
  forces every client to special-case it.
- The server validates commands. The frontend disables controls it expects to be rejected,
  but the server decides, and a rejection carries a reason for the operator.

## Frontend

- TypeScript strict mode. No `any`. `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` are enabled; a prop that can receive `undefined` is typed
  `T | undefined`.
- `domain/` and `lib/` contain no React.
- Server state and view state are separate (see the architecture notes).
- `features/*` do not import each other. CI enforces this.
- Colours come from `styles/tokens.css`. No other file contains a hex value. CI enforces
  this.
- Status colours indicate status only. Interactive emphasis inverts ink; red is reserved for
  stop actions.
- Status indicators always pair a colour with a glyph and a text label.
- The accessible name must contain the visible label text (WCAG 2.5.3). Add context in a
  visually hidden span rather than replacing the label with `aria-label`.
- Use a colour token to dim text, not `opacity`. Opacity applied to already-dim text falls
  below the AA contrast threshold.
- Every disabled control states its reason, and the reason is a domain field.
- Map pan and zoom write to the DOM through a ref, not through React state.

## Tests

Tests live next to the code they test. `e2e/` is a separate workspace package because it
starts the built binary and drives it through a browser.

Each test has a comment describing the failure it prevents. A component test should cover
wiring; the underlying rule belongs in `domain/` with a unit test.

The invariants listed in [docs/architecture.md](docs/architecture.md#invariants) must pass.

## Commits

Conventional Commits. Work on a branch and open a pull request. Significant decisions get an
ADR in the same pull request as the code.
