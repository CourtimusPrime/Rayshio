# HANDOFF.md

## Current Task
Set up OpenConnector (oomol-lab/open-connector) as a local gateway MCP server, alongside the existing Composio MCP.

## Key Decisions Made

- **Port mapping**: Docker on 3100 (3000 owned by invoice-mcp's `pnpm mcp`), remapped via `docker-compose.override.yml` excluded from git tracking
- **Configuration**: Secrets (.env with `OOMOL_CONNECT_ENCRYPTION_KEY`, `ADMIN_TOKEN`, `RUNTIME_TOKEN`) generated locally, mode 600, gitignored
- **Integration**: Registered as user-scope MCP server in `~/.claude.json` with bearer token auth header; loopback-only listener
- **Composition**: Added alongside Composio, not replacing it—both available as alternatives

## Files Changed

- **~/dev/me/open-connector/** — Fresh clone of oomol-lab/open-connector
  - `.env` — Generated secure config with encrypted tokens (gitignored)
  - `docker-compose.override.yml` — Port 3100 mapping, env overrides; excluded via `.git/info/exclude`
- **~/.claude.json** — MCP server registration for `openconnector` (HTTP, user scope)
- **~/.claude/projects/.../memory/openconnector-local-runtime.md** — Reference doc on runtime behavior
- **~/.claude/projects/.../memory/MEMORY.md** — Updated index with new reference

## Next Steps

Container is **running and healthy** (`docker compose ps` shows `Up ... (healthy)`). Verified:
- Action execution works (hackernews smoke test passes on retries; first call cold-start DNS race is expected)
- MCP JSON-RPC tools/list endpoint responds
- Catalog loads ~1211 services
- Admin API gated by token (401 without `ADMIN_TOKEN`)
- Runtime token baked into MCP header

No further setup required. Ready to use `openconnector` MCP tools immediately.

## Open Questions

None. Setup complete and operational.
