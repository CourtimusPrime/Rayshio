import { CATEGORIES, type Category } from '../categories.js';

/**
 * The category instructions, built from the taxonomy rather than written out.
 *
 * Extraction and standalone categorisation both need this block, and it used to
 * be pasted into both prompts. Two copies of a list that also exists in
 * `src/categories.ts` and in a database CHECK constraint is three places to
 * update and four ways to be inconsistent — and the failure is quiet: the model
 * keeps returning a category that no longer exists, every line item lands as
 * `other`, and nothing errors.
 *
 * One line per category, generated in taxonomy order, with the hint below
 * supplying what the label alone does not say.
 */
const HINTS: Record<Category, string> = {
  computing: 'CPU/memory/instance/container/serverless execution time.',
  ai: 'LLM and model inference, tokens, embeddings, GPU inference, AI assistant seats.',
  web_search: 'search APIs, crawling, scraping, indexing services.',
  storage: 'disks, volumes, object storage, databases, backups, snapshots.',
  domains: 'domain registration and renewal, DNS hosting, SSL certificates.',
  network: 'bandwidth, egress, data transfer, CDN, load balancing.',
  access:
    'metered requests, calls, events, observability ingest — consumption that is not compute, storage, network or model inference.',
  authentication: 'identity providers, SSO, MFA, secrets and key management.',
  subscriptions: 'flat recurring plan or per-seat licence fees, where nothing is metered.',
  communications:
    'reaching people: transactional and marketing email, SMS and voice, push notifications, telephony and video conferencing.',

  food: 'meals, catering, groceries, coffee.',
  transportation: 'taxis, rideshare, rail, car hire, fuel, parking.',
  flights: 'air fare and airline fees.',
  accommodation: 'hotels and short-stay lodging.',
  reimbursement: 'money repaid to an employee, where the line says so.',
  training: 'courses, certifications, conferences, books and learning subscriptions.',

  inventory: 'goods bought to resell or to consume in production.',
  office_supplies: 'stationery, printing, consumables, kitchen supplies.',
  furniture: 'desks, chairs, fittings.',
  equipment: 'laptops, monitors, phones, tools and other durable hardware.',

  taxes_fees: 'tax, VAT, sales tax, payment processing and service fees.',
  other: 'discounts, refunds, adjustments, and anything genuinely not fitting above.',
};

const LIST = CATEGORIES.map((c) => `- "${c}": ${HINTS[c]}`).join('\n');

/**
 * The shared block. The rules under it are the ones that were learned from
 * getting this wrong: they exist because a classifier that reads the vendor
 * rather than the line makes cross-vendor comparison impossible, which is the
 * entire point of having a shared taxonomy.
 */
export const CATEGORY_INSTRUCTIONS = `Assign each line item a normalized \`category\` from exactly this set:
${LIST}

Category rules that matter:
- Categorize what the LINE describes, not what the vendor mainly sells. The point is
  comparing the same cost type across vendors, so a storage line on a compute vendor's
  invoice is still "storage".
- Prepaid credits and account top-ups take the category of what the vendor sells:
  "OpenRouter Credits" is "ai", not "other". Only genuine discount, refund and
  adjustment lines are "other"; tax and processing fees are "taxes_fees".
- "subscriptions" is for a flat recurring charge with nothing metered. If the line
  names what is being consumed, prefer that category over "subscriptions".
- "communications" is that same rule applied to messaging vendors: a Mailchimp or
  Twilio plan is "communications", not "subscriptions", because the line names what
  is being bought. Reserve "subscriptions" for a plan whose category is not otherwise
  determinable.
- For an opaque total ("Payment received", "Amount"), infer from the vendor when you
  can and fall back to "other" only when you cannot.`;
