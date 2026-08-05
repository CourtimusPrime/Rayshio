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
- **Phase 4 — UI.** Sidebar tabs:
  - **Dashboard** — high-level breakdowns: cost per service, last month's
    spend vs budget
  - **Breakdown** — itemized costs by normalized category, NOT by vendor.
    The goal is same-category cost comparison _across_ vendors — e.g.
    seeing that Railway's biggest cost is storage rather than compute lets
    you compare Railway's storage pricing against Azure's or Neon's and
    make an informed call about migrating a database. This only works if
    every vendor's line items are mapped to a shared category taxonomy
    (see `invoice_line_items.category` in the schema) rather than left as
    each vendor's own labeling — "Storage (root branches), GB-month" on a
    Neon invoice and "Volume storage" on a Railway invoice both need to
    resolve to the same `storage` category to be comparable. Show, per
    category: total spend, and a per-vendor breakdown within that category.
    Coverage caveat: this data only exists for vendors whose invoices
    itemize costs, or that have an optional vendor API connection (see
    "Itemization coverage" section below) — for everything else, the tab
    should clearly show "no breakdown available" rather than a misleadingly
    empty chart.
  - **Invoices** — the full invoice list, filterable, with per-invoice
    detail and the original PDF
  - **Reports** — spend over fiscal periods (quarter/year), using the org's
    configured fiscal year start
  - **Calendar** — calendar view of past and anticipated invoice dates
    (anticipated dates inferred from each service's historical billing
    cadence — e.g. if Neon has billed on the 1st of each month for the
    last 6 months, project the next expected date)
  - **Teams** — only present when the org is in Multi-Department mode; see
    "Departments & teams" below
  - **MCP** — setup/connection guide walking the user through configuring
    InvoiceMCP as an MCP server in Claude, Claude Desktop, ChatGPT, Codex,
    and Kilo
  - **Settings** — org-level configuration: department mode, fiscal year
    start, monthly budget, and the service category list. Fiscal year and
    budget currently live inline on other tabs; they belong here once this
    surface exists.

### Sidebar icon animation

Hovering a sidebar tab should animate its icon. The animations come from
[lucide-animated](https://lucide-animated.com), which distributes each icon
as a shadcn registry component installed individually.

Three tabs also change which icon they use. The animated component is the
source of truth for the icon, so where an animation exists for a better-fitting
icon than the one currently rendered, the icon changes with it:

| tab       | icon now              | icon after           | install                                                                          |
| --------- | --------------------- | -------------------- | -------------------------------------------------------------------------------- |
| Dashboard | `LayoutDashboardIcon` | `LayoutGrid`         | `pnpm dlx shadcn@latest add "https://lucide-animated.com/r/layout-grid.json"`      |
| Breakdown | `PieChartIcon`        | `GalleryVerticalEnd` | `pnpm dlx shadcn@latest add "https://lucide-animated.com/r/gallery-vertical-end.json"` |
| Invoices  | `ReceiptIcon`         | unchanged            | `pnpm dlx shadcn@latest add "https://lucide-animated.com/r/receipt.json"`          |
| Calendar  | `CalendarIcon`        | `CalendarDays`       | `pnpm dlx shadcn@latest add "https://lucide-animated.com/r/calendar-days.json"`    |
| MCP       | `TerminalIcon`        | unchanged            | `pnpm dlx shadcn@latest add "https://lucide-animated.com/r/terminal.json"`         |

Reports keeps `FileBarChartIcon`, unanimated, until an animation is chosen
for it — a half-animated nav is worse than an unanimated one, so either
finish the set or leave Reports visibly consistent with the rest.

Two constraints on the implementation:

- The animation is a hover affordance, not content. It must be suppressed
  under `prefers-reduced-motion: reduce`, like every other motion in the app.
- The project does not currently use shadcn, so `shadcn add` will want to
  scaffold its config and `components/` conventions on first run. Decide
  whether to adopt that or to vendor the five icon components directly —
  adding a component framework for five hover animations is a real cost and
  should be a deliberate choice rather than a side effect of the install
  command.

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

## Service categories

There are **two distinct taxonomies** and they must not be conflated:

- **Usage category** (`billing.invoice_line_items.category`) — _what was
  bought_ on a single invoice line: `compute`, `storage`, `network`, etc.
  This is what makes the Breakdown tab's cross-vendor comparison work, and
  it is assigned by the extraction LLM per line.
- **Service category** (new) — _what the vendor is_: Neon is a database,
  Canva is a design tool. One category per service, used for grouping and
  filtering in the UI and as the natural default when assigning services to
  teams.

A vendor's service category says nothing about its line items — an AI vendor
still bills storage lines — so neither taxonomy substitutes for the other.

### The list

Fixed, closed set. Each value carries a display label and a
[lucide](https://lucide.dev) icon name so the UI renders a service's
category identically everywhere it appears (all names verified present in
`lucide-react`):

| value           | label                       | lucide icon      | examples                        |
| --------------- | --------------------------- | ---------------- | ------------------------------- |
| `hosting`       | Hosting & infrastructure    | `Server`         | Railway, Vercel, GCP, Fly.io    |
| `database`      | Databases                   | `Database`       | Neon, Supabase, Mongo Atlas     |
| `ai`            | AI & ML                     | `Sparkles`       | Anthropic, OpenRouter, OpenAI   |
| `dev_tools`     | Developer tools             | `Code`           | GitHub, Doppler, Sentry         |
| `design`        | Design & creative           | `PenTool`        | Canva, Figma, Adobe             |
| `productivity`  | Productivity & collaboration| `Briefcase`      | Google Workspace, Notion        |
| `communication` | Communication               | `MessageSquare`  | Slack, Zoom, Twilio             |
| `marketing`     | Marketing                   | `Megaphone`      | Mailchimp, HubSpot              |
| `sales_crm`     | Sales & CRM                 | `Handshake`      | Salesforce, Pipedrive           |
| `finance`       | Finance & accounting        | `Receipt`        | Stripe, QuickBooks, Xero        |
| `security`      | Security & identity         | `ShieldCheck`    | 1Password, Cloudflare, Okta     |
| `analytics`     | Analytics & monitoring      | `ChartLine`      | PostHog, Datadog, Mixpanel      |
| `other`         | Other                       | `Package`        | anything unclassified           |

Same stability argument as the usage taxonomy: keep it small, get it roughly
right before it ships, because widening it later means re-classifying every
existing service. Where a vendor plausibly fits two categories (Slack is both
communication and productivity), pick the primary one — this is a grouping
aid, not an ontology.

### Assignment and user override

The sender-classification LLM call in the discovery pass already identifies
the vendor; assigning a service category is a closed-label task on the same
information, so it happens in that same call rather than as a separate pass.

The user can change any service's category from the UI. To keep a re-run of
discovery from silently reverting a human decision, the assignment records
how it was made (`llm` vs `user`) — automated classification only ever
writes over an `llm` value, never a `user` one. This mirrors the
`invoice_line_items.source` pattern already in the schema.

Because `server.service` rows are keyed by sender address and shared across
orgs, the category the user picks is stored **per-org**, not on the shared
service row. The LLM's proposal can live on the shared row as a default; the
override cannot.

## Departments & teams

Org settings carry a **department mode**:

- **Single Department** (default) — the org is one budget unit. No Teams tab,
  no team filter anywhere. This is the shape of every org today.
- **Multi-Department** — the org is split into user-defined teams (Tech,
  Marketing, Sales, …), and spend is attributable to them.

### Team assignment

Each service belongs to **exactly one team**, or to none ("Unassigned").
One team per service is a deliberate constraint: it makes team totals sum
exactly to the org total, so no chart needs allocation math, percentage
splits, or a reconciliation footnote. A shared tool (Google Workspace
billed once for everyone) goes to whichever team owns the budget line.

Teams are never auto-assigned — an LLM guessing which department owns a
vendor is a wrong answer presented as a fact, and it is wrong in a way that
misattributes money. New services land in Unassigned, and the Teams tab
surfaces that bucket prominently so spend can never quietly go uncounted.

### What Multi-Department changes

- **Global team filter.** A team selector in the top bar scopes Dashboard,
  Breakdown, Invoices, Calendar, and Reports. Every one of those views
  already filters by org; team is one more predicate on the same queries.
- **Teams tab.** Per-team comparison the other tabs can't show: each team's
  share of org spend, spend trend over time, its services with per-service
  totals, and its usage-category mix (which is where the two taxonomies
  meet — "Tech's spend is 60% compute, Marketing's is 90% subscription").
  The Unassigned bucket appears as a first-class row, not a footnote.
- **MCP tools** gain team awareness (see the MCP interface section).

### Mode switching

Turning Multi-Department off hides the Teams tab and the team filter but
**retains all team records and service assignments**. Toggling the mode is a
view decision, not a destructive one; a user flipping modes to see what
happens must not lose their assignment work. Deleting a team is the explicit
destructive action, and it returns that team's services to Unassigned rather
than deleting them.

Per-team budgets are a natural follow-on (`client.org.monthly_budget_minor`
has an obvious per-team analogue) but are deliberately not in this cut —
team attribution has to be trusted before budget variance per team means
anything.

## Itemization coverage & vendor API/OAuth connections

Not every vendor puts itemized costs in their invoice PDF — Neon does,
Railway generally doesn't (lump-sum totals only). Email-sourced ingestion
can only extract what the invoice actually contains, so `Breakdown`-tab
category data will be incomplete or entirely missing for vendors that
don't itemize on the invoice itself.

This is a data-source gap, not a schema gap — the fix is a second, optional
ingestion path per service:

- **Tier 1 (MVP, email-only):** always available for every connected
  service. Gives invoice totals, dates, and line items _only when the
  vendor's PDF itemizes them_.
- **Tier 2 (post-MVP, per-service API/OAuth connection):** for a vendor
  whose invoices don't itemize, the user can optionally connect that
  vendor's own API/dashboard (API token or OAuth, vendor-dependent) so
  InvoiceMCP can pull usage breakdown data directly from the source of
  truth rather than trying to infer it from a lump-sum PDF. This is
  strictly additive/optional — Tier 1 alone still gives correct spend
  totals and the `Dashboard`/`Calendar` tabs work fully without it. Tier 2
  only unlocks richer `Breakdown` data for that specific vendor.

This keeps the security surface honest: read-only email access is already
the MVP's access footprint, and each additional vendor API/OAuth connection
is a deliberate, per-service, user-initiated opt-in — not a blanket
requirement to get any value from the app.

Schema implication: `invoice_line_items` needs a `source` field
(`invoice_pdf | vendor_api`) so it's always clear whether a line item came
from the parsed PDF or a connected vendor API — this matters for trust
(PDF-derived data is closer to "what you were actually billed," API-derived
usage data may reflect current-period usage rather than the exact billed
period) and for not silently blending two data qualities in one chart.
A new `client.vendor_connection` table (analogous to `client.account`, but
per-service rather than per-mailbox) tracks these optional connections:
org, service, auth type, credential, status.

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

- `client.org` — the account/organization using InvoiceMCP; also holds
  org-level settings: monthly budget, fiscal year start, and
  `department_mode` (`single | multi`)
- `client.team` — user-defined departments within an org (name, colour, and
  optionally a lucide icon); only meaningful when `department_mode = 'multi'`
- `client.org_service` — per-org settings for a shared `server.service` row:
  the org's chosen `service_category`, how that category was set
  (`llm | user`), and `team_id` (nullable → Unassigned). Exists because
  `server.service` is keyed by sender address and shared across orgs, so
  one org's category choice and team assignment must not leak into another's
- `client.account` — one row per connected mailbox (OAuth provider, refresh
  token, connection status)
- `client.vendor_connection` — optional per-service API/OAuth connection
  used to enrich `Breakdown` data for vendors whose invoices don't itemize
  (see "Itemization coverage" section above)
- `client.billing_address` — recipient addresses (primary + aliases) that
  invoices arrive at
- `server.service` — vendors/senders (Neon, Stripe, AWS, etc.), plus the
  LLM's proposed `service_category` as a shared default; a user's override
  lives on `client.org_service`, never here
- `billing.email` — one row per ingested email, deduped via
  `(server_id, message_id)` unique constraint
- `billing.invoices` — one row per invoice (1:1 with `email`), holds totals,
  dates, and a `status` field (`pending | parsed | failed`) tracking pipeline
  progress
- `billing.invoice_line_items` — itemized cost breakdown per invoice
  (description, normalized category, source, quantity, unit, rate, amount,
  period), so agents can answer "what's driving the cost" not just "how
  much total" — only populated when a vendor's invoice itemizes or a
  `vendor_connection` supplies usage data

**Money is always stored as integers in minor units (cents)**, never float.
`invoice.value` = sum of `invoice_line_items.amount` for that invoice
(reconciliation check worth asserting in the extraction pipeline).

**Note for Phase 4:** the Dashboard tab's "spend vs budget" view needs a
budget figure to compare against, which isn't in the current schema — add
a `monthly_budget` (or similar) column to `client.org` when Phase 4 work
starts, since it's user-set rather than derived.

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

- `list_services(org_id, team?)` — distinct vendors an org has invoices
  from, each with its service category and team
- `list_invoices(org_id, service?, team?, date_range?)` — invoice list with
  totals
- `get_invoice(invoice_id)` — full invoice detail incl. line items
- `get_invoice_pdf(invoice_id)` — fetch the underlying PDF from Mongo
- `spend_summary(org_id, group_by: service|category|service_category|team, team?, date_range?)`
  — aggregated spend. `group_by: category` is the cross-vendor usage
  comparison ("what's driving my storage cost across every vendor");
  `service_category` groups by vendor type ("how much am I spending on AI
  vendors"); `team` answers "what does Marketing cost" and is only
  meaningful in Multi-Department mode
- `list_teams(org_id)` — teams and their service counts; returns empty in
  Single Department mode rather than erroring, so a client need not branch
  on org mode

A `team` argument naming a team that doesn't exist should be an explicit
error, not a silent empty result — an agent asking about "Marketing" when
the team is called "Growth" must find that out.

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

Each line item must also be classified into the fixed `category`
taxonomy (`compute | storage | api_usage | ai_invocations | network |
subscription | other`) as part of the same extraction call — this is what
makes the Breakdown tab's cross-vendor comparison possible. This is a
closed classification task (fixed label set), so it's reliable to do
in the same LLM call as field extraction rather than as a separate
pass. Keep the taxonomy small and stable — expanding it later means
re-classifying historical line items, which is a one-time backfill worth
avoiding by getting the category list roughly right before Phase 1 ships.

**Service category classification.** Assigned in the existing
sender-classification call during discovery (closed label set, same
evidence, no extra LLM round trip). Never re-runs over a `user`-set value.
A vendor the classifier is unsure of goes to `other` rather than a
confident guess — `other` is visibly wrong in the UI and invites a
correction, whereas a plausible-but-wrong category silently distorts every
category-grouped chart.

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
- Vendor API/OAuth connections for itemized usage data beyond what a
  vendor's invoice PDF already contains (see "Itemization coverage"
  section — this is a real Phase 4+ need, just not MVP)
- Splitting one service's spend across multiple teams by percentage, and
  per-team budgets (see "Departments & teams")
- Shared mailbox / delegated access flows
- Forwarding-address ingestion for unauthenticatable aliases
- Any write/transactional capability (paying, disputing, cancelling
  subscriptions) — this is a read-only context layer for now
- Multi-tenant auth/permissions beyond a single connected `org`
