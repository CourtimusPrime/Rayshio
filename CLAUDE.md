# InvoiceMCP — project instructions

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
with a short Playwright script — navigate, sign in with `DASHBOARD_PASSWORD`,
assert on text/DOM, and screenshot. Prefer asserting on the DOM over reading
screenshots; a screenshot proves what a frame looked like, not what the app
computed.

Fall back to the Claude-in-Chrome MCP (`mcp__claude-in-chrome__*`) when you
genuinely need the user's real browser session — an existing login, an installed
extension, or manual visual review of something already on their screen.

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
