import { randomUUID } from 'node:crypto';
import express, { type Request, Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/context.js';
import { CATEGORIES, normalizeCategory } from '../categories.js';
import { config } from '../config.js';
import { logoDomainFor } from '../logos/domains.js';
import { logoForDomain } from '../logos/fetch.js';
import { getPdf } from '../mongo/pdfs.js';
import {
  deleteUploadedLogo,
  getUploadedLogo,
  putUploadedLogo,
  svgRejectionReason,
} from '../mongo/uploaded-logos.js';
import { classifyOutcome } from '../pipeline/failure-reasons.js';
import { retryExtraction } from '../pipeline/retry.js';
import {
  createUploadedInvoice,
  deleteUploadedInvoice,
  isUploadedInvoice,
} from '../pipeline/uploads.js';
import {
  deleteCategoryRule,
  lineItemContext,
  rulesForLineItem,
  setCategoryRule,
} from '../queries/category-rules.js';
import {
  ConversionTracker,
  convertInvoices,
  converterFor,
  totalsByCategory,
  totalsByMonth,
  totalsByService,
  totalsByServiceCategory,
} from '../queries/converted.js';
import { invoiceFacts, lineItemFacts } from '../queries/facts.js';
import {
  type PeriodType,
  parsePeriodKey,
  periodsForMonths,
  previousPeriod,
} from '../queries/fiscal.js';
import {
  countInvoices,
  dominantCategories,
  getInvoice,
  getInvoiceOutcomes,
  getInvoicePdfRef,
  getLineItems,
  lastIngestAt,
  listInvoices,
} from '../queries/invoices.js';
import {
  getOrg,
  listConnectedAccounts,
  listCurrencies,
  listMonthsWithData,
  setBudget,
  setFiscalYearStart,
  setOrgSettings,
} from '../queries/meta.js';
import {
  currentMonthKey,
  isMonthKey,
  longMonthLabel,
  monthRange,
  shiftMonth,
  shortMonthLabel,
  trailingMonths,
} from '../queries/months.js';
import { projectInvoices } from '../queries/projections.js';
import {
  customLogoServices,
  senderAddressesFor,
  serviceByDisplayName,
  serviceOverrideFor,
  setServiceOverride,
} from '../queries/services.js';
import { changePercent, displayStatus } from './serializers.js';

/**
 * Ceiling on `GET /invoices/outcomes`. Above the largest plausible upload batch
 * and far below "the whole table", which is the only thing it is guarding.
 */
const MAX_OUTCOME_IDS = 200;

const TREND_MONTHS = 6;
/** How far back projection looks for a cadence. */
const PROJECTION_HISTORY_MONTHS = 12;

const currencySchema = z.string().regex(/^[A-Za-z]{3}$/, 'expected a 3-letter currency code');

class BadRequest extends Error {}

/**
 * The display currency. Every invoice is included whatever it was billed in and
 * converted to this at the rate on its own date — conversion is query-time only,
 * never written back (SPEC.md:190-196).
 */
function requireCurrency(value: unknown): string {
  const parsed = currencySchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequest('currency is required — a 3-letter display currency code');
  }
  return parsed.data.toUpperCase();
}

function optionalMonth(value: unknown): string {
  if (value === undefined || value === '') return currentMonthKey();
  if (typeof value !== 'string' || !isMonthKey(value)) {
    throw new BadRequest("month must be 'YYYY-MM'");
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * The org this request may read, from the session that authenticated it.
 *
 * Throwing rather than falling back is the point. Every query below takes an
 * org id, and for as long as that id was a process constant a missing one could
 * quietly resolve to org 1 — which is exactly the bug this replaces. There is
 * no `orgId ?? default` in this file, or anywhere else.
 */
function orgOf(req: Request): number {
  const context = req.authContext;
  if (!context) throw new Error('requireAuth did not run for this request');
  return context.orgId;
}

export function apiRouter(): Router {
  const router = Router();

  /*
   * First statement, deliberately. This used to be a `router.use(requireSession)`
   * partway down the file, which made every route declared above it silently
   * public — a property you had to notice while reading rather than one the
   * structure enforced. Genuinely public routes now live in ./public-routes.ts
   * and cannot end up here by accident.
   */
  router.use(requireAuth);

  router.get('/meta', async (req, res) => {
    const orgId = orgOf(req);
    const [org, currencies, accounts, lastIngest, months, customLogos] = await Promise.all([
      getOrg(orgId),
      listCurrencies(orgId),
      listConnectedAccounts(orgId),
      lastIngestAt(orgId),
      listMonthsWithData(orgId),
      customLogoServices(orgId),
    ]);
    const account = accounts.find((a) => a.status === 'active') ?? accounts[0];
    const fiscalStart = org?.fiscal_year_start_month ?? 1;
    const monthKeys = months.map((m) => m.month);
    res.json({
      org: {
        id: orgId,
        name: org?.name ?? 'Workspace',
        default_currency: org?.default_currency ?? null,
        department_mode: org?.department_mode ?? 'single',
      },
      account: account
        ? {
            email_address: account.email_address,
            provider: account.provider,
            status: account.status,
          }
        : null,
      currencies,
      budget:
        org?.monthly_budget_minor === null || org?.monthly_budget_minor === undefined
          ? null
          : {
              monthly_budget_minor: Number(org.monthly_budget_minor),
              currency: org.budget_currency,
            },
      months,
      /** Newest month containing invoices — the dashboard's default view. */
      latest_month: months[0]?.month ?? null,
      fiscal_year_start_month: fiscalStart,
      fiscal_periods: {
        quarter: periodsForMonths(monthKeys, fiscalStart, 'quarter'),
        year: periodsForMonths(monthKeys, fiscalStart, 'year'),
      },
      mcp_endpoint: config.PUBLIC_MCP_URL,
      last_ingest_at: lastIngest,
      /**
       * Vendors with an uploaded logo. ServiceLogo consults this to know when to
       * skip its build-time brand mark — without it, uploading a logo for a
       * vendor the icon set covers would silently do nothing.
       */
      custom_logo_services: customLogos,
    });
  });

  router.get('/summary', async (req, res) => {
    const orgId = orgOf(req);
    const currency = requireCurrency(req.query.currency);
    const month = optionalMonth(req.query.month);
    const previous = shiftMonth(month, -1);

    const months = trailingMonths(month, TREND_MONTHS);
    const [org, facts] = await Promise.all([
      getOrg(orgId),
      invoiceFacts(orgId, {
        dateFrom: monthRange(months[0] as string).from,
        dateTo: monthRange(month).to,
      }),
    ]);

    const tracker = new ConversionTracker(currency);
    const convert = await converterFor(
      facts.map((f) => ({ currency: f.currency, date: f.effective_date })),
      currency,
    );
    const byMonth = totalsByMonth(convertInvoices(facts, convert, tracker, currency));
    const current = byMonth.get(month);
    const prior = byMonth.get(previous);

    const rawBudget =
      org?.monthly_budget_minor === null || org?.monthly_budget_minor === undefined
        ? null
        : Number(org.monthly_budget_minor);
    const budget =
      rawBudget === null
        ? null
        : convert(rawBudget, org?.budget_currency ?? currency, monthRange(month).to).minor;

    res.json({
      currency,
      month,
      month_label: longMonthLabel(month),
      previous_month: previous,
      previous_month_label: longMonthLabel(previous),
      current_total_minor: current?.total_minor ?? 0,
      previous_total_minor: prior?.total_minor ?? 0,
      invoice_count: current?.invoice_count ?? 0,
      service_count: current?.service_count ?? 0,
      // the budget converts too, at the end of the month being reported on — a
      // budget is a forward-looking figure, not a historical transaction
      budget_minor: budget,
      budget_currency: budget === null ? null : currency,
      budget_source_currency: org?.budget_currency ?? null,
      trend: months.map((m) => ({
        month: m,
        label: shortMonthLabel(m),
        total_minor: byMonth.get(m)?.total_minor ?? 0,
      })),
      conversion: tracker.meta(),
    });
  });

  router.get('/services', async (req, res) => {
    const orgId = orgOf(req);
    const currency = requireCurrency(req.query.currency);
    const month = optionalMonth(req.query.month);
    const previous = shiftMonth(month, -1);

    // one fetch spanning both months so a single rate series covers them
    const facts = await invoiceFacts(orgId, {
      dateFrom: monthRange(previous).from,
      dateTo: monthRange(month).to,
    });
    const tracker = new ConversionTracker(currency);
    const convert = await converterFor(
      facts.map((f) => ({ currency: f.currency, date: f.effective_date })),
      currency,
    );
    const converted = convertInvoices(facts, convert, tracker, currency);

    const inMonth = (m: string) => converted.filter((c) => c.effective_date.slice(0, 7) === m);
    const current = totalsByService(inMonth(month));
    const priorByService = new Map(
      totalsByService(inMonth(previous)).map((r) => [r.service, r.total_minor]),
    );

    res.json({
      currency,
      month,
      services: current.map((row) => ({
        service: row.service,
        total_minor: row.total_minor,
        invoice_count: row.invoice_count,
        change_percent: changePercent(row.total_minor, priorByService.get(row.service) ?? 0),
      })),
      conversion: tracker.meta(),
    });
  });

  /**
   * The vendor's logo as a data URL, or `{ data_url: null }` when there is no
   * usable one and the client should fall back to a monogram.
   *
   * Proxied rather than linked so the browser never calls an icon service —
   * that would leak the org's vendor list to a third party. The response is
   * JSON rather than image bytes because the client caches it in localStorage,
   * where a data URL stores directly.
   */
  router.get('/logo/:service', async (req, res) => {
    const orgId = orgOf(req);
    const name = req.params.service;
    if (!name) throw new BadRequest('service name is required');

    /*
     * An uploaded logo wins, and is checked first so a vendor whose favicon is
     * perfectly fetchable can still be corrected. Served as an SVG data URL,
     * which lands in ServiceLogo's `<img>` tier — never its inline tier, where
     * script inside a user-supplied SVG would run.
     */
    const service = await serviceByDisplayName(orgId, name);
    if (service) {
      const override = await serviceOverrideFor(orgId, Number(service.service_id));
      if (override?.logo_id) {
        const svg = await getUploadedLogo(override.logo_id);
        if (svg) {
          res.setHeader('Cache-Control', 'private, max-age=60');
          res.json({
            data_url: `data:image/svg+xml;base64,${svg.toString('base64')}`,
            source: 'upload',
          });
          return;
        }
      }
    }

    const senders = await senderAddressesFor(orgId, name);
    if (senders.length === 0) {
      res.status(404).json({ error: `no service named ${name}` });
      return;
    }

    const domain = senders.map((s) => logoDomainFor(name, s)).find((d) => d !== undefined);
    if (!domain) {
      // every sender is a payment processor and no override names the vendor
      res.json({ data_url: null });
      return;
    }

    const logo = await logoForDomain(domain);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.json({
      data_url: logo ? `data:${logo.contentType};base64,${logo.data.toString('base64')}` : null,
    });
  });

  /**
   * Recategorize a line item — by writing a rule, not by editing the row.
   *
   * `scope: 'item'` files every line from this vendor whose text matches this
   * one; `scope: 'vendor'` files everything from the vendor. The same vendor
   * bills the same thing every month, so correcting a single row would leave
   * next month's invoice misfiled again — the point is to teach, once.
   *
   * Nothing is destroyed: the classifier's original category stays on the row
   * and reappears if the rule is deleted.
   */
  router.put('/line-items/:id/category', async (req, res) => {
    const orgId = orgOf(req);
    const lineItemId = Number(req.params.id);
    if (!Number.isInteger(lineItemId)) throw new BadRequest('invalid line item id');

    const body = req.body as { category?: unknown; scope?: unknown };
    const category = typeof body.category === 'string' ? body.category : '';
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      throw new BadRequest(`unknown category '${category}'`);
    }
    const scope = body.scope === 'vendor' ? 'vendor' : 'item';

    const context = await lineItemContext(orgId, lineItemId);
    if (!context) {
      res.status(404).json({ error: `line item ${lineItemId} not found` });
      return;
    }

    await setCategoryRule(
      orgId,
      Number(context.serviceId),
      scope === 'vendor' ? null : context.description,
      category,
    );
    res.json({
      line_item_id: lineItemId,
      category,
      scope,
      /** What the rule keys on, so the client can say what it just did. */
      description: scope === 'vendor' ? null : context.description,
    });
  });

  /** Drops a rule, restoring the classifier's own answer for the matching items. */
  router.delete('/line-items/:id/category', async (req, res) => {
    const orgId = orgOf(req);
    const lineItemId = Number(req.params.id);
    if (!Number.isInteger(lineItemId)) throw new BadRequest('invalid line item id');
    const scope = req.query.scope === 'vendor' ? 'vendor' : 'item';

    const context = await lineItemContext(orgId, lineItemId);
    if (!context) {
      res.status(404).json({ error: `line item ${lineItemId} not found` });
      return;
    }

    const removed = await deleteCategoryRule(
      orgId,
      Number(context.serviceId),
      scope === 'vendor' ? null : context.description,
    );
    res.json({ line_item_id: lineItemId, scope, removed, category: context.storedCategory });
  });

  /** Which rules currently apply to a line item — shown in the picker. */
  router.get('/line-items/:id/category', async (req, res) => {
    const orgId = orgOf(req);
    const lineItemId = Number(req.params.id);
    if (!Number.isInteger(lineItemId)) throw new BadRequest('invalid line item id');

    const context = await lineItemContext(orgId, lineItemId);
    if (!context) {
      res.status(404).json({ error: `line item ${lineItemId} not found` });
      return;
    }
    const rules = await rulesForLineItem(orgId, Number(context.serviceId), context.description);
    res.json({
      line_item_id: lineItemId,
      description: context.description,
      /** What the classifier said, before any rule. */
      classified_as: normalizeCategory(context.storedCategory),
      rules,
    });
  });

  /**
   * One vendor, as this org sees it — for the edit modal.
   *
   * Keyed on the displayed name because that is what the components rendering a
   * logo actually hold. `serviceByDisplayName` is org-filtered, so a name this
   * org has no invoices from resolves to nothing rather than to a stranger's
   * vendor.
   */
  router.get('/services/:service', async (req, res) => {
    const orgId = orgOf(req);
    const name = req.params.service;
    if (!name) throw new BadRequest('service name is required');

    const service = await serviceByDisplayName(orgId, name);
    if (!service) {
      res.status(404).json({ error: `no service named ${name}` });
      return;
    }
    const override = await serviceOverrideFor(orgId, Number(service.service_id));
    res.json({
      service_id: Number(service.service_id),
      /** What this org calls it — the override if set, otherwise the discovered name. */
      display_name: service.display_name,
      /** What the mailbox called it. Shown so a rename can be undone knowingly. */
      canonical_name: service.canonical_name,
      is_renamed: override?.display_name != null,
      has_custom_logo: override?.logo_id != null,
    });
  });

  /**
   * Rename a vendor, for this org only.
   *
   * Writes `client.service_override`, never `server.service`. That table is
   * global — one row per sender, shared by every tenant receiving mail from it —
   * so an UPDATE here would rename the vendor inside other companies' dashboards.
   *
   * `display_name: null` reverts to the discovered name.
   */
  router.patch('/services/:service', async (req, res) => {
    const orgId = orgOf(req);
    const name = req.params.service;
    if (!name) throw new BadRequest('service name is required');

    const body = req.body as { display_name?: unknown };
    let displayNameValue: string | null;
    if (body.display_name === null) {
      displayNameValue = null;
    } else if (typeof body.display_name === 'string') {
      const trimmed = body.display_name.trim();
      if (trimmed === '') throw new BadRequest('a name cannot be blank');
      if (trimmed.length > 120) throw new BadRequest('that name is too long');
      displayNameValue = trimmed;
    } else {
      throw new BadRequest('display_name must be a string, or null to revert');
    }

    const service = await serviceByDisplayName(orgId, name);
    if (!service) {
      res.status(404).json({ error: `no service named ${name}` });
      return;
    }

    // Renaming onto a name this org already uses would make two vendors
    // indistinguishable in every list, and `serviceByDisplayName` would then
    // resolve that name arbitrarily — including for the next rename.
    if (displayNameValue !== null && displayNameValue !== service.display_name) {
      const clash = await serviceByDisplayName(orgId, displayNameValue);
      if (clash && Number(clash.service_id) !== Number(service.service_id)) {
        res.status(409).json({ error: `another vendor is already called "${displayNameValue}"` });
        return;
      }
    }

    await setServiceOverride(orgId, Number(service.service_id), {
      display_name: displayNameValue,
    });
    res.json({
      service_id: Number(service.service_id),
      display_name: displayNameValue ?? service.canonical_name,
      canonical_name: service.canonical_name,
    });
  });

  /**
   * Replace a vendor's logo with an uploaded SVG.
   *
   * Raw body rather than multipart, matching `/invoices/upload` — one file, no
   * multipart parser on either side.
   */
  router.put(
    '/services/:service/logo',
    express.raw({ type: ['image/svg+xml', 'application/octet-stream'], limit: '128kb' }),
    async (req, res) => {
      const orgId = orgOf(req);
      const name = req.params.service;
      if (!name) throw new BadRequest('service name is required');

      const body = req.body as unknown;
      if (!Buffer.isBuffer(body)) {
        throw new BadRequest('expected an SVG body with Content-Type: image/svg+xml');
      }
      // Checks the bytes, not the declared type or the filename — both are the
      // caller's to claim.
      const rejection = svgRejectionReason(body);
      if (rejection) throw new BadRequest(rejection);

      const service = await serviceByDisplayName(orgId, name);
      if (!service) {
        res.status(404).json({ error: `no service named ${name}` });
        return;
      }
      const serviceId = Number(service.service_id);

      const previous = await serviceOverrideFor(orgId, serviceId);
      const logoId = randomUUID();
      await putUploadedLogo(logoId, body);
      await setServiceOverride(orgId, serviceId, { logo_id: logoId });
      // only once the row points at the new blob — the reverse order would
      // leave the pointer aimed at something already deleted
      if (previous?.logo_id) await deleteUploadedLogo(previous.logo_id);

      res.json({ service_id: serviceId, has_custom_logo: true });
    },
  );

  /** Drop an uploaded logo, falling back to the fetched favicon. */
  router.delete('/services/:service/logo', async (req, res) => {
    const orgId = orgOf(req);
    const name = req.params.service;
    if (!name) throw new BadRequest('service name is required');

    const service = await serviceByDisplayName(orgId, name);
    if (!service) {
      res.status(404).json({ error: `no service named ${name}` });
      return;
    }
    const serviceId = Number(service.service_id);
    const existing = await serviceOverrideFor(orgId, serviceId);

    await setServiceOverride(orgId, serviceId, { logo_id: null });
    if (existing?.logo_id) await deleteUploadedLogo(existing.logo_id);

    res.json({ service_id: serviceId, has_custom_logo: false });
  });

  /**
   * The month's line items as a two-level breakdown.
   *
   * `by=category` (the default, and the pre-existing behaviour) nests services
   * under categories. `by=service` pivots it: categories under services. Same
   * rows, same conversion, same totals — only the nesting differs, which is why
   * it is one endpoint rather than two that could drift.
   *
   * The two responses use different keys (`categories` vs `services`) so a body
   * says what it is without the caller having to remember what it asked for.
   */
  router.get('/categories', async (req, res) => {
    const orgId = orgOf(req);
    const currency = requireCurrency(req.query.currency);
    const month = optionalMonth(req.query.month);

    const by = optionalString(req.query.by) ?? 'category';
    if (by !== 'category' && by !== 'service') {
      throw new BadRequest("by must be 'category' or 'service'");
    }

    const lineItems = await lineItemFacts(orgId, monthRangeFilter(month));
    const tracker = new ConversionTracker(currency);
    const convert = await converterFor(
      lineItems.map((li) => ({ currency: li.currency, date: li.effective_date })),
      currency,
    );

    res.json({
      currency,
      month,
      ...(by === 'service'
        ? { services: totalsByServiceCategory(lineItems, convert, tracker) }
        : { categories: totalsByCategory(lineItems, convert, tracker) }),
      conversion: tracker.meta(),
    });
  });

  router.get('/invoices', async (req, res) => {
    const orgId = orgOf(req);
    const currency = requireCurrency(req.query.currency);
    const limit = Math.min(Number(req.query.limit ?? 25) || 25, 200);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

    const monthParam = optionalString(req.query.month);
    const range = monthParam ? monthRangeFilter(optionalMonth(monthParam)) : {};

    // `currency` is the display target, not a filter — every invoice is listed
    // regardless of what it was billed in, converted for comparability
    const filters = {
      service: optionalString(req.query.service),
      status: optionalString(req.query.status),
      search: optionalString(req.query.q),
      ...range,
    };

    const [rows, total] = await Promise.all([
      listInvoices(orgId, { ...filters, limit, offset }),
      countInvoices(orgId, filters),
    ]);
    const categories = await dominantCategories(
      orgId,
      rows.map((r) => Number(r.invoice_id)),
    );

    const tracker = new ConversionTracker(currency);
    const effectiveDate = (row: (typeof rows)[number]) =>
      row.invoice_date ?? new Date(row.delivered_at).toISOString().slice(0, 10);
    const convert = await converterFor(
      rows.map((row) => ({ currency: row.currency, date: effectiveDate(row) })),
      currency,
    );

    res.json({
      total,
      limit,
      offset,
      invoices: rows.map((row) => {
        const { minor, rate } = convert(Number(row.value), row.currency, effectiveDate(row));
        tracker.note(row.currency, rate);
        return {
          invoice_id: Number(row.invoice_id),
          service: row.service,
          invoice_number: row.invoice_number,
          /** Original amount, in the currency the vendor billed. */
          value: Number(row.value),
          currency: row.currency,
          /** Same amount in the display currency. */
          converted_value: minor,
          display_currency: currency,
          is_converted: row.currency !== currency,
          invoice_date: row.invoice_date,
          status: displayStatus(row.status),
          delivered_at: row.delivered_at,
          category: normalizeCategory(categories.get(Number(row.invoice_id))),
        };
      }),
      conversion: tracker.meta(),
    });
  });

  /**
   * What became of a set of invoices — one request, not one per id.
   *
   * Exists for the upload toast, which watches a whole batch at once. Built the
   * obvious way it would be N `GET /invoices/:id` calls every poll tick, so a
   * thirteen-file upload would be thirteen round-trips every five seconds for
   * as long as extraction takes.
   *
   * Registered before `/invoices/:id`, and it has to stay that way: Express
   * matches in registration order, so the parameterised route would otherwise
   * swallow this one and try to parse "outcomes" as an id.
   */
  router.get('/invoices/outcomes', async (req, res) => {
    const orgId = orgOf(req);

    const ids = String(req.query.ids ?? '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (ids.length === 0) {
      res.json({ outcomes: [] });
      return;
    }
    // A bound, so a hand-written query string cannot ask for the whole table.
    if (ids.length > MAX_OUTCOME_IDS) {
      throw new BadRequest(`too many ids — at most ${MAX_OUTCOME_IDS} per request`);
    }

    /*
     * Ids belonging to another org are simply absent from the response.
     *
     * Not 403, and not an error: either would confirm the id exists, which is
     * exactly what an id-probing caller wants to learn. "Not yours" and "not a
     * thing" have to be indistinguishable, so the org filter just removes them.
     */
    const rows = await getInvoiceOutcomes(orgId, ids);

    res.json({
      outcomes: rows.map((row) => ({
        invoice_id: Number(row.id),
        outcome: classifyOutcome(row.status, row.failure_reason),
        failure_reason: row.failure_reason,
      })),
    });
  });

  router.get('/invoices/:id', async (req, res) => {
    const orgId = orgOf(req);
    const invoiceId = Number(req.params.id);
    if (!Number.isInteger(invoiceId)) throw new BadRequest('invalid invoice id');

    const invoice = await getInvoice(orgId, invoiceId);
    if (!invoice) {
      res.status(404).json({ error: `invoice ${invoiceId} not found` });
      return;
    }
    const [lineItems, isUpload] = await Promise.all([
      getLineItems(orgId, invoiceId),
      isUploadedInvoice(orgId, invoiceId),
    ]);

    res.json({
      invoice_id: Number(invoice.id),
      service: invoice.service,
      invoice_number: invoice.invoice_number,
      value: Number(invoice.value),
      currency: invoice.currency,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      period_start: invoice.period_start,
      period_end: invoice.period_end,
      status: displayStatus(invoice.status),
      raw_status: invoice.status,
      failure_reason: invoice.failure_reason,
      email_subject: invoice.email_subject,
      delivered_at: invoice.delivered_at,
      has_pdf: invoice.pdf_id !== null,
      /** Uploaded by hand rather than ingested from the mailbox — the only kind that can be deleted. */
      is_upload: isUpload,
      line_items: lineItems.map((li) => ({
        id: Number(li.id),
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        rate: li.rate === null ? null : Number(li.rate),
        amount: Number(li.amount),
        category: normalizeCategory(li.category),
        period_start: li.period_start,
        period_end: li.period_end,
      })),
    });
  });

  /**
   * One PDF per request, as a raw body.
   *
   * Deliberately not multipart: a batch upload is N of these rather than one
   * request carrying N files, which needs no multipart dependency, lets one
   * corrupt PDF fail on its own instead of taking the batch with it, and gives
   * the client per-file progress for free.
   *
   * Responds 202 as soon as the row exists. Extraction runs on the worker, so
   * twenty PDFs are twenty quick requests rather than one request held open
   * through twenty LLM round-trips.
   */
  router.post(
    '/invoices/upload',
    express.raw({ type: 'application/pdf', limit: '20mb' }),
    async (req, res) => {
      const orgId = orgOf(req);
      const body = req.body as unknown;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new BadRequest('expected a PDF body with Content-Type: application/pdf');
      }
      // Check the magic bytes, not the extension or the declared content type —
      // both are supplied by the caller, and a non-PDF would otherwise fail much
      // later, as an opaque "no usable text" extraction failure.
      if (body.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new BadRequest('that file is not a PDF');
      }

      const rawName = optionalString(req.query.filename) ?? 'upload.pdf';
      // the filename is stored and displayed; keep it to something harmless
      const filename = rawName.replace(/[^\w. -]+/g, '-').slice(0, 200);

      const uploaded = await createUploadedInvoice(orgId, filename, body);

      /*
       * 200 for a duplicate, 202 for a new one. The status code carries the
       * distinction as well as the body does: 202 promises work has been
       * queued, and for a duplicate none has — nothing was written and no
       * extraction will run. `invoice_id` points at the row the org already
       * had, so the client can link to it.
       */
      if (uploaded.kind === 'duplicate') {
        res.status(200).json({
          invoice_id: uploaded.invoiceId,
          filename: uploaded.filename,
          duplicate: true,
        });
        return;
      }
      res
        .status(202)
        .json({ invoice_id: uploaded.invoiceId, filename: uploaded.filename, duplicate: false });
    },
  );

  /**
   * Re-queue extraction for one invoice.
   *
   * Exists because a lost job is invisible from the row: an invoice sits in a
   * non-terminal status forever and nothing in the product could move it. Also
   * covers retrying a failed extraction after the extractor improves.
   */
  router.post('/invoices/:id/retry', async (req, res) => {
    const orgId = orgOf(req);
    const invoiceId = Number(req.params.id);
    if (!Number.isInteger(invoiceId)) throw new BadRequest('invalid invoice id');

    const result = await retryExtraction(orgId, invoiceId, Date.now());
    if (!result.enqueued) {
      // "not found in this workspace" covers both a missing invoice and another
      // tenant's — the caller must not be able to tell those apart
      const status = result.reason?.includes('not found') ? 404 : 409;
      res.status(status).json({ error: result.reason });
      return;
    }
    res.status(202).json({ invoice_id: invoiceId, status: 'queued' });
  });

  /**
   * Delete one uploaded invoice, its line items and its stored PDF.
   *
   * Uploads only. A mailbox-ingested invoice would be re-created by the next
   * sync, so deleting it would look like it silently failed; an upload has no
   * source to re-read, which is what makes the delete meaningful.
   */
  router.delete('/invoices/:id', async (req, res) => {
    const orgId = orgOf(req);
    const invoiceId = Number(req.params.id);
    if (!Number.isInteger(invoiceId)) throw new BadRequest('invalid invoice id');

    const result = await deleteUploadedInvoice(orgId, invoiceId);
    if (!result.deleted) {
      // 404 for "not in this workspace" — which covers another tenant's invoice
      // too, so the caller cannot probe for ids. 409 for a real invoice this
      // endpoint refuses to touch.
      const status = result.reason?.includes('not found') ? 404 : 409;
      res.status(status).json({ error: result.reason });
      return;
    }
    res.status(204).end();
  });

  router.get('/invoices/:id/pdf', async (req, res) => {
    const orgId = orgOf(req);
    const invoiceId = Number(req.params.id);
    if (!Number.isInteger(invoiceId)) throw new BadRequest('invalid invoice id');

    const invoice = await getInvoicePdfRef(orgId, invoiceId);
    if (!invoice) {
      res.status(404).json({ error: `invoice ${invoiceId} not found` });
      return;
    }
    if (!invoice.pdf_id) {
      res
        .status(404)
        .json({ error: `invoice ${invoiceId} has no PDF (extracted from the email body)` });
      return;
    }

    /*
     * `getPdf` takes a GridFS id and does no org check of its own, which is
     * safe only because `pdf_id` came from the org-filtered row fetched above —
     * it is never read from the request. Keep it that way: taking the id from a
     * query parameter here would make every PDF in Mongo readable by id.
     */
    let pdf: Buffer;
    try {
      pdf = await getPdf(invoice.pdf_id);
    } catch {
      // the row points at a GridFS file that is no longer there
      res.status(404).json({ error: `invoice ${invoiceId} PDF is missing from storage` });
      return;
    }

    const filename = `${invoice.invoice_number ?? `invoice-${invoiceId}`}.pdf`.replace(
      /[^\w.-]+/g,
      '-',
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdf);
  });

  router.get('/calendar', async (req, res) => {
    const orgId = orgOf(req);
    const currency = requireCurrency(req.query.currency);
    const month = optionalMonth(req.query.month);
    const { from, to } = monthRange(month);

    const received = await invoiceFacts(
      orgId,
      { dateFrom: from, dateTo: to },
      { parsedOnly: false },
    );

    // projections are per-currency by nature (a vendor bills in one currency),
    // so each vendor's cadence is derived in its own currency and converted after
    const currencies = [...new Set(received.map((r) => r.currency))];
    const projectedByCurrency = await Promise.all(
      currencies.map((c) =>
        projectInvoices(
          orgId,
          c,
          to,
          monthRange(shiftMonth(month, -PROJECTION_HISTORY_MONTHS)).from,
        ).then((rows) => rows.map((p) => ({ ...p, currency: c }))),
      ),
    );
    const projected = projectedByCurrency.flat();

    const tracker = new ConversionTracker(currency);
    const convert = await converterFor(
      [
        ...received.map((r) => ({ currency: r.currency, date: r.effective_date })),
        ...projected.map((p) => ({ currency: p.currency, date: p.invoice_date })),
      ],
      currency,
    );

    // a projection is only interesting if it has not already been superseded by
    // a real invoice landing in the same month
    const receivedInMonth = new Set(
      received.map((r) => `${r.service}:${r.effective_date.slice(0, 7)}`),
    );

    res.json({
      currency,
      month,
      received: received.map((r) => {
        const { minor, rate } = convert(r.value, r.currency, r.effective_date);
        tracker.note(r.currency, rate);
        return {
          id: `invoice-${r.invoice_id}`,
          invoice_id: r.invoice_id,
          service: r.service,
          value: minor,
          original_value: r.value,
          currency: r.currency,
          is_converted: r.currency !== currency,
          invoice_date: r.effective_date,
          status: displayStatus(r.status),
        };
      }),
      projected: projected
        .filter((p) => p.invoice_date >= from && p.invoice_date <= to)
        .filter((p) => !receivedInMonth.has(`${p.service}:${p.invoice_date.slice(0, 7)}`))
        .map((p) => {
          const { minor, rate } = convert(p.value, p.currency, p.invoice_date);
          tracker.note(p.currency, rate);
          return { ...p, value: minor, original_value: p.value };
        }),
      conversion: tracker.meta(),
    });
  });

  /**
   * A fiscal quarter or year, shaped like the dashboard's month view so the same
   * cards render it. Aggregation and FX conversion are identical — only the date
   * window differs.
   */
  router.get('/reports', async (req, res) => {
    const orgId = orgOf(req);
    const currency = requireCurrency(req.query.currency);
    const org = await getOrg(orgId);
    const fiscalStart = org?.fiscal_year_start_month ?? 1;

    const type = (optionalString(req.query.type) ?? 'quarter') as PeriodType;
    if (type !== 'quarter' && type !== 'year') {
      throw new BadRequest("type must be 'quarter' or 'year'");
    }

    const key = optionalString(req.query.period);
    const months = await listMonthsWithData(orgId);
    const available = periodsForMonths(
      months.map((m) => m.month),
      fiscalStart,
      type,
    );
    const period = key ? parsePeriodKey(key, fiscalStart) : available[0];
    if (!period) throw new BadRequest(`unknown period '${key}'`);
    const prior = previousPeriod(period, fiscalStart);

    // one fetch spanning both periods so a single FX series covers them
    const [facts, lineItems] = await Promise.all([
      invoiceFacts(orgId, { dateFrom: prior.from, dateTo: period.to }),
      lineItemFacts(orgId, { dateFrom: period.from, dateTo: period.to }),
    ]);

    const tracker = new ConversionTracker(currency);
    const convert = await converterFor(
      [
        ...facts.map((f) => ({ currency: f.currency, date: f.effective_date })),
        ...lineItems.map((li) => ({ currency: li.currency, date: li.effective_date })),
      ],
      currency,
    );
    const converted = convertInvoices(facts, convert, tracker, currency);

    const inPeriod = (p: { months: string[] }) =>
      converted.filter((c) => p.months.includes(c.effective_date.slice(0, 7)));
    const current = inPeriod(period);
    const previous = inPeriod(prior);

    const total = current.reduce((sum, c) => sum + c.converted_value, 0);
    const previousTotal = previous.reduce((sum, c) => sum + c.converted_value, 0);
    const byMonth = totalsByMonth(current);

    res.json({
      currency,
      type,
      period,
      previous_period: { key: prior.key, label: prior.label, rangeLabel: prior.rangeLabel },
      current_total_minor: total,
      previous_total_minor: previousTotal,
      invoice_count: current.length,
      service_count: new Set(current.map((c) => c.service)).size,
      // one point per month inside the period, so a quarter reads as three bars
      trend: period.months.map((m) => ({
        month: m,
        label: shortMonthLabel(m),
        total_minor: byMonth.get(m)?.total_minor ?? 0,
      })),
      services: totalsByService(current).map((row) => ({
        service: row.service,
        total_minor: row.total_minor,
        invoice_count: row.invoice_count,
        change_percent: changePercent(
          row.total_minor,
          totalsByService(previous).find((p) => p.service === row.service)?.total_minor ?? 0,
        ),
      })),
      categories: totalsByCategory(lineItems, convert, tracker),
      available_periods: available,
      conversion: tracker.meta(),
    });
  });

  /*
   * Org settings, partially applied. Every field is optional so the modal can
   * send only what changed — a whole-object write would let a stale form
   * overwrite a field someone else had just edited.
   *
   * `default_currency` is nullable on purpose: clearing it restores the
   * fallback to whichever currency most invoices were billed in.
   */
  const orgSettingsBody = z.object({
    default_currency: currencySchema.nullable().optional(),
    fiscal_year_start_month: z.number().int().min(1).max(12).optional(),
    department_mode: z.enum(['single', 'multi']).optional(),
  });

  router.patch('/settings', async (req, res) => {
    const orgId = orgOf(req);
    const parsed = orgSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }

    const settings = {
      ...parsed.data,
      ...(parsed.data.default_currency === undefined
        ? {}
        : {
            default_currency:
              parsed.data.default_currency === null
                ? null
                : parsed.data.default_currency.toUpperCase(),
          }),
    };

    await setOrgSettings(orgId, settings);
    res.json(settings);
  });

  const fiscalBody = z.object({
    fiscal_year_start_month: z.number().int().min(1).max(12),
  });

  router.patch('/settings/fiscal-year', async (req, res) => {
    const orgId = orgOf(req);
    const parsed = fiscalBody.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequest('fiscal_year_start_month must be a whole number from 1 to 12');
    }
    await setFiscalYearStart(orgId, parsed.data.fiscal_year_start_month);
    res.json({ fiscal_year_start_month: parsed.data.fiscal_year_start_month });
  });

  const budgetBody = z.object({
    monthly_budget_minor: z.number().int().nonnegative().nullable(),
    currency: currencySchema.nullable(),
  });

  router.patch('/budget', async (req, res) => {
    const orgId = orgOf(req);
    const parsed = budgetBody.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const { monthly_budget_minor, currency } = parsed.data;
    await setBudget(orgId, monthly_budget_minor, currency === null ? null : currency.toUpperCase());
    res.json({
      monthly_budget_minor,
      currency: currency === null ? null : currency.toUpperCase(),
    });
  });

  return router;
}

function monthRangeFilter(month: string): { dateFrom: string; dateTo: string } {
  const { from, to } = monthRange(month);
  return { dateFrom: from, dateTo: to };
}

export { BadRequest };
