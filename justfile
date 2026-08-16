# Rayshio task runner.
#
# `just` recipe names cannot contain a colon, so the dev recipes are spelled
# `dev-web` / `dev-mcp` / `dev-all` rather than `dev:web`.

# List available recipes.
default:
	@just --list

# Run the whole dev stack (alias for dev-all).
dev: dev-all

# Vite dev server for the SPA — http://localhost:5173, proxies /api to :3000.
dev-web:
	pnpm dev:web

# Express API + MCP endpoint via tsx — http://localhost:3000.
dev-mcp:
	pnpm mcp

# BullMQ worker — drains the ingestion queue (nothing else does).
dev-worker:
	pnpm worker

# The whole dev stack in one terminal; Ctrl-C stops all three.
dev-all:
	#!/usr/bin/env bash
	set -euo pipefail
	api_port=3000
	web_port=5173
	if lsof -tiTCP:$api_port -sTCP:LISTEN >/dev/null 2>&1 || lsof -tiTCP:$web_port -sTCP:LISTEN >/dev/null 2>&1; then
		api_port=3100
		web_port=5273
	fi
	for port in $api_port $web_port; do
		if lsof -tiTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
			echo "port $port is already in use — run 'just kill $port' or stop the process holding it" >&2
			exit 1
		fi
	done
	set -m
	PORT=$api_port MCP_PORT=$api_port PUBLIC_APP_URL=http://localhost:$web_port PUBLIC_MCP_URL=http://localhost:$api_port/mcp pnpm mcp & mcp_pid=$!
	VITE_PORT=$web_port VITE_API_PORT=$api_port pnpm dev:web & web_pid=$!
	# The worker binds no port, so its absence is silent: uploads are accepted,
	# enqueued, and then sit at `pdf_fetched` forever while the UI says
	# "cataloguing". That has been mistaken for a bug in the upload path, which
	# is why it belongs here rather than in a second terminal to remember.
	pnpm worker & worker_pid=$!
	trap 'kill -- -$mcp_pid -$web_pid -$worker_pid 2>/dev/null || true' EXIT INT TERM
	# Stop everything as soon as any one of them dies, so a half-dead stack
	# cannot keep serving — an API server that lost :3000 to a stray process
	# fails in a way that looks exactly like a code bug.
	#
	# Polled rather than `wait -n`: macOS ships bash 3.2, where `wait -n` does
	# not exist, and under `set -e` that would take the whole stack down on
	# startup.
	while kill -0 $mcp_pid 2>/dev/null &&
		kill -0 $web_pid 2>/dev/null &&
		kill -0 $worker_pid 2>/dev/null; do
		sleep 1
	done
	echo "a dev process exited — stopping the rest" >&2

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
