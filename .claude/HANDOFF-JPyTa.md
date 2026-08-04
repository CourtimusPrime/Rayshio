# HANDOFF.md

## Current Task
**M8: MCP Server — complete and verified.** Built stateless Express HTTP server with Streamable HTTP transport, API-key auth, and 5 tools scoped to DEFAULT_ORG_ID: `list_services`, `list_invoices`, `get_invoice`, `get_invoice_pdf`, `spend_summary`. All data grouped org-first, currency-second. Server running on `:3000`.

## Key Decisions Made
1. **Removed `exactOptionalPropertyTypes`** from tsconfig.json — MCP SDK's Streamable HTTP transport and pg library don't satisfy this strict check; code is sound, flag was noise.
2. **pg DATE type parser** — added `pg.types.setTypeParser(pg.types.builtins.DATE, v => v)` to preserve 'YYYY-MM-DD' strings without timezone shifting. Kysely query builders expect Date objects as values, but results must serialize as date strings in JSON.
3. **Date filters** — converted string date params (e.g., '2026-03-01') to `new Date(date_from)` before passing to Kysely `.where()` for invoice date range filtering.

## Files Changed
- **`src/mcp/tools/index.ts`** — new; 5 registered tools, each with org-isolation guard, Zod input schema, Kysely queries, JSON text response
- **`src/mcp/server.ts`** — new; Express app, POST /mcp stateless handler, healthz endpoint, error handling with JSON-RPC error format
- **`src/db/client.ts`** — edited; added DATE type parser to preserve date strings
- **`tsconfig.json`** — removed `exactOptionalPropertyTypes: true`
- **`package.json`** — added `start:mcp` and `start:worker` scripts for production use
- **`README.md`** — new; setup, running, MCP tools list, Claude Desktop connector config, deploy (Railway) section

## Next Steps
1. **User action (M9 blocker)**: `git init && git remote add origin <github>` (required for Railway source integration). Once done, I can provision Railway Postgres/Mongo/Redis and wire the 2 services.
2. **User action (live e2e)**: Run `pnpm cli auth` (browser OAuth consent → encrypted refresh token stored), then `pnpm worker` + `pnpm cli discover` to ingest real mailbox data.
3. **Post-auth verification**: Confirm PG rows, GridFS PDFs, reconciliation results, and failure_reason coverage against your actual invoices.

## Open Questions
- **Encryption key safety**: `.env` TOKEN_ENCRYPTION_KEY is the only copy; regenerating it orphans stored refresh tokens. Confirm key rotation strategy before production.
- **MCP_API_KEY distribution**: Currently one key per org in .env; Claude Desktop connector uses Bearer token in header. How should you distribute keys to agents or teams?
- **Monthly sync**: SYNC_CRON is hardcoded as env var. Does the schedule / 3-day overlap window match your reconciliation SLA?
