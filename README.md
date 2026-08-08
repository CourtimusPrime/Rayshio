# Rayshio

Rayshio is an invoice aggregator software for businesses that gives your AI agents MCP access to your expenses.

## How it Works

Rayshio aggregates invoices directly from a company's billing email address:

1. User signs in with whatever provider their work email lives on
2. Pulls a sample of invoices from the email to find the recipient email. _Sometimes, billing emails are aliases that forward emails to the user's email address._
3. Poll through all emails to the billed email address(es) to find all invoices
4. Invoice PDF is stored in MongoDB
5. Invoice data is stored in PostgreSQL

> _See `SPEC.md` for the full design._

## Setup

1. `cp .env.example .env` and fill in values (`scripts/` has key generators noted inline)
2. `docker compose up -d`
3. `pnpm install`
4. `pnpm migrate up` — applies `migrations/` to Postgres
5. `pnpm cli seed-org --name "Your Org"`
6. `pnpm cli auth` — browser OAuth consent, stores encrypted refresh token
7. `pnpm cli check-connections` — sanity check all three databases

## Running

| Command                            | What                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `pnpm worker`                      | ingestion worker (BullMQ; registers the monthly sync cron)               |
| `pnpm mcp`                         | MCP server + dashboard API on `:3000`; also serves `web/dist` when built |
| `pnpm dev:web`                     | Vite dev server on `:5173`, proxying `/api` → `:3000`                    |
| `pnpm cli discover`                | whole-mailbox billing-sender discovery → auto-backfill                   |
| `pnpm cli backfill --service <id>` | full history for one sender                                              |
| `pnpm cli sync`                    | incremental sync now (otherwise monthly via `SYNC_CRON`)                 |
| `pnpm cli categorize`              | backfill usage categories onto invoice line items                        |

### `just`

A root `justfile` wraps the common loops so nothing depends on remembering
which pnpm script maps to which process. Recipe names cannot contain a colon —
`just` rejects it at parse time — hence `dev-web` rather than `dev:web`.

| Command          | What                                                                |
| ---------------- | ------------------------------------------------------------------- |
| `just`           | list recipes                                                        |
| `just dev-mcp`   | `pnpm mcp` — API + MCP on `:3000`                                    |
| `just dev-web`   | `pnpm dev:web` — Vite on `:5173`                                     |
| `just dev-all`   | both of the above in one terminal; Ctrl-C stops both                 |
| `just dev`       | alias for `dev-all`                                                  |
| `just build`     | `pnpm build` (backend `dist/` + `web/dist`)                          |
| `just test`      | `pnpm test` — full vitest run                                        |
| `just clean`     | `pnpm lint:fix` — Biome format + lint with autofix                   |
| `just kill 3000` | kill whatever holds a port, when a dev server outlives its terminal  |

`dev-all` runs each server in its own process group so Ctrl-C reaches the
`tsx`/`vite` child, not just the `pnpm` wrapper it was launched through.

## Dashboard

A React SPA at `/`, served by the same process as the MCP server. Pages:
Dashboard (spend, budget, top vendors, recent invoices), Breakdown (usage
categories rolled up across vendors), Invoices (paginated, searchable),
Reports (the same views over fiscal quarters and years), Calendar (received +
projected), and MCP (connection recipes).

Fiscal periods derive from `client.org.fiscal_year_start_month` (default
January, changeable on the Reports page). Fiscal years are named for the year
they **end** in — an April start makes Apr 2025 – Mar 2026 into "FY2026" — and
every label carries its date range, since that convention is not universal.

Sign in with Google (Better Auth). Signing in creates a user but grants no
access: membership in an org is a deliberate act, so the first person through
the door does not inherit a tenant. Grant it with

```
pnpm cli grant-membership --org 1 --email you@example.com --role owner
```

Sign-up is allowlisted by `ALLOWED_SIGNUP_EMAILS`; an address outside it can
still join by holding a pending invitation (`pnpm cli invite`).

MCP keys live in `client.api_key` — `pnpm cli create-api-key --org 1` mints one
and prints it once. No key is ever sent to the browser.

Two behaviours worth knowing:

- **Currency conversion is query-time only.** Invoices are stored in the currency
  the vendor billed; the dashboard's currency selector is a _display_ target, and
  every invoice is converted to it at the ECB rate on that invoice's own date, so
  a past month's total does not move when today's rate does. Converted values are
  never written back (`SPEC.md:190-196`), and converted figures are labeled with
  the rate date. The ECB publishes ~30 currencies — hard-pegged currencies outside
  that set (AED) use an explicit peg table in `src/fx/rates.ts`. The MCP tools are
  unaffected and still sum per-currency with no conversion, which is the spec's
  documented default.
- **Categories live on line items.** `billing.invoice_line_items.category` is
  assigned by an LLM from a fixed five-value set, so a single vendor invoice can
  split across categories. Classification never fails an invoice — anything
  unclassified reads as `Other` until `pnpm cli categorize` retries it.

Local development runs two processes: `pnpm mcp` and `pnpm dev:web` (or
`just dev-all` for both), then open `http://localhost:5173`. In production only
`pnpm start:mcp` is needed, provided `pnpm build` has produced `web/dist`.

## MCP tools

`list_services`, `list_invoices`, `get_invoice`, `get_invoice_pdf`,
`spend_summary` — all scoped to the org the presented API key belongs to; money
in minor units, per-currency aggregation, no FX conversion.

Claude Desktop's connector UI expects OAuth, which this MVP doesn't
implement — bridge with [mcp-remote](https://www.npmjs.com/package/mcp-remote)
in `claude_desktop_config.json` instead:

```json
{
  "mcpServers": {
    "invoice-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://<host>/mcp",
        "--header",
        "Authorization: Bearer <MCP_API_KEY>"
      ]
    }
  }
}
```

## Development

- `pnpm test` / `pnpm typecheck` / `pnpm lint` (or `just test` / `just clean`)
- `pnpm codegen` — regenerate `src/db/types.ts` after schema changes
- `tsx scripts/smoke-extract.ts [pdf]` — live LLM extraction smoke test
- `tsx scripts/make-fixture-pdf.ts` — regenerate the multi-page fixture PDF
- `tsx scripts/probe-mailbox.ts [query]` — read-only audit of discovery coverage:
  replays sender attribution over the live mailbox and lists which vendors would
  be found, which arrive via a billing alias, and which are already ingested

### Billing aliases and shared inboxes

Vendor invoices frequently arrive through a shared billing alias or Google Group
(`billing@`, `techteam@`, …) rather than direct to the connected mailbox. The
group re-sends the mail with **itself** as the RFC `From:` address, leaving the
vendor only in the display name (`"'OpenRouter, Inc' via Tech Team"`). Keying on
`From` alone therefore collapses every vendor behind an alias into one
pseudo-sender that no classifier will accept as a vendor.

`resolveSender` (`src/gmail/messages.ts`) prefers `X-Original-Sender` — which
Google sets on exactly these rewrites — and records the alias as
`ParsedMessage.deliveredVia`. Discovery additionally refuses to treat the org's
own addresses as vendors, so invoices you forward to yourself or to a
bookkeeping tool don't get ingested a second time.

## Deploy (Railway)

One repo, two services:

- **worker** — start `pnpm start:worker`
- **mcp** — start `pnpm start:mcp` (health check `/healthz`); serves the MCP
  endpoint, the dashboard API, and the built SPA from one port

Both services are connected to this repository on `main`, so **a push to `main`
deploys them**. `railway up` still works and deploys the working tree instead,
which is the escape hatch for testing a change that is not committed — but it
is no longer how a release happens.

Both build with `pnpm install && pnpm build` (which also builds `web/dist`).
Migrations run automatically at boot for **both** roles — the web service can
otherwise start before the worker has applied one and serve sign-ins against a
missing table — so no pre-deploy command is needed. A simultaneous deploy is
safe: node-pg-migrate locks with `pg_try_advisory_lock`, which does not wait, so
the loser is retried by `src/main.ts` rather than crashing.

Set env vars per `.env.example` (Railway injects database URLs for linked
Postgres/Mongo/Redis services). Both services need `BETTER_AUTH_SECRET`,
`AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`, `PUBLIC_APP_URL` and
`ALLOWED_SIGNUP_EMAILS`; the mcp service additionally needs `PUBLIC_MCP_URL`
set to its public `https://<host>/mcp`. Build the SPA with
`VITE_PUBLIC_ORIGIN=https://<host>` so canonical, OG and sitemap URLs are
absolute and correct.

Sign-in uses a **separate** Google OAuth client from Gmail ingestion. The
ingestion client carries `gmail.readonly`, a restricted scope, so sharing it
would show a mailbox-access consent screen for a plain login. Register
`https://<host>/api/auth/callback/google` on the sign-in client.
