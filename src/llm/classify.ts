import { zodToJsonSchema } from 'zod-to-json-schema';
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
    jsonSchema: zodToJsonSchema(senderClassificationSchema) as Record<string, unknown>,
  });
  return senderClassificationSchema.parse(JSON.parse(content));
}

const EMAIL_SYSTEM = `You classify a single email for an invoice-ingestion system.
is_invoice is true only if this specific email is an invoice, receipt, or billing statement
for a payment — not a payment reminder, marketing email, or product notification.`;

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
    jsonSchema: zodToJsonSchema(emailClassificationSchema) as Record<string, unknown>,
  });
  return emailClassificationSchema.parse(JSON.parse(content));
}
