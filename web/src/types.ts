export type DisplayStatus = 'parsed' | 'pending' | 'failed';

export const CATEGORY_PARENTS = ['technology', 'employee', 'goods', 'other'] as const;
export type CategoryParent = (typeof CATEGORY_PARENTS)[number];

export const PARENT_LABELS: Record<CategoryParent, string> = {
  technology: 'Technology',
  employee: 'Employee Expenses',
  goods: 'Physical Goods',
  other: 'Other',
};

/**
 * The category taxonomy, mirroring `src/categories.ts`.
 *
 * Duplicated across the boundary on purpose: the client cannot import from
 * `src/`, and shipping the list over the wire would mean the picker could not
 * render until `/api/meta` resolved. Declaration order is display order, and
 * both copies must stay in the same order — a chart legend and a picker that
 * disagree about sequence look like a bug even when every value is present.
 *
 * `icon` is a Lucide export name, resolved in `CategoryIcon`.
 */
export const CATEGORY_META = {
  computing: { label: 'Computing', parent: 'technology', icon: 'Cpu' },
  ai: { label: 'AI', parent: 'technology', icon: 'BrainCircuit' },
  web_search: { label: 'Web Search', parent: 'technology', icon: 'Globe' },
  storage: { label: 'Storage', parent: 'technology', icon: 'Database' },
  domains: { label: 'Domains', parent: 'technology', icon: 'Link' },
  network: { label: 'Network', parent: 'technology', icon: 'Share2' },
  access: { label: 'Access', parent: 'technology', icon: 'LockOpen' },
  authentication: { label: 'Authentication', parent: 'technology', icon: 'Shield' },
  subscriptions: { label: 'Subscriptions', parent: 'technology', icon: 'CalendarSync' },
  communications: { label: 'Communications', parent: 'technology', icon: 'Megaphone' },

  food: { label: 'Food', parent: 'employee', icon: 'Utensils' },
  transportation: { label: 'Transportation', parent: 'employee', icon: 'CarFront' },
  flights: { label: 'Flights', parent: 'employee', icon: 'Plane' },
  accommodation: { label: 'Accommodation', parent: 'employee', icon: 'BedDouble' },
  reimbursement: { label: 'Reimbursement', parent: 'employee', icon: 'HandCoins' },
  training: { label: 'Training', parent: 'employee', icon: 'GraduationCap' },

  inventory: { label: 'Inventory', parent: 'goods', icon: 'Boxes' },
  office_supplies: { label: 'Office Supplies', parent: 'goods', icon: 'NotebookPen' },
  furniture: { label: 'Furniture', parent: 'goods', icon: 'LampDesk' },
  equipment: { label: 'Equipment', parent: 'goods', icon: 'Toolbox' },

  taxes_fees: { label: 'Taxes & Fees', parent: 'other', icon: 'Coins' },
  other: { label: 'Other', parent: 'other', icon: 'CircleDashed' },
} as const satisfies Record<string, { label: string; parent: CategoryParent; icon: string }>;

export type Category = keyof typeof CATEGORY_META;

export const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

export type DepartmentMode = 'single' | 'multi';

/** Whether rows charging exactly nothing are shown. Mirrors `src/queries/meta.ts`. */
export type ZeroChargeMode = 'show' | 'hide';

export interface Meta {
  org: {
    id: number;
    name: string;
    /** Display currency the workspace opens on; null falls back to the busiest. */
    default_currency: string | null;
    department_mode: DepartmentMode;
    /** 'hide' omits rows charging exactly 0 from every list and breakdown. */
    zero_charge_mode: ZeroChargeMode;
  };
  account: { email_address: string; provider: string; status: string } | null;
  currencies: string[];
  budget: { monthly_budget_minor: number; currency: string | null } | null;
  /** Months containing invoices, newest first. */
  months: { month: string; invoice_count: number }[];
  latest_month: string | null;
  /** Calendar month (1-12) the fiscal year starts in. */
  fiscal_year_start_month: number;
  fiscal_periods: { quarter: FiscalPeriod[]; year: FiscalPeriod[] };
  mcp_endpoint: string;
  last_ingest_at: string | null;
  /**
   * Vendors this org has uploaded a logo for. `ServiceLogo` checks it to know
   * when to skip its build-time brand mark — that tier never asks the server,
   * so without this an upload for a vendor the icon set covers would silently
   * do nothing.
   */
  custom_logo_services: string[];
  /**
   * Renamed vendors, displayed name -> discovered name.
   *
   * `ServiceLogo` resolves its build-time brand mark from the vendor name
   * without asking the server, so renaming a vendor would otherwise lose the
   * mark — a labelling change quietly taking the logo with it.
   */
  renamed_services: Record<string, string>;
}

/** What the picker needs to show: the classifier's answer, and any rules over it. */
export interface LineItemRules {
  line_item_id: number;
  description: string;
  /** What the invoice was read as, before any rule. */
  classified_as: Category;
  rules: { scope: 'item' | 'vendor'; category: string }[];
}

/** One vendor as this org sees it — the payload behind ServiceModal. */
export interface ServiceDetail {
  service_id: number;
  /** What this org calls it: the override if set, otherwise the discovered name. */
  display_name: string;
  /** What the mailbox called it, so a rename can be undone knowingly. */
  canonical_name: string;
  is_renamed: boolean;
  has_custom_logo: boolean;
}

/**
 * Provenance for a converted figure. Amounts are converted at query time at the
 * rate on each invoice's own date; nothing converted is ever stored.
 */
export interface ConversionMeta {
  display_currency: string;
  source_currencies: string[];
  converted: boolean;
  uses_pegged_rate: boolean;
  rate_date: string | null;
  rate_source: 'ecb' | 'peg' | 'mixed' | 'none';
}

export interface TrendPoint {
  month: string;
  label: string;
  total_minor: number;
}

export interface Summary {
  currency: string;
  month: string;
  month_label: string;
  previous_month: string;
  previous_month_label: string;
  current_total_minor: number;
  previous_total_minor: number;
  invoice_count: number;
  service_count: number;
  budget_minor: number | null;
  budget_currency: string | null;
  /** Currency the budget was entered in, before conversion. */
  budget_source_currency: string | null;
  trend: TrendPoint[];
  conversion: ConversionMeta;
}

export interface ServiceSpend {
  service: string;
  total_minor: number;
  invoice_count: number;
  change_percent: number | null;
}

export interface ServicesResponse {
  currency: string;
  month: string;
  services: ServiceSpend[];
  conversion: ConversionMeta;
}

export interface CategoryContribution {
  service: string;
  total_minor: number;
  note: string;
  /**
   * Every distinct line text in this cell, not just the two the note names.
   * Re-filing the cell writes one rule per text, so a truncated list would
   * silently leave the rest behind.
   */
  descriptions: string[];
}

export interface CategoryBreakdown {
  category: Category;
  total_minor: number;
  services: CategoryContribution[];
}

export interface CategoriesResponse {
  currency: string;
  month: string;
  categories: CategoryBreakdown[];
  conversion: ConversionMeta;
}

/** One category's share of a single service's spend — the pivot of `CategoryContribution`. */
export interface ServiceContribution {
  category: Category;
  total_minor: number;
  note: string;
  /** See `CategoryContribution.descriptions`. */
  descriptions: string[];
}

export interface ServiceBreakdown {
  service: string;
  total_minor: number;
  categories: ServiceContribution[];
}

/** `GET /api/categories?by=service` — the same spend, nested the other way up. */
export interface ServiceCategoriesResponse {
  currency: string;
  month: string;
  services: ServiceBreakdown[];
  conversion: ConversionMeta;
}

/**
 * What kind of document a row came from, as opposed to how far it got through
 * ingestion (`DisplayStatus`). Derived server-side; see
 * `src/queries/document-type.ts` for the rule.
 */
export type DocumentType = 'invoice' | 'receipt' | 'email';

export interface InvoiceRow {
  invoice_id: number;
  service: string;
  invoice_number: string | null;
  /** Amount as the vendor billed it, in `currency`. */
  value: number;
  currency: string;
  /** Same amount in `display_currency`. */
  converted_value: number;
  display_currency: string;
  is_converted: boolean;
  invoice_date: string | null;
  status: DisplayStatus;
  type: DocumentType;
  delivered_at: string;
  category: Category;
}

export interface InvoicesResponse {
  total: number;
  limit: number;
  offset: number;
  invoices: InvoiceRow[];
  conversion: ConversionMeta;
}

export interface LineItem {
  id: number;
  description: string;
  quantity: string | null;
  unit: string | null;
  rate: number | null;
  amount: number;
  category: Category;
  period_start: string | null;
  period_end: string | null;
}

export interface InvoiceDetail {
  invoice_id: number;
  service: string;
  invoice_number: string | null;
  value: number;
  currency: string;
  invoice_date: string | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  status: DisplayStatus;
  type: DocumentType;
  raw_status: string;
  failure_reason: string | null;
  email_subject: string | null;
  delivered_at: string;
  has_pdf: boolean;
  /** Uploaded by hand rather than ingested from the mailbox — only these can be deleted. */
  is_upload: boolean;
  line_items: LineItem[];
}

/**
 * What became of one uploaded file. Mirrors `Outcome` in
 * `src/pipeline/failure-reasons.ts`, which is where the classification actually
 * happens — the client never inspects a `failure_reason` string itself.
 */
export type Outcome = 'pending' | 'added' | 'duplicate' | 'not_invoice' | 'error';

export interface OutcomesResponse {
  outcomes: {
    invoice_id: number;
    outcome: Outcome;
    failure_reason: string | null;
  }[];
}

export interface FiscalPeriod {
  key: string;
  type: PeriodType;
  fiscalYear: number;
  quarter: number | null;
  label: string;
  /** e.g. 'Apr 2025 – Mar 2026'; the FY naming convention is not universal. */
  rangeLabel: string;
  from: string;
  to: string;
  months: string[];
}

export type PeriodType = 'quarter' | 'year';

export interface ReportResponse {
  currency: string;
  type: PeriodType;
  period: FiscalPeriod;
  previous_period: { key: string; label: string; rangeLabel: string };
  current_total_minor: number;
  previous_total_minor: number;
  invoice_count: number;
  service_count: number;
  trend: TrendPoint[];
  services: ServiceSpend[];
  categories: CategoryBreakdown[];
  available_periods: FiscalPeriod[];
  conversion: ConversionMeta;
}

/**
 * The Accountant tab.
 *
 * `summary` describes what is *outstanding* — invoices this recipient has never
 * been sent — not the workspace's spend. Changing the accountant's address
 * makes everything outstanding again for the new address, which is deliberate:
 * a new firm gets the full history rather than whatever happened to arrive
 * after the switch.
 */
export interface AccountantSummary {
  invoice_count: number;
  service_count: number;
  period_start: string | null;
  period_end: string | null;
  total_minor: number;
  currency: string;
}

export interface AccountantDelivery {
  id: number;
  recipient: string;
  sent_at: string;
  invoice_count: number;
  service_count: number;
  period_start: string | null;
  period_end: string | null;
  total_minor: number;
  currency: string;
  status: 'sent' | 'failed' | string;
  error: string | null;
}

/**
 * Why a workspace cannot send, each needing different words on screen: no Gmail
 * account connected, one whose grant was revoked, or one connected before
 * Rayshio could send and so holding read-only permission.
 */
export type SendBlocker = 'no_mailbox' | 'mailbox_revoked' | 'missing_send_scope';

export interface AccountantState {
  recipient: string | null;
  /** The mailbox invoices go out from — the user's own connected account. */
  sender: string | null;
  can_send: boolean;
  blocker: SendBlocker | null;
  summary: AccountantSummary;
  services: { service: string; count: number; total_minor: number }[];
  /** Outstanding invoices with no stored PDF — sent as figures, not documents. */
  without_pdf_count: number;
  deliveries: AccountantDelivery[];
}

export interface AccountantSendResult {
  recipient: string;
  sender: string;
  delivery_id: number;
  summary: AccountantSummary;
  /** Left for the next send because the message hit its attachment ceiling. */
  deferred_count: number;
  without_pdf_count: number;
}
