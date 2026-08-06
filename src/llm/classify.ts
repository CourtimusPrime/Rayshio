import { config } from '../config.js';
import { completeJson } from './openrouter.js';
import {
  type EmailClassification,
  type SenderClassification,
  emailClassificationSchema,
  senderClassificationSchema,
} from './schemas.js';

const SENDER_SYSTEM = `You classify email senders for an invoice-ingestion system.
Given a sender address and sample subjects from that sender, decide whether this sender
sends bills/invoices/receipts for a paid product or service the recipient subscribes to.
Marketing newsletters, product updates, and personal correspondence are NOT billing senders.
service_name is the human product/company name (e.g. "Neon", "AWS"), null if not billing.`;

export async function classifySender(input: {
  senderAddress: string;
  senderName: string | null;
  sampleSubjects: string[];
}): Promise<SenderClassification> {
  const content = await completeJson({
    model: config.OPENROUTER_CLASSIFY_MODEL,
    system: SENDER_SYSTEM,
    user: JSON.stringify(input),
    schemaName: 'sender_classification',
    schema: senderClassificationSchema,
  });
  return senderClassificationSchema.parse(JSON.parse(content));
}

const EMAIL_SYSTEM = `You classify a single email for an invoice-ingestion system.
is_invoice is true only if this specific email is an invoice, receipt, or billing statement
for a payment the recipient MADE — it must state an amount they were charged.

A billing sender also sends plenty of mail that is not a bill. is_invoice is false for:
- product, legal or service announcements, even when the subject mentions billing
  (e.g. "[Product Update] ...", "[Billing Update] console permissions are changing")
- account and configuration notices: payment method added, billing email changed,
  workspace created, passkey added, permissions or role changes
- notifications that an invoice EXISTS elsewhere but carry no amount
  (e.g. "Your invoice is available" with only a link)
- payouts, disbursements or refunds TO the recipient — money in, not money out
- payment reminders and marketing`;

export async function classifyEmail(input: {
  senderAddress: string;
  subject: string | null;
  bodyPreview: string;
}): Promise<EmailClassification> {
  const content = await completeJson({
    model: config.OPENROUTER_CLASSIFY_MODEL,
    system: EMAIL_SYSTEM,
    user: JSON.stringify({ ...input, bodyPreview: input.bodyPreview.slice(0, 2000) }),
    schemaName: 'email_classification',
    schema: emailClassificationSchema,
  });
  return emailClassificationSchema.parse(JSON.parse(content));
}
