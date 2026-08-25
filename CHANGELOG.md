# Changelog

All notable changes to Rayshio are recorded here. Newest first.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Entries say *why* a change was made where the reason is not obvious from the
title — a list of what changed is recoverable from git; the reasoning is not.

---

## Development environment

Recorded here because it is the kind of thing that is obvious to whoever set it
up and invisible to everyone else.

**Development runs against self-hosted database instances**, not managed cloud
services and not (by default) the local Docker containers:

| Store | Role in the system |
|-------|--------------------|
| PostgreSQL | All structured and tenant data. The source of truth. |
| MongoDB | GridFS blob store — raw invoice PDFs and vendor logos only. |
| Redis | BullMQ job queue for the ingestion pipeline, and its cron. |

All three are self-hosted on a private host reachable over Tailscale. The actual
endpoints and credentials live in `.env` (`PGSQL_DATABASE_URL`,
`MONGODB_DATABASE_URL`, `REDIS_DATABASE_URL`) and are deliberately not written
down here.

Two consequences worth knowing before you run anything:

- **The `.env` database is shared and holds real invoice data.** It is not a
  scratch database. Anything destructive — a migration you are unsure of, a rule
  that marks invoices `failed`, a delete — should be exercised against a
  throwaway database first. `docker-compose.yml` brings up local Postgres,
  Mongo and Redis on ports 5434 / 27018 / 6380 for exactly this.
- **Process environment beats `.env`.** `src/config.ts` uses
  `process.loadEnvFile()`, which does not overwrite variables that already
  exist, so exporting `PGSQL_DATABASE_URL` for a single command is enough to
  redirect it. The shell scripts under `scripts/` are the exception — they
  `set -a; . ./.env`, which clobbers the exported value, so invoke the
  underlying binary directly when overriding.

---

## 2026-08-25

### Fixed

- **A paid receipt no longer extracts as a £0.00 invoice.** `EXTRACT_SYSTEM` listed an "amount already paid" among the things that reduce what is owed and must be emitted as a negative line item, and told the model that when a document shows a Total and a lower Amount due, the total is the *amount due*. On an already-paid receipt both rules fire together: Mailchimp's PDF carries a `Paid via Mastercard ending in 4149  £42.93` line and a £0.00 balance, so the model emitted `[Standard plan 3577, VAT 715, Paid via Mast… -4293]` with a total of 0, and the invoice recorded no spend at all.

  The prompt now separates a payment *record* from a *credit*: a credit comes from the vendor's side (applied balance, account credit, discount, proration) and genuinely lowers the cost; a payment comes from the customer's own card or bank and does not. A payment line is omitted from `line_items` entirely and `total_minor` is the amount **charged**, never the zero balance left behind after settlement. The existing applied-balance worked example is unchanged, and a real £0.00 invoice — a 100% free-trial discount that cancels the charge on the vendor's side — still extracts as 0.

  Found by importing 31 Mailchimp receipts: 4 of them (`MC09640739`, `MC09710958`, `MC10207397`, `MC11908723`) stored `value = 0` and were hidden from the invoices list by `zero_charge_mode`, silently losing £219.58 of real spend.

### Added

- **`suspiciousZeroTotal` in `src/pipeline/reconcile.ts`, and escalation on it in stage 3.** `reconcile` could never have caught the bug above, because that extraction is *self-consistent* — the line items sum to exactly the reported total of 0. Sum and total were simply both wrong, so arithmetic had nothing to object to.

  Nothing in the numbers separates it from a genuine zero, either: a 100% discount produces the same shape (a charge, an equal-and-opposite negative, a total of 0). Only the *description* of the negative line says which it is, and that is a judgement for the model. So the check rejects nothing — it flags the shape and the extract stage escalates to the stronger model for a second read, keeping the original answer unless the escalated one also reconciles. A genuine zero survives unchanged; the cost of the false positive is one extra LLM call on a document that charged nothing.

### Notes

- **Known unresolved:** the 4 affected production invoices still hold `value = 0`. The prompt fix only governs future extractions — correcting them needs a re-extract (`POST /api/invoices/:id/retry`, ids 3229, 3230, 3239, 3257) against a deployed worker carrying this change. Invoice 3228 is a genuine £0.00 free-trial receipt and must be left alone.
- A full sweep of every invoice id in the org found no other instance of this pattern; the 5 other hidden zero-value rows are `failed` extractions unrelated to it.

---

## 2026-08-15

### Changed

- **`just dev` automatically selects `:3100` for the API and `:5273` for Vite when either default development port is occupied.** The local SSH tunnel reserves `:3000` and `:5173`; refusing to start made the standard development command unusable while preserving that tunnel. The chosen ports are propagated to Vite's proxy and Better Auth origin so sign-in and state-changing requests still reach the matching local API.

## 2026-08-08

### Added

- **Zero-charge display setting** — "Hide zero-charges" (the default) or "Show
  everything", in workspace settings. A month with no usage still bills 0.00 and
  vendors itemise free lines; none of it says anything about what the company
  pays for.

  Two filters, because one cannot do it. Rows charging exactly 0 are dropped in
  the query layer, which every screen is built from. Groups are dropped after
  aggregation — a category holding a +500 charge and its -500 credit has two
  perfectly non-zero rows and a total of nothing, which row-level filtering
  cannot see.

  **Exactly zero, never `<= 0`.** A negative line is a credit note or refund: a
  real document with a real effect on spend, and the row it would be most
  alarming to lose. Totals are summed over everything either way, so hiding
  rows never moves a figure — asserted, not assumed.

  The setting is read inside the SQL predicate rather than fetched by each route
  and threaded through, so a query either honours it or does not exist.

- **Recategorize a line item, and it stays recategorized.** Click any item in
  the invoice drawer to file it under a new category. The sub-items on the
  Breakdown page work the same way, with one difference: a sub-item is a
  (vendor x category) cell covering however many distinct line texts, so filing
  one writes a rule per text in a single transaction — the cell cannot end up
  half moved.

  **The correction is a rule, not an edit to one row.** The same vendor bills
  the same thing every month, so fixing a single line and watching next month's
  invoice arrive misfiled would make the feature a treadmill. Two levels, and
  the narrower wins: this vendor's lines with this exact text, or everything
  from the vendor. Rules default to the narrower one — getting "all Neon is
  Storage" wrong silently re-files compute lines too.

  Applied at read time, over `client.category_rule`, which buys three things at
  once: retroactive with no backfill job, applied to invoices ingested later
  without the pipeline knowing rules exist, and destroying nothing — the
  classifier's original category stays on the row and returns if the rule is
  deleted.

- **New category taxonomy** (`dev/CATEGORIES.md`): four parent groups, twenty-one
  leaves, each with a Lucide mark. The old seven remap losslessly —
  `compute→computing`, `ai_invocations→ai`, `api_usage→access`,
  `subscription→subscriptions`, with `storage`, `network` and `other` keeping
  their slugs precisely so those rows are untouched.

  Two values were added beyond the source list, both deliberately. It had no
  home for a flat recurring plan (91 line items here), and its "Other" group had
  a blank second slot — a taxonomy with no escape hatch just pushes discounts
  and adjustments into whichever category is nearest, quietly.

  The taxonomy now exists in four places — `src/categories.ts`, the client copy
  in `web/src/types.ts`, the LLM enum, and a CHECK constraint — because the
  client cannot import from `src/`. `test/unit/categories.test.ts` asserts all
  four agree, since every drift fails silently: a category the model returns
  that the schema rejects, or one the schema accepts and the database refuses at
  write time, failing an invoice that parsed perfectly.

- **ServiceModal** — rename a vendor and replace its logo, from any vendor logo
  in the signed-in app.

  **Both edits are per-org, and that is the whole design.** `server.service` has
  no `org_id`: it is one row per `(name, sender_address)`, shared by every
  tenant receiving mail from that sender. `UPDATE server.service SET name = ...`
  on one org's behalf would rename that vendor inside a stranger's dashboard —
  invisible today, because the system is single-tenant in practice, and
  discovered only after signups, as other companies' data changing under them.
  So corrections live in a new `client.service_override (org_id, service_id,
  display_name, logo_id)` and reads coalesce over it.

  The global name stays the ingestion key. `attachUploadedInvoiceVendor` keeps
  matching against `server.service.name`, because two orgs renaming the same
  vendor differently must not make the pipeline treat them as two vendors.

  Reads go through one `displayName(orgId)` expression rather than a join
  threaded through six query builders — a join would have to be positioned
  correctly in each and mirrored in every `groupBy`, and an omission silently
  falls back to the global name on exactly one screen. Filters use it too:
  renaming a vendor and then filtering by that name has to return the invoices,
  or the rename is cosmetic.

  Uploaded logos are SVG only, capped at 64kb, and **rejected rather than
  sanitised** if they carry script, event handlers, embedded URLs or
  `foreignObject`. Stripping script out of SVG with string surgery is how filters
  get walked through by a nested CDATA section; a vendor logo has no business
  carrying script, so refusing is the honest version. Defence in depth only —
  the real control is that logos render through `<img src="data:...">`, where
  browsers do not execute script, which is why an uploaded logo must never reach
  `ServiceLogo`'s `dangerouslySetInnerHTML` tier.

  `ServiceLogo` becomes a button via an optional context. Its *absence* is
  load-bearing: the provider is mounted inside the authenticated tree, so on the
  signed-out marketing page the context is null and the logo stays the inert
  decoration it was, with no flag to remember. `BreakdownDetailList` was
  restructured — the logo used to sit inside the accordion button, and a button
  inside a button is invalid markup that browsers resolve by dropping one, taking
  its keyboard behaviour with it.

- **`just dev-all` now runs the worker too**, alongside the API server and Vite,
  and stops all three when any one of them exits. The worker binds no port, so
  forgetting it is silent: uploads are accepted, enqueued, and then sit at
  `pdf_fetched` forever while the UI says "cataloguing". That was mistaken for a
  bug in the upload path twice in one session.

  The recipe also refuses to start when 3000 or 5173 is already held. Vite does
  not refuse — it shifts to 5174 and mentions it in one line — so a browser tab
  still pointed at 5173 keeps talking to whatever stale process owns it, serving
  the frontend fine while proxying `/api` to an old server that 404s anything
  added since. That cost real debugging time.

  Polled with `kill -0` rather than `wait -n`: macOS ships bash 3.2, where
  `wait -n` does not exist, and under `set -e` it would take the whole stack
  down on startup.

- **Upload progress toast** (`web/src/components/UploadToast.tsx`). Reports what
  became of every uploaded file across four outcomes — added, duplicate, wasn't
  an invoice, errored — behind a hand-rolled puff spinner and dotted connectors.
  Retires itself on a timer that pauses on hover and on focus. Replaces a static
  "N queued for parsing" box whose last word on the subject was "queued", so a
  file that silently failed looked identical to one that worked.
- **Upload de-duplication, in two layers.** There was none: the upload path
  minted a random `upload-<uuid>` message id per call, so the existing
  `UNIQUE (server_id, message_id)` guard was structurally incapable of firing.
  Re-uploading one file created a second invoice and doubled that vendor's
  month.
  - `billing.invoices.pdf_sha256` plus a partial unique index
    (`migrations/0010_upload_dedupe.sql`), checked before anything is written —
    catches a byte-identical re-upload with no LLM spend.
  - An invoice-number check in `extract-invoice`, which catches the copy that
    differs by a byte and the upload of something the mailbox already ingested.
    Losers are marked `failed`, not deleted, so they stay visible under the
    Invoices "failed" filter and the rule stays reversible.
- **`GET /api/invoices/outcomes`** — batch pipeline state for a set of invoice
  ids, so polling a thirteen-file upload is one request per tick rather than
  thirteen. Ids belonging to another org are absent from the response rather
  than rejected, so the endpoint cannot be used to probe for ids.
- **Delete for uploaded invoices**, in the invoice drawer and as
  `DELETE /api/invoices/:id`. Restricted to uploads: a mailbox-ingested invoice
  would be re-created by the next sync, so deleting it would look like it had
  silently failed.
- **Category / Service tabs on the Breakdown page.** The same month's line items
  nested either way up. Both come from one `groupTwoLevel` aggregation with the
  keys exchanged, so the two views cannot disagree about totals, rounding or
  sort order.
- **Route-shaped skeleton loaders.** The Suspense fallback traced one generic
  block for every route; it now traces each page's actual composition, so
  arriving content settles into a shape already on screen.
- **Sliding sidebar highlight.** The active pill is a shared-`layoutId` element
  that travels between tabs instead of a class that could only cut.

### Changed

- **Brand accent switched from burnt orange to violet** — `#6d28d9` light,
  `#7c3aed` dark, with `accent-soft` `#f3eeff` / `#221540` and `accent-strong`
  `#5b21b6` / `#c4b5fd`. The category ramp, `--chart-bar-muted` and the dark
  focus ring follow the accent, so they moved with it.

  The orange read as brown, and that was arithmetic rather than taste: brown
  *is* dark orange, and the "white label on accent fill" rule forces the accent
  dark enough to land there — the vivid `#f97316` alternative measures 2.80:1
  against white and fails outright. Hues in the blue–violet band stay chromatic
  at the same lightness. Violet over indigo and blue for distinctiveness; over
  crimson and green because both collide with meaning already spent
  (`danger-text` is `#be123c`, green reads as "under budget").

  **The accent now lifts one step between themes, which it did not before.**
  The old orange held one value in both, because the brighter orange that reads
  better on near-black dropped white-on-accent to 3.6:1. Violet has the mirror
  problem — it is darker than orange at equal chroma, so holding `#6d28d9` in
  dark measures 2.69:1 against the canvas and a filled button loses its own
  edge. `#7c3aed` clears 3:1 there (3.36:1) and still carries white text
  (5.70:1). Both thresholds, neither with much room: if this value is ever
  retuned, re-measure both, not one.
- Upload state moved out of `UploadInvoices` into `UploadsProvider`, above the
  router. A batch started on `/invoices` used to lose its progress the moment
  you navigated away, while the server carried on working.
- Failure-reason strings and their classification consolidated into
  `src/pipeline/failure-reasons.ts`. Three places write these strings and the
  API now reads them; scattering `startsWith('not an invoice')` around is how
  the categories drift apart the first time a reason is reworded.
- `CategoryDetailList` replaced by `BreakdownDetailList`, which renders either
  nesting rather than being duplicated for the second one.

### Changed

- **Category marks are the Lucide icon, tinted, not a bare colour rail.** The
  rail carried colour and nothing else, and with twenty-one categories ramped
  inside four parent groups neighbouring shades are close enough that it had
  stopped distinguishing them. The icon is what a reader recognises before the
  text; the tint still carries the grouping.
- **Renaming a vendor no longer changes its logo.** Both logo tiers resolved
  from the vendor *name* — the build-time brand mark by lookup, the favicon
  through `logoDomainFor` — so renaming "Google Cloud Platform" to "GCP" missed
  the icon set's key and dropped the mark. A rename is a labelling decision and
  says nothing about whose mark belongs on the row, so both now resolve from the
  discovered name, which `/api/meta` reports for renamed vendors.
- The month stepper is hidden on `/reports`, which selects its own fiscal
  quarter or year. Two period controls in one header is worse than one: the
  chrome's month would keep changing figures the page is not reporting on, and
  no reading of the screen makes both of them right.

### Fixed

- The category picker is portalled and positioned against the viewport. Rendered
  in place it was fine in the invoice drawer and would have been clipped on the
  Breakdown page, whose accordion body is `overflow-hidden` for its height
  animation — an absolutely-positioned popover inside a clipped box is clipped
  with it.
- **`GROUP BY` over a correlated subquery.** Both the category rule and the
  vendor-name overlay are correlated subqueries, and grouping by one makes
  Postgres reject the query — "subquery uses ungrouped column". It broke
  `/api/invoices` outright. `dominantCategories` now resolves in a derived table
  and aggregates outside it; adding the referenced columns to the `GROUP BY`
  instead would have split the sum per line-item description, which is not what
  a dominant category means.
- The puff spinner flickered its border once per cycle: animating opacity
  `0.75 → 0` on repeat restarts by snapping back to `0.75`, painting one frame
  of a fully opaque ring at its smallest. Now `[0, 0.75, 0]`, so start and end
  match and there is nothing to snap.
- A duplicate carries the invoice id of the row the org already had, so two
  files in one batch can point at the same invoice. The outcome poll for the
  original was overwriting the twin's already-final "duplicate" with "added",
  and a batch that correctly wrote one row reported two invoices added.
- Uploaded logos served as **zero bytes**. A Node Buffer written into Mongo does
  not come back as one — the driver returns a BSON `Binary` whose bytes live
  under `.buffer`, and `Buffer.from()` on the wrapper does not throw, it yields
  an empty buffer. The failure was silent all the way to a broken-image icon,
  and an empty payload still base64-encodes into a well-formed
  `data:image/svg+xml;base64,` URL, so the test asserting on that prefix passed
  while nothing rendered. The assertion now compares decoded bytes against the
  file that was uploaded.
- **A genuine $0.00 invoice is no longer rejected as "not an invoice"**, when it
  was uploaded. The zero-total rule exists for mail the pipeline selected for
  itself — "your invoice is available" with the figure behind a link — and that
  reasoning does not transfer to a file somebody deliberately dragged into the
  upload box. Microsoft issues real invoices totalling 0.00 for a month with no
  usage, and one was being failed with "no amount on the document" while the
  document stated its total four times. The test is now "zero *and* we chose it
  ourselves"; a zero-value upload lands `parsed` and contributes nothing to
  spend, which is what it should contribute. Mail is unaffected — verified in
  both directions.

### Removed

- **The Calendar tab**, and everything that existed only to serve it: the page,
  `InvoiceCalendar`, the `/api/calendar` endpoint, `src/queries/projections.ts`
  (its anticipated-invoice projection had no other consumer), the `useCalendar`
  hook, the month prefetch for it, and its response types.

  `projectInvoices` is worth knowing about if projections are ever wanted again —
  it inferred a vendor's billing cadence from history — and it is in git history
  rather than gone.

- The two duplicate invoice pairs that predated de-duplication. `#3241` and
  `#3242` deleted, keeping the older `#3228` and `#3233`; Microsoft's parsed
  total drops 7285.26 → 6136.99, exactly the 1148.27 the redundant rows were
  adding. No duplicate groups and no orphaned upload email rows remain.
- Two failed uploads (`#3227`, `#3231`), both genuine $0.00 documents caught by
  the rule fixed above. Deleted before that fix landed, along with their stored
  PDFs. `#3231` can be re-uploaded from `~/Downloads/invoice_pdfs`; `#3227`'s
  source file was not in that folder, so that PDF is gone.
