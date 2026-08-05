/**
 * Every string on the public pages, in one file.
 *
 * The constraint on this file is that a claim has to be something the product
 * does today. `dev/PRODUCT.md` describes sending invoices on to an accounting
 * provider — that is not built, so it does not appear here. The hero preview
 * carries its own "illustrative figures" line for the same reason
 * `ConversionNote` labels a converted total: a number the user cannot verify
 * should say so.
 */

export const PRODUCT_NAME = 'Rayshio';

export const HERO = {
  eyebrow: 'Vendor spend, from your inbox',
  headline: 'Every SaaS invoice, gathered and understood.',
  lede: `${PRODUCT_NAME} reads the invoices already sitting in your mailbox and turns them into a spend history you can actually query — by vendor, by category, by fiscal quarter, in any currency.`,
  cta: 'Continue with Google',
  ctaNote: 'Read-only access to your mail. Nothing is ever sent on your behalf.',
} as const;

export const PREVIEW_NOTE = 'Illustrative figures.';

export const FEATURES = [
  {
    title: 'It reads the mailbox you already have',
    body: 'Point it at the address your vendors bill, and it finds the senders on its own — including the billing aliases a vendor switches to without telling you, so a rename does not quietly become a gap in your history.',
  },
  {
    title: 'Currency conversion that does not rewrite history',
    body: 'Invoices stay in the currency they were billed in. Pick a display currency and each one converts at the ECB rate on its own date, so last quarter’s total does not move because today’s rate did.',
  },
  {
    title: 'Compare categories across vendors',
    body: 'Line items are classified into compute, storage, API usage, AI invocations and the rest — at the line, not the invoice, because one bill legitimately spans several. That is what makes “what is storage costing me everywhere” answerable.',
  },
  {
    title: 'Your agent can query it directly',
    body: 'An MCP endpoint exposes the same data to Claude and any other MCP client, scoped by an API key you can revoke. Ask about a vendor in plain language instead of exporting a spreadsheet.',
  },
  {
    title: 'Fiscal periods, not just calendar ones',
    body: 'Set the month your financial year starts and quarters and years re-slice to match. Years are named for the year they end in, and every label carries its date range, because that convention is not universal.',
  },
] as const;

export const HOW_IT_WORKS = {
  title: 'Three steps',
  steps: [
    {
      title: 'Connect your mailbox',
      body: 'Read-only Gmail access. Rayshio never sends mail and never touches anything that is not an invoice.',
    },
    {
      title: 'It finds your vendors',
      body: 'A first pass scans your history, identifies billing senders and backfills everything they have ever sent you.',
    },
    {
      title: 'Ask it anything',
      body: 'Use the dashboard, or point an MCP client at it and ask in plain language.',
    },
  ],
} as const;

export const CLOSING = {
  title: 'See what you are actually spending.',
  body: 'Connect a mailbox and Rayshio backfills your invoice history on the first run.',
  cta: 'Continue with Google',
} as const;

export const SIGN_IN = {
  title: `Sign in to ${PRODUCT_NAME}`,
  subtitle: 'Use the Google account that receives your vendor invoices.',
  cta: 'Continue with Google',
  failed: 'That sign-in did not complete. Please try again.',
  notAllowed:
    'That account is not on the access list yet. Ask whoever runs your workspace for an invitation.',
  noWorkspace:
    'You are signed in, but you do not have access to a workspace yet. Ask an owner to add you.',
} as const;

export const NOT_FOUND = {
  title: 'This page does not exist.',
  body: 'The link may be out of date, or the page may have moved.',
  cta: 'Go to the dashboard',
} as const;

export const FOOTER = {
  tagline: 'Vendor spend, from your inbox.',
  privacy: 'Privacy',
  terms: 'Terms',
} as const;
