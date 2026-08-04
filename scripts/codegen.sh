#!/bin/sh
# Regenerates src/db/types.ts from the live Postgres schema.
set -e
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
./node_modules/.bin/kysely-codegen \
  --dialect postgres \
  --url "$PGSQL_DATABASE_URL" \
  --include-pattern '(client|server|billing).*' \
  --out-file src/db/types.ts

# db/client.ts registers pg's INT8 parser to return number, so align the select type.
sed -i '' 's|export type Int8 = ColumnType<string,|export type Int8 = ColumnType<number,|' src/db/types.ts
