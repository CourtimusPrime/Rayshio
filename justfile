# Rayshio task runner.
#
# `just` recipe names cannot contain a colon, so the dev recipes are spelled
# `dev-web` / `dev-mcp` / `dev-all` rather than `dev:web`.

# List available recipes.
default:
	@just --list

# Run both dev servers (alias for dev-all).
dev: dev-all

# Vite dev server for the SPA — http://localhost:5173, proxies /api to :3000.
dev-web:
	pnpm dev:web

# Express API + MCP endpoint via tsx — http://localhost:3000.
dev-mcp:
	pnpm mcp

# Both servers in one terminal; Ctrl-C stops both.
dev-all:
	#!/usr/bin/env bash
	set -euo pipefail
	# Job control puts each background job in its own process group, so the
	# trap can kill pnpm *and* the tsx/vite child it spawned.
	set -m
	pnpm mcp & mcp_pid=$!
	pnpm dev:web & web_pid=$!
	trap 'kill -- -$mcp_pid -$web_pid 2>/dev/null || true' EXIT INT TERM
	wait

# Compile the backend to dist/ and build the SPA.
build:
	pnpm build

# Full test suite (vitest, single run).
test:
	pnpm test

# Format and lint with autofix (Biome, over src/ and test/).
clean:
	pnpm lint:fix

# Kill whatever is listening on a port: `just kill 3000`
kill port:
	#!/usr/bin/env bash
	set -euo pipefail
	if command -v lsof >/dev/null 2>&1; then
		pid=$(lsof -ti tcp:{{port}} || true)
	elif command -v fuser >/dev/null 2>&1; then
		pid=$(fuser {{port}}/tcp 2>/dev/null || true)
	else
		echo "Neither lsof nor fuser is available to find the process on port {{port}}" >&2
		exit 1
	fi
	if [ -n "$pid" ]; then
		kill -9 $pid
		echo "Killed process $pid on port {{port}}"
	else
		echo "No process found listening on port {{port}}"
	fi
