import type { ParsedMessage } from '../gmail/messages.js';

const SUBJECT_STRONG =
  /\b(invoice|receipt|billing statement|payment (received|confirmation|due))\b/i;
const SUBJECT_WEAK = /\b(billing|statement|subscription|renewal|payment)\b/i;
const BODY_HINTS = /\b(invoice|amount due|total due|receipt|order total|amount paid|billed to)\b/i;
const NEGATIVE = /\b(newsletter|digest|webinar|unsubscribe preferences center|sale|% off)\b/i;
const NOREPLY_BILLING_SENDER =
  /^(invoice|invoices|billing|receipts?|payments?|statements?|no-?reply)@|@(billing|invoicing|pay)\./i;

/**
 * Money coming *in*, which is never a vendor bill.
 *
 * A Stripe payout notification and a "someone paid you" alert both carry a real
 * amount and arrive from a billing-pattern sender, so every other signal here
 * reads them as invoices — they extract cleanly and land as spend the org never
 * incurred. Four such rows were counting as cost in production: three Volero AI
 * payouts and one customer payment.
 *
 * Deliberately narrow, because the neighbouring phrase must keep working:
 * "Payment received" is a *vendor* confirming that you paid *them*, and for
 * Google Cloud those receipts are currently the only record of that spend.
 * Matching on "payout", or on "payment of <amount> from <someone>", separates
 * the two without touching it.
 */
const INBOUND_MONEY = /\bpayouts?\b|\bpayment of\b.*\bfrom\b/i;

/**
 * Signing up is not buying.
 *
 * A welcome or account-confirmation mail can carry a figure — the Google Cloud
 * trial confirmation announces $300 of trial credit — and that figure extracts
 * as cleanly as a total. It was the single largest distortion in the production
 * data: $300 of spend against an account that had not yet been charged a cent.
 *
 * Granted credit is value received, so even reading it as a credit and negating
 * it would be wrong. The document is simply not a bill, which is why this is a
 * reject rather than a sign correction.
 */
const SIGNUP_NOTICE = /\baccount confirmation\b|\bwelcome to\b/i;

export interface HeuristicResult {
  score: number;
  isCandidate: boolean;
  reasons: string[];
}

/**
 * Cheap pre-filter deciding whether an email is worth LLM classification.
 * Threshold 2 keeps: strong subject alone, PDF+anything, billing-sender+anything.
 */
export function scoreEmail(msg: {
  from: ParsedMessage['from'];
  subject: string | null;
  hasPdfAttachment: boolean;
  bodyText?: string;
}): HeuristicResult {
  let score = 0;
  const reasons: string[] = [];

  const subject = msg.subject ?? '';

  /*
   * A hard reject rather than a negative weight. Inbound money is not a weak
   * invoice, it is the opposite of one, so no combination of PDF attachment and
   * billing-pattern sender should be able to add it back up past the threshold.
   */
  if (INBOUND_MONEY.test(subject)) {
    return { score: 0, isCandidate: false, reasons: ['subject:inbound-money'] };
  }
  if (SIGNUP_NOTICE.test(subject)) {
    return { score: 0, isCandidate: false, reasons: ['subject:signup-notice'] };
  }

  if (SUBJECT_STRONG.test(subject)) {
    score += 2;
    reasons.push('subject:strong');
  } else if (SUBJECT_WEAK.test(subject)) {
    score += 1;
    reasons.push('subject:weak');
  }

  if (msg.hasPdfAttachment) {
    score += 1;
    reasons.push('attachment:pdf');
  }

  if (NOREPLY_BILLING_SENDER.test(msg.from.address)) {
    score += 1;
    reasons.push('sender:billing-pattern');
  }

  if (msg.bodyText && BODY_HINTS.test(msg.bodyText)) {
    score += 1;
    reasons.push('body:hints');
  }

  if (NEGATIVE.test(subject)) {
    score -= 2;
    reasons.push('subject:negative');
  }

  return { score, isCandidate: score >= 2, reasons };
}
