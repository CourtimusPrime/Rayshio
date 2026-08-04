import type { ParsedMessage } from '../gmail/messages.js';

const SUBJECT_STRONG =
  /\b(invoice|receipt|billing statement|payment (received|confirmation|due))\b/i;
const SUBJECT_WEAK = /\b(billing|statement|subscription|renewal|payment)\b/i;
const BODY_HINTS = /\b(invoice|amount due|total due|receipt|order total|amount paid|billed to)\b/i;
const NEGATIVE = /\b(newsletter|digest|webinar|unsubscribe preferences center|sale|% off)\b/i;
const NOREPLY_BILLING_SENDER =
  /^(invoice|invoices|billing|receipts?|payments?|statements?|no-?reply)@|@(billing|invoicing|pay)\./i;

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
