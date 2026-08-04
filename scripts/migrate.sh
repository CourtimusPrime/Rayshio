#!/bin/sh
# Runs node-pg-migrate against PGSQL_DATABASE_URL from .env (or process env).
set -e
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
export DATABASE_URL="$PGSQL_DATABASE_URL"
exec ./node_modules/.bin/node-pg-migrate --migrations-dir migrations --migration-file-language sql "$@"
