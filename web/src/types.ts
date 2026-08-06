export type DisplayStatus = 'parsed' | 'pending' | 'failed';

export type Category =
  | 'compute'
  | 'storage'
  | 'api_usage'
  | 'ai_invocations'
  | 'network'
  | 'subscription'
  | 'other';

export type DepartmentMode = 'single' | 'multi';

export interface Meta {
  org: {
    id: number;
    name: string;
    /** Display currency the workspace opens on; null falls back to the busiest. */
    default_currency: string | null;
    department_mode: DepartmentMode;
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
  raw_status: string;
  failure_reason: string | null;
  email_subject: string | null;
  delivered_at: string;
  has_pdf: boolean;
  line_items: LineItem[];
}

export interface ReceivedEntry {
  id: string;
  invoice_id: number;
  service: string;
  /** Converted into the display currency. */
  value: number;
  original_value: number;
  currency: string;
  is_converted: boolean;
  invoice_date: string;
  status: DisplayStatus;
}

export interface ProjectedEntry {
  id: string;
  service: string;
  value: number;
  original_value: number;
  currency: string;
  invoice_date: string;
}

export interface CalendarResponse {
  currency: string;
  month: string;
  received: ReceivedEntry[];
  projected: ProjectedEntry[];
  conversion: ConversionMeta;
}

export type PeriodType = 'quarter' | 'year';

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
