# HANDOFF.md

## Current Task
Resolved three data-integrity issues in the invoice parser causing phantom spend to be counted: inbound money (payouts), trial grants, and credits with inverted signs.

## Key Decisions Made

**Inbound Money (Payouts & Customer Payments)**
- Added `INBOUND_MONEY` rule to reject subjects matching `\bpayouts?\b` and `\bpayment of\b.*\bfrom\b`
- Narrow by design: "payment received" must keep working for Google Cloud receipts (only record of actual spend)
- Retired four existing `parsed` rows (three Stripe payouts, one customer payment) with `prune-non-invoices`

**Trial Grants (Google Cloud $300 Credit)**
- Identified as the single largest data distortion: $300 granted credit on account-confirmation email, not a bill
- Added `SIGNUP_NOTICE` rule rejecting subjects with `\baccount confirmation\b` and `\bwelcome to\b`
- Retired one row, marked failed rather than deleted (preserves auditability; prevents re-ingestion on next sync)

**Credits on Real Invoices**
- Railway applied balance and plan proration are genuine reductions but PDF-to-text drops minus signs
- Updated extraction prompt with explicit instruction and worked example to decide by meaning, not sign
- OpenRouter prepaid top-ups stay positive (money actually left the account)

**LLM Escalation Retry Bug**
- Retry path existed but never fired—every call was failing before the model saw it
- Root cause: `zodToJsonSchema` hoists reused `isoDate` into `$defs` with `$ref`s; escalation model rejected the schema
- Moved schema conversion into `completeJson` with `$refStrategy: 'none'` to inline refs and completed `required`/`additionalProperties`
- Railway receipt #2686-3644 now extracts cleanly; zero reconciliation failures remain

**SQL Precedence Trap in prune-non-invoices**
- Unparenthesized `a OR b` in Kysely raw fragment read as `(... AND org_id AND status AND a) OR b` — second branch escaped both filters (cross-tenant security bug)
- Added parentheses and explanatory comment

## Files Changed
- `src/llm/{extract,classify,categorize,openrouter}.ts` — Schema conversion moved to boundary
- `src/pipeline/heuristics.ts` — Added `SIGNUP_NOTICE` constant and check
- `src/cli/commands/prune-non-invoices.ts` — Added `SIGNUP_NOTICE_SQL` pattern with OR logic and parentheses
- `src/cli/index.ts` — No functional change; lint pass
- `test/unit/non-invoice-heuristics.test.ts` — Added test suite for signup notices
- `TODO.md` — Marked three items complete; added context on Google Cloud login-wall invoices and Google Workspace missing entirely from mailbox

## Next Steps
None—all items resolved and verified:
- Typecheck: pass
- Lint: pass  
- Tests: 133/133 pass
- Prod reconciliation failures: 81→82 failed (one newly marked), 195→194 parsed
- Database: $300 GCP credit removed from spend totals

## Open Questions
None. The remaining TODO items are architectural (filtering, departments/teams, Tier 2 vendor API connections) or environmental (legal review, domain ownership) and fall outside scope.
