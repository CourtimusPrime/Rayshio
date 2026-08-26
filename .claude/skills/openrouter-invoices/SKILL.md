---
name: openrouter-invoices
description: Download OpenRouter invoice PDFs in bulk from the Stripe billing portal using the Claude-in-Chrome extension. Use when asked to fetch, download, back up, or reconcile OpenRouter (or any Stripe-hosted customer portal) invoices, receipts, or billing history into local PDFs. Encodes the traps — the required ?s=ap token, Chrome's block on scripted downloads, and the presigned-S3 fallback.
user-invocable: true
argument-hint: "[all | last N | since YYYY-MM-DD]"
allowed-tools:
  - Bash(bash .claude/skills/openrouter-invoices/scripts/*)
---

# OpenRouter invoice download

OpenRouter bills through Stripe. Invoice PDFs are not on openrouter.ai at all —
they live in a Stripe customer-portal session, one hosted page per invoice, and
each PDF is minted on demand as a presigned S3 object with a 10-minute expiry.

This has to run through **Claude-in-Chrome**, not Playwright: the portal is
reached through the user's live OpenRouter session, and the session URL is
short-lived. Playwright would mean scripting a Google login for nothing.

## The route

1. `https://openrouter.ai/settings/credits`
2. "Recent Transactions" → **History** link (opens a new tab)
3. `https://billing.stripe.com/p/session?secret=live_...` — invoice history list
4. Click a row → `https://invoice.stripe.com/i/acct_.../live_...?s=ap`
5. **Download invoice** → PDF lands in `~/Downloads/Invoice-<PREFIX>-NNNN.pdf`

## Expanding the full list

The history shows 3 rows and grows by 10 per **View more** click. A full account
history is easily 150+ invoices, so budget ~16 clicks.

- `find` returns a stable `ref` for the button, but **the first click after a
  fresh page load silently does nothing** — the portal is still running its
  mount transition. Screenshot, click the button by coordinate once, then switch
  to `ref` clicks for the rest.
- Verify progress with
  `document.querySelectorAll('a[href*="invoice.stripe.com"]').length`, and stop
  when `/View more/.test(document.body.innerText)` is false.
- Do not click anywhere else on that page. "Return to OpenRouter, Inc" sits in
  the left rail and navigating away discards the expanded list *and* every
  variable stashed on `window`.

## Getting the per-invoice URLs

Collect them in page context and keep them there:

```js
window.__p = [...document.querySelectorAll('a[href*="invoice.stripe.com"]')]
  .map(a => new URL(a.href).pathname);
window.__t = window.__p.map(p => p.replace('/i/acct_<ACCT>/', ''));
```

Two constraints that look like bugs:

- **`?s=ap` is mandatory.** The `javascript_tool` result filter redacts query
  strings (`[BLOCKED: Cookie/query string data]`), so only the pathname is
  readable. The bare path returns "Invoice not found" — append `?s=ap` and it
  loads. That is the whole query string.
- Pull tokens out in slices of 8 (`window.__t.slice(n, n+8)`) as you go rather
  than dumping 160 of them into context at once.

## Downloading — what works and what does not

**Only a real click on "Download invoice" mints a PDF.** Everything cheaper has
been tried and fails:

| Approach | Result |
|---|---|
| `iframe.src = <path>/pdf` | First one downloads, then Chrome blocks the rest. Cross-origin iframe downloads without user activation are hard-blocked; the Automatic Downloads site permission does **not** lift it. |
| `navigate` straight to `<path>/pdf?s=ap` | No download. Nothing lands. |
| `curl <path>/pdf?s=ap` | Returns the SPA shell HTML, not a PDF — even with a browser UA and a cookie jar. The `/pdf` route is resolved client-side. |
| `computer` click on the button | Works. This is the only path. |

Batching rules learned the hard way:

- **Dwell ~4s after each click before navigating on.** Navigation cancels the
  in-flight download; at 1s dwell only the final invoice of a batch survives.
- **Cap batches at ~8 invoices** (`navigate, wait 2, click, wait 4`). Twelve
  exceeds the `browser_batch` timeout and the whole call fails mid-run.
- **The button moves when the window resizes.** At a 1284×952 viewport it is at
  `(500, 670)`; at 1217×980 it is at `(474, 637)`. A stale coordinate misses
  silently — clicks land on card whitespace and nothing downloads. Screenshot
  and re-read the position whenever a batch produces zero files, or spend the
  extra call on `find` → click by `ref`, which is layout-proof.
- Re-downloading an invoice yields `Invoice-XXXX-NNNN (1).pdf`. Harmless; the
  verify script cleans it up.

## Fallback: presigned S3 + curl

After ~100 downloads in one session Chrome starts reporting the S3 GET as **503**
and no file lands, even though the click registered. The click still mints a
valid URL — capture and fetch it outside the browser:

1. `read_network_requests` with `urlPattern: "stripe-upload-api"` after the
   clicks in a batch. Each entry is a presigned
   `stripe-upload-api.s3.us-west-1.amazonaws.com/...` URL carrying
   `response-content-disposition` with the real filename.
2. Pipe those URLs to the fetch script below. curl returns 200 and real PDF
   bytes for the same URL Chrome reported as 503.

URLs expire **600 seconds** after minting, so fetch each batch before starting
the next.

```bash
bash .claude/skills/openrouter-invoices/scripts/fetch-signed-urls.sh urls.txt ~/Downloads
```

## Verifying

```bash
bash .claude/skills/openrouter-invoices/scripts/verify-invoices.sh ~/Downloads
```

It removes ` (n)` duplicate copies, counts distinct invoices, and reports gaps in
the `PREFIX-NNNN` sequence. A gap is an invoice whose click missed or whose
download was cancelled — re-run those indices rather than the whole list.

Cross-check the final count against the row count from the expanded history
(`a[href*="invoice.stripe.com"]`), not against what the UI showed before
expanding.

## Safety

Downloading is a permissioned action. The user asking for "all my OpenRouter
invoices" authorizes the run; report the count found before starting a
150-invoice sweep so they can scope it down. Never touch **Download receipt** —
it is a different document sitting one button to the right.
