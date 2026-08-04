# InvoiceMCP

MCP server giving AI agents read access to subscription/SaaS invoice history,
ingested from Gmail and normalized into Postgres (structured data) + MongoDB
(PDFs). See `SPEC.md` for the full design.

## Prerequisites

- Node 22+, pnpm
- Docker (local Postgres/Mongo/Redis) — or Railway database URLs
- Google OAuth client (Gmail API enabled, redirect URI `http://localhost:8787/oauth/callback`)
- OpenRouter API key

## Setup

1. `cp .env.example .env` and fill in values (`scripts/` has key generators noted inline)
2. `docker compose up -d`
3. `pnpm install`
4. `pnpm migrate up` — applies `migrations/` to Postgres
5. `pnpm cli seed-org --name "Your Org"`
6. `pnpm cli auth` — browser OAuth consent, stores encrypted refresh token
7. `pnpm cli check-connections` — sanity check all three databases

## Running

| Command | What |
|---|---|
| `pnpm worker` | ingestion worker (BullMQ; registers the monthly sync cron) |
| `pnpm mcp` | MCP server on `:3000` (Streamable HTTP at `POST /mcp`, API key auth) |
| `pnpm cli discover` | whole-mailbox billing-sender discovery → auto-backfill |
| `pnpm cli backfill --service <id>` | full history for one sender |
| `pnpm cli sync` | incremental sync now (otherwise monthly via `SYNC_CRON`) |

## MCP tools

`list_services`, `list_invoices`, `get_invoice`, `get_invoice_pdf`,
`spend_summary` — all scoped to `DEFAULT_ORG_ID`; money in minor units,
per-currency aggregation, no FX conversion.

Claude Desktop's connector UI expects OAuth, which this MVP doesn't
implement — bridge with [mcp-remote](https://www.npmjs.com/package/mcp-remote)
in `claude_desktop_config.json` instead:

```json
{
  "mcpServers": {
    "invoice-mcp": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "https://<host>/mcp",
        "--header", "Authorization: Bearer <MCP_API_KEY>"
      ]
    }
  }
}
```

## Development

- `pnpm test` / `pnpm typecheck` / `pnpm lint`
- `pnpm codegen` — regenerate `src/db/types.ts` after schema changes
- `tsx scripts/smoke-extract.ts [pdf]` — live LLM extraction smoke test
- `tsx scripts/make-fixture-pdf.ts` — regenerate the multi-page fixture PDF

## Deploy (Railway)

One repo, two services:

- **worker** — start `pnpm start:worker`
- **mcp** — start `pnpm start:mcp` (health check `/healthz`)

Both build with `pnpm install && pnpm build`. Run `pnpm migrate up` as the
worker's pre-deploy command. Set env vars per `.env.example` (Railway injects
database URLs for linked Postgres/Mongo/Redis services).
