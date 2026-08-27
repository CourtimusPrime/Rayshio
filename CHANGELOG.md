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

## 2026-08-27

### Changed

- **The Accountant tab can send one email per invoice instead of one zip.** A Bulk send / One-by-one toggle beside the send button, stored per workspace (`migrations/0017_accountant_send_mode.sql`).

  The mode exists because a filing inbox is not a person. Hubdoc, Dext and Xero read one attachment per message and cannot open a zip at all, so a bulk send to one of them files as a single unreadable document or as nothing. A human accountant, conversely, would rather have one email a month than three hundred. It is stored rather than chosen per send because it is a property of the recipient — the answer never changes between sends.

  **One-by-one records each invoice the moment its own message is accepted**, not all of them at the end. That is the real difference from bulk, and it is what makes a partial run safe: the twentieth send can fail after nineteen have arrived, and those nineteen must stay delivered or the accountant receives them again on the retry. A failure stops the run and keeps what went; the remainder is simply still outstanding. `startDelivery` / `recordDeliveredItem` / `finishDelivery` replace the single-transaction `recordDelivery` for this path, and the run's totals describe delivered mail rather than intended mail.

  Twenty-five invoices per press, against bulk's 150. The limit is Gmail: `messages.send` costs 100 of a 250-per-second per-user quota, so sustained sending is about two messages a second, and the sends are spaced 500 ms apart rather than fired back to back — without that a long run starts returning 429s partway through. Twenty-five is roughly fifteen seconds, which keeps the request clear of a gateway timeout.

  The toggle wraps onto its own row below `md`: at 390px it and the send button did not fit on one line, and letting them shrink pushed the card past the viewport by up to 14px. Caught by the render checks, which assert nothing overflows horizontally at any width.

- **Tables show a Type column instead of Status.** Receipt (yellow, `ReceiptText`), Invoice (green, `Banknote`) and Email (red, `Mail`), on the Invoices page and the dashboard's recent list — both render through `InvoiceTable`, so this is one change in one place.

  Status answered a question about our own ingestion — `parsed`, `pending`, `failed` — which matters when something breaks and is noise the rest of the time, since almost every row says `parsed`. Type answers what a person reconciling spend actually asks: is there a document behind this figure, and is it a bill or proof of payment. The status filter above the table is untouched, and the drawer still shows status beside its failure reason, where it earns its place.

  **Derived, not stored** (`src/queries/document-type.ts`). Nothing in the extraction schema records a document type, so a column would be null for every existing row and could only be filled by re-running extraction over the whole table. The rule reads the two signals already present: no PDF is `email`, a subject announcing a receipt is `receipt`, anything else with a PDF is `invoice` — which covers manual uploads, whose subject is a filename and carries no signal at all. On this workspace's 336 invoices that splits 182 email, 108 invoice, 46 receipt. It can be replaced by a real extracted field later without changing what the API returns.

  `\b` treats `@` as a word boundary, so a plain `\breceipts?\b` matched the address in "Invoice from receipts@vendor.com" and filed an ordinary invoice as a receipt. A test caught it; the pattern now carries a `(?!@)` lookahead.

  **`BanknoteCheck` does not exist in Lucide** — not in the installed 0.577, not in 1.34 either — so Invoice uses `Banknote`. Adding it also needed a green: `success` (soft/text/solid) now sits beside `warn` and `danger` in `index.css` and `tailwind.config.js`, which means **the Vite dev server must be restarted** or the new utilities silently resolve to nothing. Contrast measured in the browser: 4.8:1 light, 11.4:1 dark, all three badges clearing AA in both themes.

- **The Accountant tab sends through the signed-in Gmail account; Resend is gone.** Invoices now leave from the user's own mailbox — the message lands in their Sent folder, replies come back to them, and the accountant sees an address they already correspond with rather than a machine sender on a domain they have never heard of. `RESEND_API_KEY`, `MAIL_FROM` and `src/email/` are deleted; nothing else in the product needed a verified sending domain or a second vendor holding a copy of the invoices.

  **This adds a restricted scope.** `gmail.send` sits alongside `gmail.readonly` on the consent screen, so it has to be declared in the Google verification submission — the dependency the milestone already calls out as the launch gate. `gmail.send`, not `gmail.compose`: compose can also create and modify drafts, which this app never does, and a restricted scope has to be justified on exactly what it is used for.

  **Every mailbox connected before this must reconnect once.** `migrations/0016_account_scopes.sql` records what Google actually granted — not what was asked for, since the consent screen lets a user untick permissions — and the tab checks it before offering to send. Null means "granted before we recorded this", which is every existing grant, and all of those hold readonly alone. Without that column the only way to find out is a 403 from Google *after* the zip has been built.

  **An "Enable Gmail" button now starts the consent flow from the tab itself** (`GET /api/gmail/consent-url`). Until now the only way to connect a mailbox was `pnpm cli auth`, which is fine for the operator who wrote it and useless to everyone else — and it is precisely the fix for the two states the tab reports most often. The URL carries a signed state binding the org, minted server-side, so a client can never choose which workspace a grant lands in. It opens in a new tab, because the callback is a bare server-rendered page ending "you can close this tab"; navigating the dashboard there would strand the user outside the app. Returning marks the tab's data stale, so the warning clears itself rather than persisting until a reload.

  The three ways sending can be unavailable — no mailbox, a revoked one, one holding read-only — are separate states in the API (`blocker`) and get separate sentences on screen, because the fix differs each time and none of them is guessable from "sending is unavailable".

  A batch of invoice PDFs is several megabytes, which does not fit in the JSON body of `messages.send`, so anything over 4 MB goes through the media-upload endpoint instead. Gmail's ceiling is 35 MB counted *after* base64 inflates it by a third, so the attachment budget stays at 25 MB — tighter than Resend's 40 MB, and the per-send invoice cap is unchanged.

- **Sessions persist for 30 days with a sliding window**, up from Better Auth's seven-day default. A dashboard someone opens when an invoice arrives — a few times a month — was signing people out for no reason they could connect to anything they did. `updateAge` refreshes the expiry at most once a day, so the renewal costs one write per day rather than one per request, and `cookieCache` carries a short signed copy of the session so most requests skip the database lookup entirely. Five minutes of staleness is the price: a session revoked server-side keeps working for up to that long.

  The cookie stays `httpOnly`. Moving tokens to `localStorage` was considered and rejected: it would make them readable by any script on the origin, so one XSS anywhere — including inside a dependency — becomes account takeover, and lengthening the session multiplies the value of exactly that theft.

- **Every sidebar icon now plays a one-shot animation on hover.** Ported from lucide-animated.com's shadcn registry: `layout-grid` (Dashboard), `chart-pie` (Breakdown), `receipt-text` (Invoices), `file-chart-line` (Reports), `hand-coins` (Accountant), `terminal` (MCP) and `settings`. Dashboard, Invoices and Reports also changed glyph — `LayoutGrid`, `ReceiptText` and `FileChartLine` respectively.

  **Ported by hand rather than via `pnpm dlx shadcn@latest add`.** Those files import `motion/react` and `@/lib/utils`, and `web/` has neither a `components.json` nor a `cn` helper. More to the point, `motion` *is* `framer-motion` under a newer name: installing it would put two copies of the same library in the bundle, with two `MotionConfig` contexts that cannot see each other — including the one `useMotionPrefs` reads for reduced motion.

  Three of the registry animations loop or hold their end state and rely on a mouse-leave to reset, which the rail never sends: `terminal` repeats forever, `settings` stops at 180°, and `chart-pie` leaves the slice pulled out. Each is bounded here instead — two blinks, a full 360° turn, out-and-back — so a single hover is self-cleaning and no nav item is left mid-animation.

  **The receipt icon's staggered container did not survive the port.** The registry drives three lines from a parent `<motion.g>` whose variants hold only a `transition`; under framer-motion 11 that propagates nothing, and the icon sat inert — no `strokeDasharray` written at all, confirmed in a browser. Each line now carries its own keyframes and delay.

- **The "Upload invoices" button's arrow lifts on hover** (`upload` from the same registry), under the same rules as the rail: one lift that returns to rest, skipped under reduced motion, and not replayed by the click that opens the file dialog.

- **Icons play on hover and on keyboard focus, never on click.** `onFocus` alone fired on every navigation, because clicking a link focuses it — so the icon replayed just as the page changed, competing with the route transition. The handler now checks `:focus-visible`, which is the browser's own answer to "did this focus come from the keyboard": false for a pointer click, true for Tab.

  Under `prefers-reduced-motion` every one of these is skipped outright rather than shortened. Each icon's resting state is also where its animation ends, so there is nothing to settle.

### Fixed

- **Chart tooltip values were black in dark mode**, on a near-black panel — measured at 1.05:1 contrast, i.e. invisible. Recharts styles each tooltip row *inline* as `color: entry.color || '#000'`, and a `<Cell>` fill never reaches the tooltip payload, so every chart using per-bar colours hit the `#000` fallback. `contentStyle` cannot fix it: the row's own inline colour wins. The tooltip *label* was always correct, which is why only the numbers looked wrong.

  A `tooltipItem` token now sits beside `tooltip` in the chart palette (`web/src/state/theme.tsx`) and is passed as `itemStyle` by all three bar charts. Verified by reading the computed colours out of the browser in both themes rather than by eye: 13.9:1 dark, 14.6:1 light.

### Removed

- **The search field in the sidebar rail.** The Invoices page carries its own search, which is where results land anyway; the rail's copy was a second entry point to the same place, and it was hidden below `md` regardless.

---

## 2026-08-26

### Added

- **Accountant tab — send every outstanding invoice to your accountant in one click.** New sidebar entry (Lucide `Landmark`, `/accountant`), an address to send to, and one button that zips everything that address has never received, emails it with a covering note, and records what went out.

  **The tab has no invoice picker, deliberately.** `billing.accountant_delivery_item` records which invoice went to which address, with a unique index on `(invoice_id, recipient)`, so "outstanding" is derived rather than chosen. A checkbox list would exist only for the user to re-derive an answer the app already holds, and the cost of getting it wrong is asymmetric: an invoice deselected by accident is one nobody claims for.

  **Tracking is per recipient, not per org.** Pointing the workspace at a new accountant makes every invoice outstanding again *for that address*, which is what someone changing firms wants, and leaves the previous address's history intact — so setting an old address back does not resend it everything. The copy on the tab says this, because otherwise the count jumping from 0 to 300 reads as a bug.

  **The ledger is written after the provider accepts the message, never before.** A failed send leaves every invoice outstanding, so pressing the button again is a retry rather than a duplicate. The reverse order would trade "sent twice" for "silently never sent", and nobody notices an invoice that quietly stopped being outstanding. Failed attempts are still recorded, with the provider's reason, because an unchanged count and no explanation is indistinguishable from a dead button.

  Only `parsed` invoices are eligible: a pending or failed row has no trustworthy total and often no PDF, and an accountant cannot tell a half-extracted invoice from a real one. It stays outstanding and goes out once the pipeline finishes with it. Invoices billed in the email body have no PDF to attach — they are counted, listed in the covering note with their figures, and marked delivered, or the outstanding count could never reach zero. Zero-charge rows follow the org's existing `zero_charge_mode`, so the email matches the dashboard; credit notes are always included.

  Two ceilings, both deferring rather than dropping: 25 MB of attachments (Resend's limit is 40 MB of *base64*, a third larger than the bytes we measure) and 150 invoices per send. The second exists because 25 MB is roughly eight hundred PDFs, and pulling that many blobs out of GridFS inside one HTTP request is how a send dies to a proxy timeout with the mail already gone and the ledger not yet written. Overflow is taken oldest-first so a backlog drains in date order over successive clicks.

  New: `migrations/0015_accountant_delivery.sql`, `src/accountant/`, `src/email/send.ts`, `src/queries/accountant.ts`, `web/src/pages/Accountant.tsx`, and `GET/PUT /api/accountant` plus `POST /api/accountant/send`.

- **`RESEND_API_KEY` and `MAIL_FROM`** (both optional). Outbound email over Resend's HTTP API — a `fetch` call rather than the SDK, since the whole surface used is one POST. Optional so an instance without a mail provider boots and serves every other page normally; the Accountant tab reports itself unconfigured instead. `MAIL_FROM` must be on a domain verified with the provider, which config validation cannot check — that is the one failure that surfaces at send time rather than at boot.

- **`openrouter-invoices` skill (`.claude/skills/openrouter-invoices/`) and `dev/openrouter.md`.** OpenRouter bills through Stripe, so its invoice PDFs are not on openrouter.ai at all — each one is a separate Stripe-hosted page that mints the PDF as a presigned S3 object with a 600-second expiry. Working that out cost most of a session, and none of it is recoverable from the code.

  What the skill records is the set of things that look like bugs and are not. The hosted invoice path **requires `?s=ap`**; without it Stripe answers "Invoice not found", and the browser tool redacts query strings from its output, so only the path is readable and the token has to be re-appended by hand. Scripted downloads do not work at all: a cross-origin `iframe` gets exactly one file before Chrome hard-blocks the rest, and the Automatic Downloads site permission does not lift that block — only a real click on **Download invoice** mints a file. Navigating to the next invoice sooner than ~4s after the click cancels the download in flight, so a fast batch silently keeps only its last invoice, and the button's coordinates move when the window resizes, which fails the same silent way.

  Past roughly a hundred downloads in one session Chrome starts reporting the S3 GET as 503 and drops the file even though the click landed. The click still produces a valid presigned URL, so the fallback is to capture it from the network log and `curl` it — the same URL returns 200 with real PDF bytes. `scripts/fetch-signed-urls.sh` does that fetch; `scripts/verify-invoices.sh` removes Chrome's ` (n)` duplicate copies and reports gaps in the `PREFIX-NNNN` run, since a gap is precisely an invoice whose click missed.

- **`communications` category, marked with Lucide's `Megaphone`.** Messaging spend had nowhere honest to sit: an email-sending or SMS vendor landed in `subscriptions`, which is meant for a flat plan whose category cannot otherwise be determined. That put Mailchimp and Twilio next to unrelated per-seat licences and made "what do we pay to reach customers" unanswerable from the dashboard.

  The taxonomy lives in four places that cannot import from each other — `src/categories.ts`, `web/src/types.ts`, the LLM enum, and a database CHECK constraint — so this touches all four plus the explicit Lucide map in `CategoryIcon.tsx`. `migrations/0014_communications_category.sql` widens the constraint; without it the classifier would emit a value every insert then rejected, which reads as a pipeline failure with no visible connection to a prompt edit.

  The prompt gets an explicit disambiguation rule, because `subscriptions` and `communications` genuinely overlap: a Mailchimp plan is `communications`, since the line names what is being bought. **Existing rows are not backfilled** — re-filing them is a `client.category_rule`, which is retroactive by design and reversible.

### Notes

- **Resend sending is configured and proven end to end.** `RESEND_API_KEY` and `MAIL_FROM` (on `nczgroup.com`) are set, and the ledger records three real deliveries to the bookkeeping inbox — 150 + 150 + 31 — which is the full 331-invoice backlog drained in date order across three clicks, exactly as the per-send ceiling intends. A separate verification send of 150 invoices (4.7 MB zip, 8 vendors, Apr 2024 → Mar 2026) was accepted by Resend and then removed from the ledger so it could not mask anything.

  The API key is send-only, so `GET /domains` answers 401 — the domain cannot be confirmed from a script, only by a send succeeding, which it does.

  **A send takes ~45 seconds inside the HTTP request.** 150 blobs out of GridFS, zipped, then uploaded to Resend, all while the user waits on a spinner. It works, and it is the weakest part of the feature: it is close enough to proxy and gateway timeouts that a slower day would fail a send that had already gone out, leaving the ledger unwritten and 150 invoices arriving twice on the retry. Moving the send to the BullMQ worker — enqueue, report progress like uploads do — is the fix, and is not done.

  78 of those 150 invoices had no PDF: they were billed in the email body, so their figures travel in the covering note instead.

- **A backlog larger than 150 needs more than one click.** This workspace's 331 took three, which is by design and stated on the tab after each send — but it reads as a bug the first time you meet it, and nothing tells you up front that one press will not finish the job.

### Fixed

- **`categories.test.ts` no longer hardcodes one migration filename.** It read `0012_category_taxonomy_v3.sql` directly, so the next migration to widen the taxonomy failed the test for the wrong reason — the constraint and the code agreed, but the assertion was checking a superseded file. It now scans `migrations/` for whichever migration defines `invoice_line_items_category_check` last, and slices to the Up section so the narrower CHECK restored by each Down section is never matched instead.
- Dropped a dead `CATEGORY_META` import from `src/llm/category-prompt.ts`.

### Changed

- **`src/db/types.ts` regenerated** (`pnpm codegen`) now that `0015` is applied, and the temporary `db.withTables(...)` shim in `src/queries/accountant.ts` deleted in favour of the generated types. The shim existed only because codegen needs a database that already has the tables, which is a chicken-and-egg every new migration hits: write the queries before the migration can be applied anywhere, or apply first and lose typechecking in between.

- **One origin variable replaces three URLs, and one Google OAuth client replaces two.** The environment shrank from 16 variables to 11. `GOOGLE_REDIRECT_URI`, `PUBLIC_MCP_URL` and `PUBLIC_APP_URL` all described the same deployment and had to be kept consistent by hand; nothing enforced that, so moving host meant remembering three edits and forgetting one failed a long way from its cause — an OAuth callback pointing at the previous host, or an MCP page telling users to connect to localhost. They are now derived from `VITE_PUBLIC_ORIGIN` (`publicOrigin`, `googleRedirectUri`, `publicMcpUrl` in `src/config.ts`).

  `VITE_PUBLIC_ORIGIN` was chosen over inventing a new name because the SPA already had it: `web/vite.config.ts` bakes it into index.html, robots.txt and sitemap.xml at build time. One origin was being configured twice under two names and could disagree with itself.

- **`AUTH_GOOGLE_CLIENT_ID`/`_SECRET` deleted; sign-in now uses `GOOGLE_CLIENT_ID`/`_SECRET`.** The split existed because the Gmail client carries `gmail.readonly`, a restricted scope, and sharing it was expected to show a mailbox-access consent screen for a plain login. That is not how OAuth works here — scopes are requested per authorization call, not per client — so sign-in asks for `openid email profile` and never mentions Gmail. The second client bought nothing and cost a second pair of secrets to rotate, plus a failure mode that actually happened: editing the wrong pair, leaving sign-in pointed at a deleted client and failing with `Error 401: deleted_client`.

- **`ALLOWED_SIGNUP_EMAILS` deleted.** Who may sign up is Google's decision, not ours — the OAuth client is an internal Workspace app, so Google refuses anyone outside the organisation before the callback reaches this process. The variable restated that rule in a second place where it could only ever disagree with the first, and it was set to `*` anyway, so it had been a no-op for as long as it existed. Registering still grants nothing on its own: a new user has no `client.org_member` row, so every `/api` route refuses them. The invitation hook is unchanged.

### Added

- **`GET /oauth/callback` on the app, replacing the throwaway server inside `cli auth`.** Connecting a mailbox used to run entirely in the CLI, which stood up an Express server on the port parsed out of `GOOGLE_REDIRECT_URI`. That works exactly once — on a laptop. The deployed instance could never complete the flow, because Google will not redirect to a port nothing is listening on and an operator's machine is not reachable from Google's servers. The exchange now lives in `src/gmail/connect.ts`, and `cli auth` mints the consent URL and polls for the row.

  **The route is unauthenticated by necessity** — Google follows the redirect with none of our cookies — **and it writes a `client.account` row.** Left open, anyone reaching it with their own authorization code could attach their mailbox to an arbitrary org and the ingestion pipeline would treat it as a real source. So the `state` is HMAC-signed with `BETTER_AUTH_SECRET` and carries the org id plus an expiry: only a process holding the secret can mint one, and the check is stateless, so the CLI and server need no shared store. Missing, forged and expired states are refused with one identical message, so probing the endpoint reveals nothing.

### Added (tests)

- **Test suite grown from 152 to 213 across 19 → 24 files**, covering the layers that decide the numbers on the dashboard and who may read them: FX conversion (`fx-rates`), aggregation (`converted`), the derived-URL config introduced above (`config`), MCP key auth (`mcp-auth`), key hashing (`api-keys`), the Gmail connect state signature (`connect-state`) and money formatting (`format`). `config.test.ts` had been a `1 + 1` placeholder since it was created.

- **The suite is now hermetic.** `connect-state` was importing `src/db/client.ts`, which opens a Postgres pool at module load — meaning a test run on a developer machine dialled whatever `PGSQL_DATABASE_URL` pointed at, which is a live database. It is stubbed now, and the whole suite passes with all three stores aimed at a closed port, so `pnpm test` can never write to or hang on real infrastructure.

### Notes

- **Deploying this requires setting `VITE_PUBLIC_ORIGIN` on both Railway services first.** `Invoice-MCP` and `Invoice-Worker` currently set `PUBLIC_APP_URL`, which this release stops reading. Without the new variable, Better Auth's `baseURL` falls back to `http://localhost:3000` and every production sign-in breaks. `AUTH_GOOGLE_CLIENT_ID`/`_SECRET`, `ALLOWED_SIGNUP_EMAILS`, `GOOGLE_REDIRECT_URI` and `PUBLIC_MCP_URL` can be deleted there at the same time.
- **Two redirect URIs must be registered on the single Google client**: `<origin>/api/auth/callback/google` for sign-in and `<origin>/oauth/callback` for the Gmail connect. Locally that means both the `5173` and `5273` spellings, since `just dev` falls back to the second pair of ports whenever the ssh tunnels hold the first.
- `cli auth` now needs the app running and reachable at `VITE_PUBLIC_ORIGIN` to complete. Against production nothing local is required; against a dev origin, the local server has to be up.
- **Known unresolved:** `.env` still carries `DASHBOARD_SESSION_SECRET`, which no longer appears anywhere in `src/`. Left in place rather than deleted blind — it predates Better Auth and may be referenced by something outside this repo.

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

- **The 4 affected invoices were corrected by delete-and-re-upload, not by retry.** `POST /invoices/:id/retry` refuses a `parsed` invoice with 409 `already parsed`, which is deliberate — it exists to rescue invoices stuck in a non-terminal status, and re-running extraction over a finished one is a different operation. Since all four were uploads, `DELETE /api/invoices/:id` plus a re-upload was the supported path. Worth knowing before reaching for retry to pick up an extractor improvement: it will not do that, and there is currently no endpoint that will. New ids 3259, 3260, 3261, 3262 (was 3229, 3230, 3239, 3257), all landing on the amounts predicted from their line items.
- A full sweep of every invoice id in the org found no other instance of this pattern; the 5 other hidden zero-value rows are `failed` extractions unrelated to it. Invoice 3228 was deliberately left alone — a genuine £0.00 free-trial receipt, and the case the prompt change had to preserve.

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
