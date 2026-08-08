# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the finance or operations lead at a small business.** They own the
question "what are we actually paying for," not the infrastructure that
generates the bill. They are not an engineer, but the vendors are SaaS and
cloud — Railway, Neon, Anthropic, Google Workspace — so the spend they answer
for is engineering spend. They work from the mailbox those invoices already
land in, on a fiscal calendar that is usually not the calendar year, and they
need the original PDF as often as they need the number.

**Secondary: the technical colleague.** They connect the MCP endpoint, mint and
revoke API keys, and query the data from an agent. This is a real path that
must work, but it is not the front door. When a design decision forces a
choice, the finance reading wins.

Signing in never grants access on its own: membership in an org is a deliberate
act by an owner, so the first person through the door does not inherit a
tenant. Roles exist (owner and member); invitations and an email allowlist gate
sign-up.

## Product Purpose

Rayshio reads the invoices already sitting in a business's billing mailbox and
turns them into one queryable spend history — by vendor, by usage category, by
fiscal period, in any display currency. It exists because there is no shared
customer or billing identity layer across SaaS vendors: answering "what am I
paying for" today means opening N dashboards, and essentially no vendor offers
an API to collect its own invoices.

Success is that a question which used to take an afternoon of dashboard
archaeology — or never got asked — is answered in one place, from evidence the
user can open and verify.

## Positioning

The mailbox is the only source that already has every vendor in it. Rayshio
takes the ingestion path nobody else will take — auto-discovering billing
senders from real mail history, including the aliases a vendor switches to
without telling anyone — and then does the thing that makes the data worth
having: it classifies **line items**, not invoices, into a shared usage
taxonomy, so storage cost is comparable across Neon, Railway and Azure even
though each vendor labels it differently. Per-vendor dashboards cannot do this
by construction; accounting software sees the payment, not the itemization.

Two truthfulness commitments are part of the position, not decoration:
currency conversion happens at query time at the ECB rate on each invoice's own
date and is never written back, so a past quarter's total does not move because
today's rate did; and any figure a user cannot verify labels itself as such.

## Operating Context

- **Stage:** public SaaS, pre-launch. Access is currently allowlist- and
  invitation-gated, but future work should assume strangers sign up.
- **The mailbox is the input.** Read-only Gmail (single provider today). Nothing
  is ever sent on the user's behalf.
- **Fiscal, not calendar.** Periods derive from the org's fiscal year start
  month. Fiscal years are named for the year they end in, and every label
  carries its date range, because that convention is not universal.
- **Multi-currency is the normal case,** not an edge case. Vendors bill in
  their own currency; the display currency is a lens over it.
- **Surfaces in use:** Dashboard (spend, budget, top vendors, recent invoices),
  Breakdown (usage categories rolled up across vendors), Invoices (paginated,
  searchable, with the original PDF), Reports (the same views over fiscal
  quarters and years), Calendar (received and projected invoice dates), MCP
  (connection recipes), plus the public Landing, Sign-in and Legal pages.
- **Account isolation is a real scenario:** the same vendor billing two
  mailboxes for two logically separate subscriptions must never merge into one
  vendor total. Aggregation groups by org first, vendor second — never by
  vendor name alone.

## Capabilities and Constraints

**Built today.** Gmail OAuth connection and encrypted refresh-token storage;
whole-mailbox billing-sender discovery and full-history backfill; scheduled
incremental sync; LLM extraction of invoices and line items with a five-value
usage category assigned per line; PDF storage; query-time currency conversion
across the ~30 ECB currencies plus an explicit peg table for hard-pegged
currencies outside it (AED); the six app surfaces above; an MCP endpoint scoped
by a revocable API key; org membership, roles and invitations; manual invoice
upload; light and dark themes.

**Committed but unbuilt.** These are product truth future design must plan
around, not speculation:

- **Exclusion and filtering** — per-invoice, per-service and per-account
  exclusion, applied to every aggregate *and* to the MCP tools, or an agent
  sees what the dashboard hides. This is also the mechanism for cross-account
  separation; deduplication is explicitly not.
- **Teams and multi-department mode** — an org-level mode, and exactly one team
  per service. The one-team constraint is deliberate: it makes team totals sum
  to the org total with no allocation math. Teams are never auto-assigned;
  guessing which department owns a vendor misattributes money. New services
  land in Unassigned, which must be visible rather than a footnote.
- **Accounting-provider export** — sending invoices on to the org's accounting
  provider. Not built, and until it is, it must not appear in user-facing copy.
- **Paid tiers** — a free trial that degrades to read-only, with a one-mailbox
  free tier. The shape beyond that is undecided.

**Constraints.**

- **The name in the code is not the name on the screen.** The product is
  Rayshio everywhere a user can see. The repository name, the `/mcp` endpoint,
  the `imcp_` key and cookie prefixes, and `MCP_API_KEY` keep their old
  `invoice-mcp` naming deliberately — they are published contracts already
  present in client configs on user machines, and renaming them breaks
  installed clients.
- **Two taxonomies, never conflated.** *Usage category* is what was bought on a
  line (compute, storage, …) and drives cross-vendor comparison. *Service
  category* is what the vendor is (Neon is a database). Neither substitutes for
  the other — an AI vendor still bills storage lines.
- **LLM output is never presented as fact where a human has decided.**
  Automated classification may overwrite an `llm`-sourced value, never a
  `user`-sourced one.
- **Itemization coverage is partial.** Only vendors whose invoices itemize have
  a breakdown. Absence must read as "no breakdown available," never as an empty
  chart implying zero.
- **No key is ever sent to the browser.**
- **Undecided:** whether the app adopts a component framework (shadcn) or
  vendors components directly; where org-level settings finally live, given
  fiscal year and budget currently sit inline on other surfaces.

## Brand Commitments

The product is called **Rayshio** (pronounced like "ratio") on every
user-facing surface, and that name is in active use across the landing page,
sign-in, wordmark and legal pages.

**The category standard is a standing preference.** Offered a replacement visual
world three times — a drafting/blueprint system, a theatrical lighting system,
and a meteorological chart system, each built far enough to judge — the owner
chose the category convention every time and asked to return to it. Future work
executes the conventional analytics-tool arrangement at the highest craft level
it can reach; it does not propose a concept world again unless the owner asks.
The bar is craft, not novelty.

Benchmark products for that bar are **undecided** — the question was asked and
left open, so no named comparison set constrains the work yet.

Beyond that, nothing in the identity is binding. The name, the wordmark, the
teal accent and its light/dark token set (originally from a Magic Patterns
design), and the marketing voice remain open to refinement — they are the
incumbent, and now the deliberate incumbent, but not a fixed constraint.

One editorial rule is worth preserving regardless of what replaces the look,
because it is a truth commitment rather than a style: public copy claims only
what the product does today, and a number the user cannot verify says so.

## Evidence on Hand

- `SPEC.md` — full MVP design, phased roadmap, both taxonomies, schema
  rationale.
- `TODO.md` — outstanding work, verified against the live schema on 6 Aug 2026.
- `dev/PRODUCT.md` — a 27-line business-brief draft. Its accounting-provider
  claim describes committed-but-unbuilt work; treat it as intent, not as a
  description of the shipped product.
- `dev/MONTEIZATION.md` — a 6-line stub of the tier shape.
- `dev/SCHEMA.dbml`, `migrations/` — the real data model.
- `web/src/marketing/copy.ts` — every public string, in one file, with the
  claims-only-what-is-built constraint documented at the top.
- Real production data: a live mailbox's ingested invoice history across real
  SaaS and infrastructure vendors, in multiple currencies.

**Absent, and not to be fabricated:** there are no customers, testimonials,
case studies, press mentions, logos-of-companies-using-it, usage statistics,
benchmarks, or published pricing. The product is pre-launch. Any figure shown
for illustration must label itself as illustrative, as the hero preview
already does.

## Product Principles

1. **The evidence is part of the answer.** Every number should be traceable to
   an invoice the user can open. A total that cannot be verified is worth less
   than a smaller one that can.
2. **Never state a derived figure as if it were a recorded one.** Converted
   totals carry their rate date; projected invoice dates read as projections;
   LLM-assigned categories are overridable and say where they came from.
3. **Absence is information.** Missing itemization, an unassigned service, a
   vendor with no history — each must be visible as itself, never rendered as
   zero or hidden.
4. **The finance reading wins.** Where the technical surface and the finance
   surface compete for primacy, the front door serves the person who owns the
   spend question.
5. **Isolation before aggregation.** Every total is scoped to an org first.
   Merging two accounts' spend for the same vendor is a correctness failure,
   not a display preference.

## Accessibility & Inclusion

**WCAG 2.2 AA is binding.** Contrast, visible focus, keyboard operability and
respect for `prefers-reduced-motion` are requirements, not polish. The codebase
already carries the relevant reflexes — reduced-motion suppression across the
motion layer, focus traps, roving tab index, scroll lock — and future work
holds that line.

Both light and dark themes must meet the bar independently; the token set is
built for that rather than as a mechanical inversion.
