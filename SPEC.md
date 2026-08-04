# InvoiceMCP — MVP Spec

## What this is

An MCP (Model Context Protocol) server that gives AI agents read access to a
user's subscription/SaaS invoice and billing history, aggregated across every
vendor — normalized into one queryable store instead of scattered across
inboxes and per-vendor dashboards.

MVP scope is **read-only, email-sourced, single-provider (Google) ingestion**.
No accounting-software or banking integrations, no write/transactional
capability, no non-Gmail providers yet — those are explicitly out of scope
for this milestone (see "Out of scope" below).

## Problem

There's no shared customer/billing identity layer across SaaS vendors. Users
who want to answer "what am I paying for across all my services" today have
to check N separate dashboards. This project ingests billing emails, extracts
structured invoice + line-item data, and exposes it to agents over MCP so
that question becomes a single query.

## Phased roadmap

- **Phase 1 — Proof of concept.** Connect a single Gmail account, auto-discover
  the billing senders/services in that mailbox, pull the full invoice history
  for those senders, store PDFs in Mongo and structured data in Postgres. No
  MCP server yet — success criteria is "the data is correctly in the
  databases."
- **Phase 2 — Expose over MCP.** Wrap the store in an MCP server, auth'd via
  API key (simpler than OAuth for this leg — the OAuth flow from Phase 1 is
  for connecting the _mailbox_, this is a separate concern: authenticating
  the _agent client_ that queries InvoiceMCP). Prove it out by connecting
  from Claude Desktop and querying real data.
- **Phase 3 — Filtering/customization.** Let users exclude specific
  invoices, services, or entire accounts from what's surfaced. This is also
  what solves cross-account separation (see below) — filtering, not
  deduplication, is the mechanism.
- **Phase 4 — UI.** Two sub-stages: (a) spend breakdown per service, then
  (b) breakdown by usage category grouped across vendors (e.g. total storage
  spend across every platform that bills for storage, not just per-vendor
  totals).

Recurring sync (after the initial backfill in Phase 1) should run on an
interval — e.g. monthly, aligned to whenever invoices are typically due —
and only needs to search each known billing sender for messages since the
last sync, rather than rescanning the whole mailbox.

### Account-level isolation

A real scenario this needs to handle correctly: the same vendor (e.g. Neon)
billing two different mailboxes for two logically separate subscriptions
(e.g. a personal account and a company tech-team account) — these must never
be merged into one "Neon spend" figure. Because `billing.email.recipient_id`
already ties every ingested invoice to a specific `client.billing_address`
(and transitively to one `client.account`/org), this isolation falls out of
the schema for free _as long as aggregation queries always group by
account/org first and vendor second, never by vendor name alone._

## Core user flow (MVP)

1. User authenticates with Google OAuth (offline access → refresh token).
2. InvoiceMCP scans the mailbox to identify:
   - Every address invoices are addressed to (the authenticated account,
     plus any aliases that route into it).
   - Every distinct sender ("service") that has sent what looks like a
     billing email to any of those addresses.
3. Once billing senders are identified, pull the full history of matching
   emails (not just new ones going forward).
4. For each email:
   a. Classify: is this actually an invoice/receipt? (LLM classification)
   b. If yes, extract structured invoice fields + line items (LLM or
   PDF-parser extraction from the attached PDF, if present)
   c. Store the raw PDF in MongoDB (GridFS or document store)
   d. Store structured data (org, address, service, email, invoice,
   line items) in Postgres
5. Agent queries the MCP server for invoice/spend data; server serves from
   Postgres, resolving PDF blobs from Mongo on demand only.

## Infrastructure

Deployed on Railway, using Railway's template databases:

- **PostgreSQL** — structured data (schema in `invoice-mcp-schema.dbml`)
- **MongoDB** — invoice PDF storage
- **Redis** — job queue for the async ingestion pipeline (email scan →
  classify → PDF fetch → extract), giving retry/backoff on failed pipeline
  stages rather than re-running a whole sync on any single failure

Claude Code should read connection details from environment variables
(Railway injects these automatically for linked services) rather than
hardcoding hosts/credentials anywhere.

## Data model

Postgres schema is defined in `invoice-mcp-schema.dbml` (attached alongside
this spec — import into dbdiagram.io or run through a DBML→SQL generator to
produce migrations). Summary of tables:

- `client.org` — the account/organization using InvoiceMCP
- `client.account` — one row per connected mailbox (OAuth provider, refresh
  token, connection status)
- `client.billing_address` — recipient addresses (primary + aliases) that
  invoices arrive at
- `server.service` — vendors/senders (Neon, Stripe, AWS, etc.)
- `billing.email` — one row per ingested email, deduped via
  `(server_id, message_id)` unique constraint
- `billing.invoices` — one row per invoice (1:1 with `email`), holds totals,
  dates, and a `status` field (`pending | parsed | failed`) tracking pipeline
  progress
- `billing.invoice_line_items` — itemized cost breakdown per invoice
  (description, quantity, unit, rate, amount, period), so agents can answer
  "what's driving the cost" not just "how much total"

**Money is always stored as integers in minor units (cents)**, never float.
`invoice.value` = sum of `invoice_line_items.amount` for that invoice
(reconciliation check worth asserting in the extraction pipeline).

## Pipeline stages & failure handling

Each invoice moves through: `pending` → (classified) → (PDF fetched) →
(line items extracted) → `parsed`, or → `failed` at any stage.

The `status` field must be updateable independently at each stage so a stuck
or failed invoice is debuggable — don't collapse this into a single
boolean. Log the failure reason (missing PDF, classifier rejected, extractor
returned malformed data, etc.) somewhere inspectable, even if it's just a
`failure_reason text` column on `invoices` for MVP.

## Multi-page PDF handling

Some vendor invoices span multiple pages (confirmed case: Neon, "1 of 2").
Line items are not guaranteed to fit on page 1. The PDF extraction step must
process every page of the attached PDF, not just the first, and line items
must be associated with the correct invoice even when split across pages.

## Idempotency

Re-syncing a mailbox must not create duplicate emails or invoices. Enforce
this via the `(server_id, message_id)` unique constraint on `billing.email`
— treat sync as safe to re-run at any time, not just an initial backfill.

## MCP server interface (read side, MVP)

Expose at minimum:

- `list_services(org_id)` — distinct vendors an org has invoices from
- `list_invoices(org_id, service?, date_range?)` — invoice list with totals
- `get_invoice(invoice_id)` — full invoice detail incl. line items
- `get_invoice_pdf(invoice_id)` — fetch the underlying PDF from Mongo
- `spend_summary(org_id, group_by: service|line_item_description, date_range?)`
  — aggregated spend, this is the "what's driving my cost" query

Exact MCP tool schema/transport (stdio vs HTTP) is an implementation
decision Claude Code should propose, not fixed here.

## Future integration idea (post-MVP)

Rather than (or in addition to) exposing data via MCP, invoices could be
pushed directly to an accounting firm's system — either via their API if one
exists (upload extracted PDFs on ingestion), or by forwarding grouped
invoice emails to a dedicated accounting-firm inbox. Not scoped for MVP;
needs a conversation with the accounting firm about API availability before
this is designed further.

## Implementation decisions

**Classification strategy.** Cheap heuristic pre-filter first (sender
domain, subject/body keywords like "invoice"/"receipt"/"payment", PDF
attachment present), LLM classification only on survivors. The LLM
classifier mainly earns its keep during the _discovery_ pass — the
infrequent whole-mailbox scan used to find new billing senders. Once a
sender is confirmed and stored in `server.service`, routine syncs are
scoped to known senders and can skip classification almost entirely,
treating anything from a known sender as an invoice by default. Keep a
lightweight classifier as a safety net for mail from senders not yet
registered.

**PDF extraction.** LLM-first, not a per-vendor rules-based parser. Extract
raw text/layout from the PDF (parsing library used only for text
extraction, not structure interpretation), then feed that text to an LLM
with a structured-output prompt to produce the normalized invoice +
line-item JSON. Vendor-specific handling becomes a prompt variation per
vendor rather than a separate code path, which is much cheaper to extend
than brittle per-vendor parsers that break on template changes. Validate
every extraction: line-item `amount`s should sum to the invoice `value`
within rounding tolerance — mark `status: failed` and log the mismatch
otherwise, don't trust an unreconciled extraction.

**Currency handling.** Store native currency per-invoice (already in the
schema), no conversion at ingestion. `spend_summary` supports two modes:
default groups and sums per-currency with no conversion (most orgs are
single-currency, and silent conversion hides real FX-driven cost changes);
an optional flag triggers query-time conversion via a rate lookup, with
output explicitly labeled as converted and dated. Conversion is never baked
into stored data.

## Out of scope for MVP

- Accounting software integrations (QuickBooks, Xero, etc.)
- Banking/transaction data
- Non-Gmail email providers (Outlook/Microsoft 365 — planned next, not MVP)
- Shared mailbox / delegated access flows
- Forwarding-address ingestion for unauthenticatable aliases
- Any write/transactional capability (paying, disputing, cancelling
  subscriptions) — this is a read-only context layer for now
- Multi-tenant auth/permissions beyond a single connected `org`
