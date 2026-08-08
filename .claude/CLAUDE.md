<!-- GSD:project-start source:PROJECT.md -->

## Project

**Rayshio**

Rayshio turns the billing email already sitting in a company's mailbox into one
queryable record of what they pay for. It connects Gmail, finds the vendors that
bill them, extracts structured invoice and line-item data from the PDFs, and
presents it as a dashboard for the person who owns the question "what are we
actually paying for" — plus an MCP endpoint so an agent can ask the same
questions.

Today it runs as a working single-tenant-in-practice system for its author. This
milestone makes it a product any company can sign up for and use.

**Core Value:** A company connects one mailbox and gets a complete, correct, trustworthy picture
of its vendor spend — where "correct" includes being honest about what it does
not know.

### Constraints

- **Tech stack**: TypeScript, Express, Kysely, React + Vite + Tailwind, BullMQ,
  Postgres + MongoDB + Redis, deployed on Railway — established and not up for
  reconsideration this milestone.

- **External dependency**: Google restricted-scope verification for
  `gmail.readonly` has weeks of lead time and cannot be submitted until the
  domain is live and both legal pages are served from it. It gates the launch
  and nothing else in the milestone gates it, so it must start first and run in
  parallel.

- **Legal**: Privacy and Terms need review by someone qualified. Factually
  accurate prose is not the same as reviewed prose, and Google's review looks at
  these pages.

- **Migrations**: Numbered SQL files under `migrations/` are the only source of
  truth. Never run `@better-auth/cli migrate` — it applies DDL directly and
  records nothing in `pgmigrations`, so the change would not survive a Railway
  deploy.

- **Data safety**: Production drifted from `migrations/` once already, loaded
  from a constraint-stripped dump. Verify schema assumptions against the live
  database before depending on a constraint existing.

- **Frontend verification**: Use Playwright, not the Chrome extension — an
  unfocused tab throttles `requestAnimationFrame`, which makes working count-up
  and chart animations look broken. Restart Vite after any
  `web/tailwind.config.js` change or new utilities silently resolve to nothing.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.8 (strict mode) - Backend (`src/`) and frontend (`web/src/`)
- SQL (PostgreSQL DDL) - `migrations/*.sql` (node-pg-migrate)
- Shell - `scripts/*.sh` (migration runner, codegen)

## Runtime

- Node.js >= 22 (`package.json` `engines`), ESM (`"type": "module"`)
- Backend run directly via `tsx` in dev (`pnpm mcp`, `pnpm worker`, `pnpm cli`); compiled with `tsc` to `dist/` for production (`node dist/main.js` per `railway.json`)
- Frontend built with Vite 6, served as a static SPA
- pnpm 11.18.0 (`packageManager` field), workspace defined in `pnpm-workspace.yaml` (root + `web/`)
- Lockfile: `pnpm-lock.yaml` present (committed)

## Frameworks

- Express 5.1 - HTTP server for API + MCP endpoint (`src/mcp/server.ts`)
- `@modelcontextprotocol/sdk` 1.12 - MCP server implementation (`StreamableHTTPServerTransport`, stateless per-request server)
- Kysely 0.28 - typed SQL query builder over `pg` (`src/db/client.ts`, generated types in `src/db/types.ts` via `kysely-codegen`)
- BullMQ 5.44 - Redis-backed job queue for ingestion pipeline (`src/queue/`)
- Better Auth 1.6.25 - authentication (`src/auth/index.ts`)
- React 18.3 + React Router 6.30 - SPA shell and routing
- Vite 6 - dev server/build, proxies `/api` to backend in dev
- Tailwind CSS 3.4 - styling (`web/tailwind.config.js`; requires dev-server restart on config changes)
- TanStack React Query 5.62 - server-state/data fetching
- Recharts 2.15 - dashboard charts
- Framer Motion 11 - animation
- Vitest 3.1 - unit/integration tests (`vitest.config.ts`, `test/`)
- TypeScript 5.8 (`tsc`) - both root and `web/` compile independently
- Biome 1.9 - lint/format for `src` and `test` (`biome.json`, `pnpm lint`)
- tsx 4.19 - TypeScript execution without build step (CLI, worker, MCP server in dev)
- node-pg-migrate 7.9 - Postgres migrations (`migrations/`, run via `scripts/migrate.sh`)
- `@dbml/core` + `kysely-codegen` - DB schema → TypeScript type generation (`scripts/codegen.sh`)

## Key Dependencies

- `googleapis` 148.0 - Gmail API client for invoice ingestion (`src/gmail/`)
- `openai` 4.98 - OpenAI SDK, used as the client for OpenRouter (`src/llm/openrouter.ts`)
- `zod` 3.24 + `zod-to-json-schema` 3.24 - runtime validation and LLM structured-output schema generation
- `unpdf` 0.12 - PDF text extraction
- `bullmq` 5.44 / `ioredis` 5.11 - job queue and Redis client
- `commander` 13.1 - CLI framework (`src/cli/`)
- `helmet` 8.3 - security headers on the Express app
- `pg` 8.15 - PostgreSQL driver (primary relational store)
- `mongodb` 6.16 - MongoDB driver, used as GridFS-style blob store for PDFs and logos (`src/mongo/`)
- `uuid` 11.1 - identifier generation

## Configuration

- Loaded via `process.loadEnvFile()` in `src/config.ts` (falls back silently to `process.env` when no `.env` present, e.g. on Railway)
- Validated centrally at startup with a single `zod` schema in `src/config.ts`; invalid/missing required vars cause `process.exit(1)` with a printed list of issues
- See INTEGRATIONS.md for the full variable inventory (names only, no values)
- Root: `tsconfig.json` (`target: ES2023`, `module: NodeNext`, `strict: true`, `noUncheckedIndexedAccess: true`, `rootDir: src`, `outDir: dist`)
- Web: separate `web/tsconfig*.json` + `web/vite.config.*` (not read in detail; build via `tsc -b && vite build`)
- Lint config: `biome.json`

## Platform Requirements

- Node >= 22, pnpm 11.x
- Local Postgres/MongoDB/Redis via `docker-compose.yml` (ports 5434, 27018, 6380 to avoid clashing with default local installs)
- `.env` file for secrets (see `.env.example` for the variable list)
- Railway (`railway.json`): Railpack builder, `startCommand: node dist/main.js`, `restartPolicyType: ON_FAILURE`, max 5 retries
- Railway injects environment variables directly (no `.env` file expected in production)
- Multiple Railway services deploy from the same repo, dispatched by role (see INTEGRATIONS.md)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- `kebab-case.ts` for backend modules (`src/pipeline/non-invoice-heuristics.ts`, `src/queries/vendor-match.ts` if present, `src/crypto/tokens.ts`)
- `PascalCase.tsx` for React components (`web/src/components/AnimatedNumber.tsx`, `web/src/pages/Dashboard.tsx`)
- Test files mirror the module name plus `.test.ts` under `test/unit/` (not co-located): `test/unit/reconcile.test.ts` tests `src/pipeline/reconcile.ts`
- camelCase, verb-first for actions (`resolveAuthContext`, `converterFor`, `invoiceListQuery`)
- Query builder functions named after what they return, e.g. `src/queries/invoices.ts` exports `invoiceListQuery`
- camelCase; `_minor` suffix convention for money stored as integer minor units (`amount_minor`, `total_minor`, `rate_minor`) — this is a DB column naming convention that leaks into TS types on purpose, see `src/queries/facts.ts`
- PascalCase interfaces, often with a `Options` or `Row` suffix describing shape/purpose: `InvoiceListRow`, `ListInvoicesOptions` (`src/queries/invoices.ts`), `ConversionMeta`, `Converted<T>` (`src/queries/converted.ts`)
- Generated Kysely DB types live in `src/db/types.ts` and are excluded from Biome linting (see `biome.json` `files.ignore`) — never hand-edit this file, it is codegen output (`pnpm codegen` / `scripts/codegen.sh`)

## Code Style

- Biome (`biome.json`), not ESLint/Prettier. Config: 2-space indent, 100-char line width, single quotes, semicolons always, `organizeImports` enabled.
- `noExplicitAny` is `warn`, not `error` — `any` is discouraged but not blocked
- Run via `pnpm lint` / `pnpm lint:fix` (scoped to `src test`, not `web/`)
- `web/` has no visible lint script in `web/package.json` — only `typecheck`, `dev`, `build`, `preview`. Frontend code quality is enforced by TypeScript strictness only.
- `strict: true`, plus `noUncheckedIndexedAccess: true` and `noImplicitOverride: true` — stricter than default strict mode. Array/object index access returns `T | undefined`, so code must handle that explicitly rather than assuming presence.
- `target: ES2023`, `module`/`moduleResolution: NodeNext` — ESM throughout, imports use explicit `.js` extensions even in `.ts` source (NodeNext requirement): see `import { db } from '../db/client.js';` in `src/queries/invoices.ts`.
- `rootDir: src`, output to `dist/`. `web/` has its own separate `web/tsconfig.json`.

## Import Organization

## Error Handling

- Small, local `Error` subclasses per concern rather than one shared error hierarchy: `class BadRequest extends Error {}` (`src/api/routes.ts:63`), `class FxUnavailableError extends Error {}` (`src/fx/rates.ts:43`). These are thrown directly and presumably caught by Express error middleware / mapped to HTTP status.
- Plain `throw new Error('message')` is common for invariant violations and "should never happen" branches, with messages that include the relevant identifiers/context for debuggability, e.g. `throw new Error(\`unsupported token format: ${version ?? 'empty'}\`)` (`src/crypto/tokens.ts:29`), `throw new Error(\`invalid month '${month}', expected YYYY-MM\`)` (`src/queries/months.ts:14`).
- Auth/session guard pattern: handlers assume a prior middleware attached context, and throw synchronously if it's missing rather than silently defaulting — `if (!context) throw new Error('requireAuth did not run for this request');` (`src/api/routes.ts:100`), same pattern in `src/mcp/auth.ts:72`. This is a deliberate "fail loud, never default" discipline (see multi-tenant scoping below).
- Comments frequently explain *why* an error path exists, not just what it does — e.g. `src/gmail/oauth.ts:45` explains a revoked refresh token requires `cli auth` re-run.
- Express routes wrap async logic in try/catch and call `next(err)` to hand off to centralized error middleware (`src/auth/context.ts` `requireAuth`).

## Database Access

- Custom PG type parsers set globally in `src/db/client.ts`: `INT8` columns are coerced to `Number` (not string) and `DATE` columns are left as raw `'YYYY-MM-DD'` strings to avoid timezone shifting. Any new bigint or date column relies on these parsers — do not add ad hoc parsing elsewhere.
- Query files live in `src/queries/*.ts`, one file per domain concern (`invoices.ts`, `services.ts`, `spend.ts`, `facts.ts`, `fiscal.ts`, `months.ts`, `projections.ts`, `meta.ts`, `converted.ts`, `filters.ts`, `format.ts`).
- Query functions take `orgId` as an explicit required parameter and build `.where('<table>.org_id', '=', orgId)` filters directly in the query chain — see `invoiceListQuery` in `src/queries/invoices.ts:29-34`.
- Schema-qualified table names used throughout (`billing.invoices`, `server.service`, `billing.email`) — this is a multi-schema Postgres database, not a flat public schema.

## Multi-Tenant Scoping Discipline

- `AuthContext.orgId` (`src/auth/context.ts`) is **deliberately non-optional**. Every authenticated request context carries a required `orgId: number`. The file's own doc comment states: "there is no `orgId ?? default` anywhere, and no process-wide default org to fall back to."
- `resolveAuthContext` returns `undefined` (not a context with a null org) for a signed-in user with no org membership — this is treated as a distinct, valid state (pre-onboarding), not an error, and is never silently defaulted to some org.
- Every query function that touches tenant data takes `orgId` as an explicit parameter and applies it as a `.where(...)` filter — grep `org_id` across `src/queries/*.ts` (`spend.ts`, `projections.ts`, `meta.ts`, `invoices.ts`, `services.ts`, `facts.ts`) to find all such call sites when adding new queries.
- Some tables (e.g. line items) don't carry `org_id` directly — scoping is enforced via `.innerJoin` to a table that does, and comments call this out explicitly: `src/queries/invoices.ts:107` "The join is the org filter. Line items carry no org_id of their own..." and `:157` "The join is the whole point: line items have no `org_id`, so an id alone is [not sufficient]." **When adding a query against an org-scoped join table, the join itself must be the enforcement — do not trust a bare foreign key id.**
- **When writing a new query or route, always require `orgId` as a parameter and filter on it explicitly — never rely on an implicit default or a global connection-level tenant.**

## Migrations

- Location: `migrations/*.sql`, numbered sequentially with a zero-padded 4-digit prefix plus a short descriptive slug: `0001_init.sql`, `0002_dashboard.sql`, `0003_category_taxonomy.sql`, `0004_fiscal_year.sql`, `0005_restore_constraints.sql`, `0006_better_auth.sql`, `0007_tenancy.sql`, `0008_resync_identity_sequences.sql`, `0009_org_settings.sql`.
- Run via `node-pg-migrate` (`pnpm migrate` → `sh scripts/migrate.sh`).
- **Hard rule (from repo `CLAUDE.md`): never run `@better-auth/cli migrate` against any database.** Better Auth's CLI applies DDL directly without recording it in `pgmigrations`, so the change is invisible to `node-pg-migrate` and does not survive a Railway deploy (which runs `migrations/` at boot). Instead, use `npx @better-auth/cli generate` to *emit* DDL, diff it, and hand-transcribe it into the next numbered `migrations/*.sql` file — cross-check the emitted column set against the installed library version rather than trusting the CLI output.
- `migrations/0005_restore_constraints.sql` is a documented recovery migration: production once drifted because it was loaded from a constraint-stripped dump, so `pgmigrations` claimed 0001-0004 were applied while the live database had no primary/unique/foreign keys at all. This migration is conditional/idempotent so it is a no-op on a database built cleanly from 0001 onward. **Before adding a new foreign key, confirm the referenced table actually has the unique constraint it depends on** — this has broken before.

## React / Frontend Conventions (`web/`)

- One component per file, `PascalCase.tsx`, under `web/src/components/` (flat, no subfolders per feature observed) and `web/src/pages/` for route-level views.
- Doc comments above components explain *why* a pattern was chosen, not just what it does — e.g. `web/src/components/AnimatedNumber.tsx` explains why the tween writes to the DOM node directly instead of through React state (avoiding a 60fps re-render), and why "displayed" is tracked in a ref rather than derived from the animation target (so interrupting a paging animation resumes from the current presentation value instead of jumping backward).
- Motion tokens centralized in `web/src/motion/tokens.ts` (e.g. `SPRING`) rather than inline spring configs per component.
- Formatting helpers centralized in `web/src/utils/format.ts` (e.g. `formatCurrency`) rather than reimplemented per component.
- **The default Tailwind font-size scale is fully replaced, not extended.** Custom named sizes only: `micro`, `caption`, `code`, `footnote`, `body`, `subhead`, `title3`, `title2`, `title1`, `display`, `lede`, `hero`, `hero-lg`. Classes like `text-base`, `text-lg`, `text-xl` **do not exist** in this project and will silently fail to apply anything. Always use the named scale.
- Each size token bundles fontSize + lineHeight + letterSpacing together as one atomic decision (see comment in `tailwind.config.js`) — do not override line-height/tracking separately from a size token.
- Colors resolve through CSS variables (`rgb(var(--x) / <alpha-value>)`) rather than literal hex, via a `token()` helper in the config, so theme switching (`darkMode: 'class'`) is one class toggle on `<html>` instead of `dark:` variants scattered everywhere. **Never write a bare `var(--x)` color** — Tailwind emits it verbatim and silently drops any opacity modifier.
- **`DESIGN.md` at repo root is the source of truth for the design system** — it defines the full color palette (accent, canvas, surface, ink scale, warn/danger states), and the tuned typography scale with exact font sizes/weights/line-heights/letter-spacing per named token (hero, hero-lg, display, etc.). Treat it as documentation of intent behind `tailwind.config.js`; consult it before adding new colors or type sizes rather than inventing new Tailwind values.
- **Hard operational rule (from repo `CLAUDE.md`): editing `web/tailwind.config.js` requires restarting `pnpm dev:web`.** HMR reloads CSS but does not regenerate newly-referenced utility classes, so a new color/font/border-width added to config silently resolves to nothing at runtime (invisible bars, unstyled text) — this looks exactly like a CSS bug and is not one. Kill and restart the Vite dev server after any Tailwind config edit before debugging further.

## Comments

- Comments favor **explaining rationale and history over restating code** — many files carry a paragraph-level doc comment on a function or class explaining why a specific approach was chosen, what bug it prevents, or what non-obvious constraint it satisfies (see `src/queries/converted.ts` module doc citing `SPEC.md:190-196`, `src/auth/context.ts` on why `orgId` is non-optional, `web/src/components/AnimatedNumber.tsx` on ref-based DOM writes).
- SPEC.md is referenced directly from code comments as the source of truth for business rules (`src/queries/converted.ts`) — check `SPEC.md` when a comment cites it for full context.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Process entry / role dispatch | Runs migrations, then boots MCP+API server or the BullMQ worker based on `SERVICE_ROLE` | `src/main.ts` |
| Express app (API + MCP + SPA host) | Auth-gated REST API, streamable-HTTP MCP endpoint, static SPA fallback | `src/mcp/server.ts` |
| MCP tool surface | Registers per-request MCP tools scoped to one org | `src/mcp/tools/index.ts`, `src/mcp/auth.ts` |
| REST API routes | Dashboard-facing endpoints, session-cookie authenticated | `src/api/routes.ts`, `src/api/public-routes.ts` |
| Auth / tenancy resolution | Better Auth session → org membership → `AuthContext` | `src/auth/context.ts`, `src/auth/memberships.ts`, `src/auth/index.ts`, `src/auth/api-keys.ts` |
| Gmail discovery | Scans a mailbox, classifies senders as billing vendors via LLM, enqueues backfill | `src/pipeline/discovery.ts` |
| Historical backfill | Re-scans a confirmed sender's full mail history | `src/pipeline/backfill.ts` |
| Recurring sync | Cron-scheduled incremental resync of connected accounts | `src/pipeline/sync.ts`, `src/queue/scheduler.ts` |
| Stage 1: classify email | Dedupe, sender-match, heuristic score, optional LLM classify, create `invoices` row | `src/pipeline/stages/process-email.ts`, `src/pipeline/heuristics.ts` |
| Stage 2: fetch PDF | Downloads Gmail attachment into GridFS, or marks body-text fallback | `src/pipeline/stages/fetch-pdf.ts` |
| Stage 3: extract | PDF/body text → LLM structured extraction → reconcile → write invoice + line items | `src/pipeline/stages/extract-invoice.ts`, `src/llm/extract.ts`, `src/pipeline/reconcile.ts` |
| Queue definitions | Job names, payload types, `enqueue()` helper | `src/queue/queues.ts` |
| Worker dispatch loop | Maps job name → pipeline stage function | `src/queue/worker.ts` |
| LLM integration | OpenRouter client, extraction/classification/categorization schemas | `src/llm/openrouter.ts`, `src/llm/extract.ts`, `src/llm/classify.ts`, `src/llm/categorize.ts`, `src/llm/schemas.ts` |
| Currency conversion | Query-time FX conversion, never written back | `src/fx/rates.ts`, `src/queries/converted.ts` |
| Query layer | All Postgres reads for both API and MCP, always org-scoped | `src/queries/*.ts` |
| Web SPA | React dashboard consuming `/api/*` | `web/src/` |
| CLI | Operator commands (seed dev user, categorize, backfill, etc.) | `src/cli/index.ts`, `src/cli/commands/*` |

## Pattern Overview

- Single Express app serves three concerns at once: authenticated REST API (`/api`), MCP tool endpoint (`/mcp`), and the built React SPA (static fallback) — see `src/mcp/server.ts`.
- Ingestion is a strict pipeline of BullMQ jobs, each stage reading/writing `billing.invoices.status` as a state machine (`pending → classified → pdf_fetched → parsed`, or `failed`).
- Multi-tenancy is enforced at the query layer: every query function takes `orgId` as a required argument; there is no default-org fallback anywhere (`src/queries/*.ts`, enforced in `src/api/routes.ts`'s `orgOf()`).
- Currency conversion happens only at read time, never persisted (`src/queries/converted.ts`, `src/fx/rates.ts`).
- Two storage engines: Postgres (structured data, via Kysely) and MongoDB GridFS (raw PDF blobs only, via `src/mongo/pdfs.ts`).

## Layers

- Purpose: choose which process role to run, apply migrations before anything else boots.
- Location: `src/main.ts`
- Contains: role dispatch, migration-lock retry logic.
- Depends on: `migrations/*.sql`, `node-pg-migrate`.
- Used by: Railway service startup command for both services.
- Purpose: HTTP surface — session auth, REST endpoints, MCP endpoint, static SPA.
- Location: `src/mcp/server.ts`, `src/api/routes.ts`, `src/api/public-routes.ts`, `src/mcp/tools/index.ts`, `src/mcp/auth.ts`
- Contains: Express routing, request-scoped MCP server instantiation, response serialization.
- Depends on: query layer (`src/queries/*`), auth layer (`src/auth/*`), pipeline retry/upload helpers.
- Used by: the SPA (`web/src`) and external MCP clients.
- Purpose: session/cookie authentication (Better Auth), API-key authentication for MCP, org membership resolution.
- Location: `src/auth/index.ts`, `src/auth/context.ts`, `src/auth/memberships.ts`, `src/auth/api-keys.ts`, `src/mcp/auth.ts`
- Contains: Better Auth config, `requireAuth`/`requireSameOrigin` middleware, `resolveActiveOrg`, API key hashing/lookup.
- Depends on: `client.auth_*` and `client.org_member`/`client.api_key` tables.
- Used by: every `/api` route and the `/mcp` POST handler.
- Purpose: end-to-end Gmail ingestion into structured invoice data.
- Location: `src/pipeline/*.ts`, `src/pipeline/stages/*.ts`
- Contains: discovery, backfill, sync, three ingestion stages, reconciliation, heuristic scoring, PDF text extraction, upload handling, retry.
- Depends on: `src/gmail/*` (Gmail API client), `src/llm/*` (extraction/classification), `src/db/client.ts`, `src/mongo/pdfs.ts`, `src/queue/queues.ts`.
- Used by: `src/queue/worker.ts` job dispatch.
- Purpose: BullMQ job definitions, Redis connection, cron scheduling.
- Location: `src/queue/queues.ts`, `src/queue/worker.ts`, `src/queue/redis.ts`, `src/queue/scheduler.ts`
- Contains: `JobPayloads` type map (the job contract), `enqueue()`, worker dispatch `switch`.
- Depends on: `ioredis`, `bullmq`.
- Used by: pipeline stages (to chain the next stage) and the API (`retryExtraction`, uploads).
- Purpose: all Postgres reads, always org-scoped; currency conversion; categorization/aggregation logic used by both API and MCP.
- Location: `src/queries/*.ts`
- Contains: `invoices.ts`, `services.ts`, `spend.ts`, `converted.ts`, `facts.ts`, `meta.ts`, `months.ts`, `fiscal.ts`, `projections.ts`, `filters.ts`, `format.ts`.
- Depends on: `src/db/client.ts` (Kysely), `src/fx/rates.ts`.
- Used by: `src/api/routes.ts`, `src/mcp/tools/index.ts`.
- Purpose: React dashboard.
- Location: `web/src/`
- Contains: pages, components, API hooks, motion/theme utilities.
- Depends on: `/api/*` REST endpoints only (never queries Postgres/Mongo directly).
- Used by: end users via the browser; served statically by `src/mcp/server.ts` when `web/dist` exists.

## Data Flow

### Ingestion pipeline (Gmail → invoice rows)

### Read path (dashboard aggregates)

### MCP read path

- Server-side: request-scoped only — no long-lived in-process state beyond the singleton BullMQ `Queue`/Redis connection (`src/queue/queues.ts`, `src/queue/redis.ts`) and the Kysely `db` client (`src/db/client.ts`).
- Client-side: React state via hooks (`web/src/api/hooks.ts`), a workspace context (`web/src/state/workspace.tsx`), a theme context (`web/src/state/theme.tsx`), and `localStorage`-backed caches such as `web/src/utils/logoCache.ts`.

## Key Abstractions

- Purpose: tracks an invoice's progress through the ingestion pipeline.
- Examples: `billing.invoices.status` (`migrations/0001_init.sql`), transitions in `src/pipeline/stages/process-email.ts`, `fetch-pdf.ts`, `extract-invoice.ts`.
- Pattern: `pending → classified → pdf_fetched → parsed`, or `failed` at any point with a `failure_reason`.
- Purpose: makes every data-access call carry a required, non-optional `orgId` so there is no implicit default tenant.
- Examples: `src/auth/context.ts` (`AuthContext`, `orgOf()` in `src/api/routes.ts`), `registerTools(server, orgId)` in `src/mcp/tools/index.ts`.
- Pattern: resolve once at the request boundary, thread explicitly through every function signature down to the query layer.
- Purpose: typed BullMQ job names and payloads shared between enqueue call sites and the worker dispatch loop.
- Examples: `JobPayloads` interface, `src/queue/queues.ts`; `switch (name)` in `src/queue/worker.ts`.
- Pattern: adding a job type means extending `JobPayloads`, handling it in the switch, and the `default: throw new Error(... satisfies never)` guard makes an unhandled case a compile error.
- Purpose: separates "raw invoice/line-item data in its native currency" from "converted for display."
- Examples: `InvoiceFact`/`LineItemFact` (`src/queries/facts.ts`), `Converted<T>` (`src/queries/converted.ts`).
- Pattern: query functions return native-currency facts; a separate conversion step produces display-currency values plus `ConversionMeta` describing what happened.

## Entry Points

- Location: `src/main.ts`
- Triggers: Railway process boot (compiled to `dist/main.js`, or run directly via `tsx`).
- Responsibilities: run pending `migrations/*.sql` with advisory-lock retry, then `import('./queue/worker.js')` when `SERVICE_ROLE=worker`, otherwise `import('./mcp/server.js')`.
- Location: `src/mcp/server.ts`
- Triggers: HTTP requests once booted (via `npm run mcp` / `pnpm mcp` in dev, or as the `mcp` role in prod).
- Responsibilities: Express app serving `/healthz`, Better Auth routes (`/api/auth/*`), authenticated `/api/*` REST routes, `/mcp` (POST only, stateless per-request MCP server), and the static SPA fallback for all other GETs.
- Location: `src/queue/worker.ts`
- Triggers: BullMQ picking up jobs on the `ingestion` queue (via `npm run worker` / `pnpm worker` in dev, or `SERVICE_ROLE=worker` in prod).
- Responsibilities: dispatch each job to its pipeline stage function, record infra-failure `failure_reason`s after final retry, register the recurring `sync-all` cron on boot.
- Location: `src/cli/index.ts`, subcommands in `src/cli/commands/`
- Triggers: operator-invoked (`pnpm cli <command>`), e.g. `seed-dev-user`, categorize, backfill.
- Responsibilities: one-off/administrative operations outside the HTTP/worker lifecycle.
- Location: `web/src/main.tsx`
- Triggers: browser loading the built SPA (served by `src/mcp/server.ts` from `web/dist`), or Vite dev server (`pnpm dev:web`).
- Responsibilities: React root mount, routing via `web/src/routes.ts`.

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop per process; concurrency within the worker process is BullMQ's job concurrency (`concurrency: 5` in `src/queue/worker.ts`), not OS threads.
- **Global state:** Singleton BullMQ `Queue` (`src/queue/queues.ts`, module-level `queue` variable, lazily constructed), singleton Redis connections (`src/queue/redis.ts`), singleton Kysely `db` client (`src/db/client.ts`). The MCP server is deliberately NOT global state — a fresh `McpServer`/transport is built per `/mcp` request (`src/mcp/server.ts`) so the process stays stateless behind a load balancer.
- **Migration race:** Both `mcp` and `worker` roles run `runMigrations()` on boot (`src/main.ts`); node-pg-migrate uses `pg_try_advisory_lock` (non-blocking), so the loser must retry rather than fail — handled by the `LOCK_RETRIES`/`LOCK_RETRY_MS` loop in `src/main.ts`.
- **No shared-password auth:** removed (R2); dev/test sign-in uses email/password only when `NODE_ENV !== 'production'` (`src/auth/index.ts`, see `CLAUDE.md`).
- **Two-database split:** Postgres owns all structured/tenant data; MongoDB (GridFS) exclusively owns raw PDF bytes (`src/mongo/pdfs.ts`). No business logic depends on MongoDB beyond blob storage.
- **Currency values are never converted at write time:** `billing.invoices.value` and `billing.invoice_line_items.amount`/`rate` are always stored in the invoice's own currency's minor units; conversion is exclusively a read-path concern (`src/queries/converted.ts`).

## Anti-Patterns

### Implicit default tenant

### Trusting "known sender" to skip content checks

## Error Handling

- Business failure: pipeline stage calls `markFailed(invoiceId, reason)` which sets `status='failed'` and `failure_reason` directly, and the job function returns a string (not a throw) — so BullMQ marks the job "completed," not "failed" (`src/pipeline/stages/extract-invoice.ts`).
- Infra failure: an unhandled throw inside a stage causes BullMQ to retry per `defaultJobOptions.attempts` (3, `src/queue/queues.ts`); after the last attempt, `worker.on('failed', ...)` in `src/queue/worker.ts` writes `failure_reason` on the invoice (only if not already `parsed`).
- API errors: `BadRequest` (`src/api/routes.ts`) is caught by the error-handling middleware and returned as 400; anything else is logged and returned as a generic 500 JSON body — no stack traces leak to the client.

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| apple-design | Apple's approach to interface design and fluid, physical motion, translated for the web. Use when building or reviewing gesture-driven UI, spring animations, drag/swipe/sheet interactions, momentum and interruptible transitions, translucent materials and depth, typography (optical sizing, tracking, leading), reduced-motion, or the design foundations (feedback, spatial consistency, restraint) behind Apple-style interfaces. | `.claude/skills/apple-design/SKILL.md` |
| impeccable | Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface. Covers websites, landing pages, dashboards, product UI, app shells, components, forms, settings, onboarding, and empty states. Handles UX review, visual hierarchy, information architecture, cognitive load, accessibility, performance, responsive behavior, theming, anti-patterns, typography, fonts, spacing, layout, alignment, color, motion, micro-interactions, UX copy, error states, edge cases, i18n, and reusable design systems or tokens. Also use for bland designs that need to become bolder or more delightful, loud designs that should become quieter, live browser iteration on UI elements, or ambitious visual effects that should feel technically extraordinary. Not for backend-only or non-UI tasks. | `.claude/skills/impeccable/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
