/**
 * Canned API responses, installed only while Boneyard is capturing bones.
 *
 * Boneyard measures the real UI: it opens each route in a headless browser and
 * snapshots where every element actually landed. That only works if the page
 * renders something — and every page here is behind `requireAuth` and a
 * database, so a headless visit would otherwise get the signed-out marketing
 * page and capture nothing.
 *
 * The alternative was writing mock JSX per skeleton, which would put us back
 * where we started: hand-maintained placeholders that drift from the real
 * components. Stubbing the *data* instead keeps the components real — the
 * measurements come from `InvoiceTable` and `ServiceBreakdownChart` themselves,
 * laid out by the same CSS that ships.
 *
 * Dev-only by construction: the module is imported behind `import.meta.env.DEV`
 * and does nothing unless the capture flag is present, so it is never in a
 * production bundle and never active in a normal dev session.
 */

const CONVERSION = {
  display_currency: 'GBP',
  source_currencies: ['GBP', 'USD'],
  converted: true,
  uses_pegged_rate: false,
  rate_date: '2026-08-26',
  rate_source: 'ecb' as const,
};

const SERVICES = [
  { service: 'OpenRouter', total_minor: 132400, invoice_count: 22, change_percent: 12.4 },
  { service: 'Mailchimp', total_minor: 89230, invoice_count: 5, change_percent: -3.1 },
  { service: 'Cloudflare', total_minor: 41970, invoice_count: 6, change_percent: 4.2 },
  { service: 'Neon', total_minor: 19800, invoice_count: 4, change_percent: null },
  { service: 'Resend', total_minor: 5765, invoice_count: 1, change_percent: 0.4 },
];

const invoice = (id: number, service: string, type: 'invoice' | 'receipt' | 'email') => ({
  invoice_id: id,
  service,
  invoice_number: `INV-${1000 + id}`,
  value: 2016,
  currency: 'USD',
  converted_value: 1479,
  display_currency: 'GBP',
  is_converted: true,
  invoice_date: '2026-08-20',
  status: 'parsed',
  type,
  delivered_at: '2026-08-20T00:00:00.000Z',
  category: 'ai',
});

/*
 * Eight rows, not two. Bone counts are captured from what is on screen, so a
 * short fixture produces a short skeleton and the page visibly grows when the
 * real data lands — the exact jump this whole mechanism exists to remove.
 */
const INVOICES = [
  invoice(1, 'OpenRouter', 'invoice'),
  invoice(2, 'Mailchimp', 'receipt'),
  invoice(3, 'Cloudflare', 'invoice'),
  invoice(4, 'Neon', 'email'),
  invoice(5, 'Resend', 'invoice'),
  invoice(6, 'OpenRouter', 'receipt'),
  invoice(7, 'Cloudflare', 'invoice'),
  invoice(8, 'Serper', 'email'),
];

const FIXTURES: Record<string, unknown> = {
  '/api/session': { authenticated: true, pending: false },
  '/api/meta': {
    org: {
      id: 1,
      name: 'Workspace',
      default_currency: 'GBP',
      department_mode: 'single',
      zero_charge_mode: 'hide',
    },
    account: { email_address: 'you@example.com', provider: 'google', status: 'active' },
    currencies: ['GBP', 'USD'],
    budget: { monthly_budget_minor: 300000, currency: 'GBP' },
    months: [
      { month: '2026-08', invoice_count: 12 },
      { month: '2026-07', invoice_count: 9 },
    ],
    latest_month: '2026-08',
    fiscal_year_start_month: 1,
    fiscal_periods: { quarter: [], year: [] },
    mcp_endpoint: 'https://example.com/mcp',
    last_ingest_at: '2026-08-26T12:00:00.000Z',
    custom_logo_services: [],
    renamed_services: {},
  },
  '/api/summary': {
    currency: 'GBP',
    month: '2026-08',
    month_label: 'August 2026',
    previous_month: '2026-07',
    previous_month_label: 'July 2026',
    current_total_minor: 289165,
    previous_total_minor: 240100,
    invoice_count: 38,
    service_count: 5,
    budget_minor: 300000,
    budget_currency: 'GBP',
    budget_source_currency: 'GBP',
    trend: [
      { month: '2026-03', label: 'Mar', total_minor: 180000 },
      { month: '2026-04', label: 'Apr', total_minor: 210500 },
      { month: '2026-05', label: 'May', total_minor: 198000 },
      { month: '2026-06', label: 'Jun', total_minor: 233400 },
      { month: '2026-07', label: 'Jul', total_minor: 240100 },
      { month: '2026-08', label: 'Aug', total_minor: 289165 },
    ],
    conversion: CONVERSION,
  },
  '/api/services': { currency: 'GBP', month: '2026-08', services: SERVICES, conversion: CONVERSION },
  '/api/invoices': {
    total: 336,
    limit: 25,
    offset: 0,
    invoices: INVOICES,
    conversion: CONVERSION,
  },
  '/api/categories': {
    currency: 'GBP',
    month: '2026-08',
    categories: [
      {
        category: 'ai',
        total_minor: 132400,
        services: [
          { service: 'OpenRouter', total_minor: 118400, note: 'Model inference', descriptions: ['Inference credits'] },
          { service: 'Claude', total_minor: 14000, note: 'Team seats', descriptions: ['Team plan'] },
        ],
      },
      {
        category: 'infrastructure',
        total_minor: 61770,
        services: [
          { service: 'Cloudflare', total_minor: 41970, note: 'Workers and DNS', descriptions: ['Workers Paid'] },
          { service: 'Neon', total_minor: 19800, note: 'Postgres', descriptions: ['Compute hours'] },
        ],
      },
      {
        category: 'communications',
        total_minor: 89230,
        services: [
          { service: 'Mailchimp', total_minor: 89230, note: 'Marketing email', descriptions: ['Standard plan'] },
        ],
      },
      {
        category: 'subscriptions',
        total_minor: 5765,
        services: [
          { service: 'Resend', total_minor: 5765, note: 'Transactional email', descriptions: ['Pro plan'] },
        ],
      },
    ],
    conversion: CONVERSION,
  },
  '/api/reports': {
    currency: 'GBP',
    type: 'quarter',
    period: {
      key: '2026-Q3',
      type: 'quarter',
      fiscalYear: 2026,
      quarter: 3,
      label: 'Q3 2026',
      rangeLabel: 'Jul – Sep 2026',
      from: '2026-07-01',
      to: '2026-09-30',
      months: ['2026-07', '2026-08', '2026-09'],
    },
    previous_period: { key: '2026-Q2', label: 'Q2 2026', rangeLabel: 'Apr – Jun 2026' },
    current_total_minor: 529265,
    previous_total_minor: 441900,
    invoice_count: 47,
    service_count: 5,
    trend: [
      { month: '2026-07', label: 'Jul', total_minor: 240100 },
      { month: '2026-08', label: 'Aug', total_minor: 289165 },
    ],
    services: SERVICES,
    available_periods: [
      {
        key: '2026-Q3',
        type: 'quarter',
        fiscalYear: 2026,
        quarter: 3,
        label: 'Q3 2026',
        rangeLabel: 'Jul – Sep 2026',
        from: '2026-07-01',
        to: '2026-09-30',
        months: ['2026-07', '2026-08', '2026-09'],
      },
    ],
    categories: [
      {
        category: 'ai',
        total_minor: 132400,
        services: [
          { service: 'OpenRouter', total_minor: 132400, note: 'Model inference', descriptions: ['Inference credits'] },
        ],
      },
      {
        category: 'infrastructure',
        total_minor: 61770,
        services: [
          { service: 'Cloudflare', total_minor: 61770, note: 'Workers and DNS', descriptions: ['Workers Paid'] },
        ],
      },
    ],
    conversion: CONVERSION,
  },
  '/api/accountant': {
    recipient: 'accounts@yourfirm.com',
    sender: 'you@example.com',
    send_mode: 'bulk',
    can_send: true,
    blocker: null,
    summary: {
      invoice_count: 37,
      service_count: 5,
      period_start: '2026-05-03',
      period_end: '2026-08-26',
      total_minor: 214550,
      currency: 'GBP',
    },
    services: SERVICES.map((s) => ({
      service: s.service,
      count: s.invoice_count,
      total_minor: s.total_minor,
    })),
    without_pdf_count: 2,
    deliveries: [
      {
        id: 1,
        recipient: 'accounts@yourfirm.com',
        sent_at: '2026-08-01T09:00:00.000Z',
        invoice_count: 18,
        service_count: 4,
        period_start: '2026-04-01',
        period_end: '2026-04-30',
        total_minor: 98300,
        currency: 'GBP',
        status: 'sent',
        error: null,
      },
    ],
  },
};

/** True when Boneyard's CLI is driving the page, or when asked for by hand. */
export function isCapturing(): boolean {
  return (
    (window as { __BONEYARD_BUILD?: boolean }).__BONEYARD_BUILD === true ||
    new URLSearchParams(window.location.search).has('bones')
  );
}

/**
 * Answers `/api/*` from the table above and leaves every other request alone.
 *
 * Patching `fetch` rather than using a service worker or MSW: this has to be in
 * place before React's first render, and it is thrown away with the page. A
 * worker would need registration and a scope, and would outlive the capture.
 */
export function installBonesFixtures(): void {
  if (!isCapturing()) return;

  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0];
    const body = path ? FIXTURES[path] : undefined;

    if (body === undefined) return real(input as RequestInfo, init);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  console.info('[boneyard] API stubbed for bone capture');
}
