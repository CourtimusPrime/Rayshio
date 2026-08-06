# TODO

Outstanding work, derived from `SPEC.md` and from problems found while
operating the system. Checked against the live schema and the codebase on
6 Aug 2026 — everything below is genuinely unbuilt, not merely undocumented.

Anything in `SPEC.md`'s "Out of scope for MVP" is excluded unless the spec
itself flags it as a real near-term need.

---

## From SPEC.md

### Phase 3 — filtering / customization

Let users exclude specific invoices, services, or whole accounts from what is
surfaced. The spec is explicit that filtering, not deduplication, is also the
mechanism for cross-account separation.

- [ ] Exclusion model — per-invoice, per-service, per-account
- [ ] Apply it to every aggregate: Dashboard, Breakdown, Reports, Calendar
- [ ] Apply it to the MCP tools, or an agent sees what the dashboard hides

### Service categories

A second taxonomy — *what the vendor is* (Neon is a database, Canva a design
tool), distinct from `invoice_line_items.category`, which is *what was bought*.
`server.service` currently has only `id`, `name`, `sender_address`.

- [ ] `server.service.category`, from the list in `SPEC.md`
- [ ] Assignment, with user override (never silently LLM-assigned)
- [ ] Grouping/filtering by it in the UI

### Departments & teams

Nothing exists yet: no team table, no mode flag on `client.org`.

- [ ] `client.org` department mode — Single (default) or Multi
- [ ] Teams table, and exactly one team per service (the constraint that makes
      team totals sum to the org total without allocation maths)
- [ ] "Unassigned" as a first-class bucket, surfaced prominently — new services
      land there and must never go quietly uncounted
- [ ] Global team filter scoping Dashboard, Breakdown, Invoices, Calendar, Reports
- [ ] Teams tab, visible only in Multi-Department mode
- [ ] Team awareness in the MCP tools
- [ ] Mode switching is non-destructive: turning Multi off retains teams and
      assignments; only deleting a team reassigns its services to Unassigned

Deliberately not in this cut, per the spec: per-team budgets, and splitting one
service across teams by percentage.

### Settings tab

Org-level configuration. Fiscal year lives inline on Reports today and budget
on the Dashboard; the spec says both belong here once the surface exists.

- [ ] Default display currency (no column for it yet — `budget_currency` is the
      budget's denomination, not a display default)
- [ ] Fiscal year start (move from Reports)
- [ ] Monthly budget (move from Dashboard)
- [ ] Department mode
- [ ] Service category list

### Sidebar icon animation

- [ ] Per `SPEC.md`'s "Sidebar icon animation" section

### Post-MVP, but flagged as real needs

- [ ] Vendor API/OAuth connections (Tier 2) for vendors whose PDFs carry no
      itemization — Railway bills lump sums, so its Breakdown data is empty.
      Needs `client.vendor_connection`. `invoice_line_items.source` already
      exists (migration 0003), so the schema half is done.
- [ ] Outlook / Microsoft 365 ingestion — "planned next, not MVP"

---

## Found in operation

Not in `SPEC.md`; each was observed against production data.

### Data correctness

- [ ] **Google Cloud spend is payment receipts, not usage.** Its ~$1,121 comes
      from "Payment received" emails; no GCP *usage* invoice is ingested at all.
      Today that is the only record of the spend, so removing it would understate
      GCP — but if the real invoices are found and connected, it becomes
      double-counting. Check whether they arrive at an address not yet connected.
      Confirmed while auditing: what Google *does* email is a monthly Statement
      PDF that says "This is not a bill" with every figure $0.00, so there is
      nothing to recover from the mailbox. This needs the Tier 2 vendor
      connection below, not better parsing.
- [ ] **Four vendors have no recoverable invoice in the mailbox.** Google
      Workspace (0 parsed / 18), Edge Imaging (0/4), and two Cloudflare and
      several Google Cloud mails are all "your invoice is available" notices
      with the amount behind a login link. None has a stored PDF, so no
      extractor change reaches them — same Tier 2 dependency. Google Workspace
      is the one that matters: it is a paid subscription contributing zero.
- [x] **Credits are recorded as positive spend.** Split into two cases once the
      documents were read. The $300 GCP "Credit" was a *trial grant* on an
      account-confirmation email — not a bill at all, now rejected by
      `SIGNUP_NOTICE` and retired from the table. Credits *on* a real invoice
      (Railway's applied balance and proration) are now extracted negative; the
      extraction prompt carries a worked example, since PDF-to-text drops the
      minus sign. Prepaid top-ups like "OpenRouter Credits" stay positive —
      that money did leave the account.
- [x] **Inbound money counted as spend.** Three Stripe payouts and one customer
      payment (AED 101.39 + USD 10.00) were `parsed` as Volero AI cost.
      Rejected at ingest by `INBOUND_MONEY`, and the existing rows retired.
      Narrow on purpose: "payment received" is a vendor confirming *you* paid,
      and for Google Cloud those receipts are the only record of that spend.
- [ ] **22 parsed invoices have no `invoice_date`** and fall back to the email
      delivery date for every date-based view. **16 have no `invoice_number`.**
- [x] One invoice fails reconciliation: Railway receipt #2686-3644, line items
      summing to −12 against a stated total of 992. Root cause was not the
      invoice — the escalation retry that exists to rescue exactly this case had
      never once run. `zodToJsonSchema` hoists the reused `isoDate` into `$defs`
      and emits `$ref`s, which the escalation model rejects with a 400, and
      `extract-invoice.ts` swallows that in a bare `catch`. Conversion now
      happens inside `completeJson` with `$refStrategy: 'none'` plus a
      strict-mode pass. The invoice re-extracted cleanly; zero reconciliation
      failures remain.

### Reliability

- [x] **No retry path for a stranded invoice.** `POST /api/invoices/:id/retry`
      and `pnpm cli retry-stuck` (the sweep) both re-enqueue with a fresh job id.
- [ ] Uploading against a server whose Redis has no worker still strands the row
      silently; the UI reports "queued for parsing" and waits forever. The retry
      path recovers it after the fact, but nothing surfaces the stall.

### Auth follow-through

The plan in `dev/AUTH-AND-LANDING.md` sequenced these deliberately.

- [x] **R2** — deleted `src/api/session.ts`, `DEFAULT_ORG_ID`, the
      `DASHBOARD_PASSWORD`/`DASHBOARD_SESSION_SECRET` vars, and the legacy-cookie
      branch in `resolveAuthContext`. The three env vars are still set on
      Railway and are now ignored; remove them there at leisure.
- [ ] **R3** — delete the `MCP_API_KEY` env fallback in `src/mcp/auth.ts` once
      every client has adopted a database-backed key.
- [ ] Invitation email delivery — there is no mailer, so `pnpm cli invite`
      creates the row and the link must be passed along by hand.

### Launch blockers

- [ ] **Privacy and Terms need legal review.** The routes exist and the prose is
      factually accurate, but it has not been reviewed by anyone qualified.
      `gmail.readonly` is a Google *restricted* scope, so verification requires
      both pages on the app's own domain.
- [ ] **A domain you own.** Google's restricted-scope verification is unlikely to
      accept `invoice-mcp-production-9bd0.up.railway.app`. `VITE_PUBLIC_ORIGIN`
      and `PUBLIC_APP_URL` are the only two places to change.
- [ ] The OAuth consent screen is unpublished, so sign-in is restricted to the
      organisation regardless of `ALLOWED_SIGNUP_EMAILS`.
