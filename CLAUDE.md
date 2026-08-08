# InvoiceMCP — project instructions

## Changelog

**Log every change in `CHANGELOG.md`.** Newest first, under a dated heading,
grouped as Added / Changed / Fixed / Removed.

Write the *reason*, not just the title, wherever the reason is not obvious from
the change itself. What changed is recoverable from `git log` at any time; why it
changed is not, and it is the half that stops the same mistake being made twice.
An entry that says "fixed spinner flicker" is worth less than one that says the
loop restarted by snapping opacity back to its start value.

Also record the things that are obvious to whoever set them up and invisible to
everyone else — infrastructure decisions, environment quirks, known-bad data
left in place. `CHANGELOG.md` carries a standing "Development environment"
section for exactly that; keep it current.

Two entry types are easy to skip and should not be:

- **Known-unresolved problems**, under Notes. A bug you found and chose not to
  fix is information; leaving it only in a chat transcript loses it.
- **Anything that changes how the project is run or verified** — a new port, a
  new required service, a migration that must be applied by hand.

## Frontend validation

**Try the Playwright CLI first for validating frontend changes.** Do not default
to the Claude-in-Chrome extension for this project.

Playwright is preferred here because it is scriptable and deterministic: it runs
headless without a foreground window, so animation frames actually advance.
Claude-in-Chrome drives a tab that can be throttled — `requestAnimationFrame`
does not fire when the window is not focused, which makes count-up animations
and Recharts' mount transitions look broken when they are fine, and makes a
screenshot taken mid-transition misleading.

```bash
npx playwright --version          # 1.62.1, available via npx (no global binary)
npx playwright install chromium   # first run only
```

Typical loop: start `pnpm mcp` (and `pnpm dev:web` for HMR), then drive the page
with a short Playwright script — navigate, sign in, assert on text/DOM, and
screenshot. Prefer asserting on the DOM over reading screenshots; a screenshot
proves what a frame looked like, not what the app computed.

**Signing in from a test.** Google OAuth cannot be driven headlessly, so the
harness uses email/password, which `src/auth/index.ts` enables only when
`NODE_ENV !== 'production'`. Seed an account with

```bash
pnpm cli seed-dev-user --email dev@test.example --password <pw> --org 1
```

then POST `/api/auth/sign-in/email` from Playwright's request context, which
puts the cookie on the browser context. There is no shared-password path any
more — R2 deleted it.

**Verify against a scratch database, not the dev one.** Development runs
against **self-hosted PostgreSQL, MongoDB and Redis** on a private host reached
over Tailscale — endpoints in `.env` (`PGSQL_DATABASE_URL`,
`MONGODB_DATABASE_URL`, `REDIS_DATABASE_URL`). It is shared and holds real
invoice data; it is not a scratch database, and it is not Railway.

`docker-compose.yml` brings up local Postgres, Mongo and Redis on 5434 / 27018 /
6380 for throwaway work. Create a database, apply `migrations/`, and export the
three URLs for the run — process env beats the `.env` file, so no file needs
editing. Two tenants holding identically-shaped data is what makes a
cross-tenant leak look like a failure rather than a plausible success.

Two traps when redirecting:

- The scripts under `scripts/` (`migrate.sh`, `codegen.sh`) do `set -a; . ./.env`,
  which *overwrites* your exported URL and quietly points the command back at
  the shared database. Invoke `node-pg-migrate` / `kysely-codegen` directly when
  overriding.
- Truncating Postgres without also flushing Redis makes BullMQ silently drop the
  next jobs: identity columns restart at 1 and collide with completed job ids
  still in the queue (`removeOnComplete` keeps 1000). Reset both together.

**Beware caches when asserting a request was NOT made.** `logoCache` persists
negative results in localStorage, so re-checking in a warmed page passes
vacuously. Use a fresh browser context.

Fall back to the Claude-in-Chrome MCP (`mcp__claude-in-chrome__*`) when you
genuinely need the user's real browser session — an existing login, an installed
extension, or manual visual review of something already on their screen.

**Tailwind config changes need a Vite restart.** Editing `web/tailwind.config.js`
— adding a colour, a font family, a border width — does not reach the running
dev server. HMR reloads the CSS but the utility is never generated, so the class
silently resolves to nothing: elements render with no background, invisible bars,
unstyled text. It looks exactly like a CSS bug and it is not. Kill and restart
`pnpm dev:web` after any config edit before debugging anything else.

## Migrations

**Never run `@better-auth/cli migrate`** against any database. Better Auth's CLI
applies DDL directly and records nothing in `pgmigrations`, so the change would
be invisible to node-pg-migrate and would not survive a Railway deploy — which
runs `migrations/` at boot for both services.

Use `npx @better-auth/cli generate` to *emit* the DDL, diff it, and hand-transcribe
it into a numbered `migrations/*.sql` file. Cross-check the emitted column set
against the installed library rather than trusting the CLI: the two can be
different versions.

Production drifted from `migrations/` once already — it was loaded from a
constraint-stripped dump, so `pgmigrations` claimed 0001-0004 were applied while
the database had no primary, unique or foreign keys at all. `0005_restore_constraints`
repairs that, conditionally, so it is a no-op on a database built from 0001.
Before adding a foreign key, confirm the referenced table actually has the unique
constraint it is supposed to.

## Verifying numbers

The dashboard converts currencies at query time. When checking a figure,
cross-check the UI against the API (`/api/summary`, `/api/reports`) rather than
trusting the rendered value alone — a converted total and a native-currency
total can differ legitimately, and only the API response says which is which.
