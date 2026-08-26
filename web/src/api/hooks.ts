import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountantSendResult,
  AccountantState,
  CategoriesResponse,
  DepartmentMode,
  InvoiceDetail,
  InvoicesResponse,
  LineItemRules,
  Meta,
  PeriodType,
  ReportResponse,
  ServiceCategoriesResponse,
  ServiceDetail,
  ZeroChargeMode,
  ServicesResponse,
  Summary,
} from '../types';
import { forgetServiceLogo } from '../utils/logoCache';
import { authClient } from './authClient';
import { ApiError, apiGet, apiPutSvg, apiSend } from './client';

/**
 * A 4xx means the request itself was wrong (or the session lapsed) — retrying
 * just burns requests. The `Error` parameter type is load-bearing: react-query
 * infers its TError from this callback, so widening it to `unknown` makes
 * `query.error` untyped at every call site.
 */
function retryUnlessUnauthorized(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 2;
}

/**
 * Deliberately still `GET /api/session` rather than `authClient.useSession()`.
 *
 * It answers "is there a tenant to show", not merely "is there a user": a
 * signed-in account with no membership is authenticated but has nothing to
 * render, and the server is the only side that knows that. Better Auth can only
 * report the second half.
 */
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => apiGet<{ authenticated: boolean; pending: boolean }>('/session'),
    retry: false,
  });
}

/**
 * A failed sign-out still clears the client. The server call is best-effort
 * because the local caches hold the previous session's data either way, and
 * leaving them in place is the worse outcome.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await authClient.signOut().catch(() => undefined);
    },
    onSuccess: () => {
      queryClient.clear();
      /*
       * A hard navigation, not a router push. Signing out from /invoices with
       * client-side routing lands on the gate, which redirects to
       * /signin?next=/invoices — "you signed out, now sign back in". Leaving
       * for '/' also discards every cached query belonging to the old session.
       */
      window.location.assign('/');
    },
  });
}

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: () => apiGet<Meta>('/meta'),
    retry: retryUnlessUnauthorized,
  });
}

/**
 * A month's figures never change once ingested, so cached months stay fresh for
 * a long time. Without this, revisiting a month refetches and the numbers jump
 * as the response lands.
 */
export const PERIOD_STALE_TIME = 10 * 60 * 1000;

/**
 * Query definitions shared by the hooks and the prefetcher — if these keys drifted
 * apart, prefetching would silently warm a cache nothing ever reads.
 */
export const monthQueries = {
  summary: (currency: string | undefined, month: string) => ({
    queryKey: ['summary', currency, month] as const,
    queryFn: () => apiGet<Summary>('/summary', { currency, month }),
    staleTime: PERIOD_STALE_TIME,
  }),
  services: (currency: string | undefined, month: string) => ({
    queryKey: ['services', currency, month] as const,
    queryFn: () => apiGet<ServicesResponse>('/services', { currency, month }),
    staleTime: PERIOD_STALE_TIME,
  }),
  categories: (currency: string | undefined, month: string) => ({
    queryKey: ['categories', currency, month] as const,
    queryFn: () => apiGet<CategoriesResponse>('/categories', { currency, month }),
    staleTime: PERIOD_STALE_TIME,
  }),
};

export function useSummary(currency: string | undefined, month: string) {
  return useQuery({
    ...monthQueries.summary(currency, month),
    placeholderData: keepPreviousData,
    enabled: Boolean(currency),
    retry: retryUnlessUnauthorized,
  });
}

export function useServices(currency: string | undefined, month: string) {
  return useQuery({
    ...monthQueries.services(currency, month),
    placeholderData: keepPreviousData,
    enabled: Boolean(currency),
    retry: retryUnlessUnauthorized,
  });
}

export function useCategories(currency: string | undefined, month: string) {
  return useQuery({
    ...monthQueries.categories(currency, month),
    placeholderData: keepPreviousData,
    enabled: Boolean(currency),
    retry: retryUnlessUnauthorized,
  });
}

/**
 * The Breakdown page's Service tab: the same month's line items nested
 * service-first instead of category-first.
 *
 * Its own query key, not a parameter on `monthQueries.categories` — the
 * prefetcher warms that key for every month, and folding a second shape into it
 * would either double the prefetch or serve one tab the other's body.
 */
export function useServiceCategories(currency: string | undefined, month: string) {
  return useQuery({
    queryKey: ['categories', 'by-service', currency, month],
    queryFn: () =>
      apiGet<ServiceCategoriesResponse>('/categories', { currency, month, by: 'service' }),
    placeholderData: keepPreviousData,
    staleTime: PERIOD_STALE_TIME,
    enabled: Boolean(currency),
    retry: retryUnlessUnauthorized,
  });
}

/** Which rules currently apply to a line item, and what the classifier said. */
export function useLineItemRules(lineItemId: number | null) {
  return useQuery({
    queryKey: ['line-item-rules', lineItemId],
    queryFn: () => apiGet<LineItemRules>(`/line-items/${lineItemId}/category`),
    enabled: lineItemId !== null,
    retry: retryUnlessUnauthorized,
  });
}

/**
 * Files a line item — by writing a rule, not by editing the row.
 *
 * `category: null` removes the rule at that scope instead, restoring whatever
 * the classifier originally read off the invoice.
 *
 * Invalidates everything. A rule re-files every matching line item across every
 * month, so the categories on the breakdown, the dominant category on each
 * invoice row, the charts and the reports all move at once — enumerating those
 * keys is a list that goes stale, and being wrong leaves a screen showing the
 * category the user just corrected.
 */
export function useSetLineItemCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      lineItemId,
      category,
      scope,
    }: {
      lineItemId: number;
      category: string | null;
      scope: 'item' | 'vendor';
    }) =>
      category === null
        ? apiSend<unknown>('DELETE', `/line-items/${lineItemId}/category?scope=${scope}`)
        : apiSend<unknown>('PUT', `/line-items/${lineItemId}/category`, { category, scope }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

/**
 * Files a whole breakdown cell: one rule per line text, or one for the vendor.
 *
 * A cell is a (vendor x category) intersection covering however many distinct
 * line texts, so `descriptions` is a list rather than a single value — passing
 * only the two the row's note happens to name would leave the rest behind.
 * `null` writes the vendor-wide rule instead.
 */
export function useSetCellCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      service,
      descriptions,
      category,
    }: {
      service: string;
      descriptions: string[] | null;
      category: string | null;
    }) =>
      category === null
        ? apiSend<unknown>(
            'DELETE',
            `/category-rules?service=${encodeURIComponent(service)}${
              descriptions === null
                ? ''
                : `&descriptions=${encodeURIComponent(descriptions.join('\n'))}`
            }`,
          )
        : apiSend<unknown>('PUT', '/category-rules', { service, descriptions, category }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useService(name: string | null) {
  return useQuery({
    queryKey: ['service', name],
    queryFn: () => apiGet<ServiceDetail>(`/services/${encodeURIComponent(name ?? '')}`),
    enabled: name !== null,
    retry: retryUnlessUnauthorized,
  });
}

/**
 * Renames a vendor for this org, or reverts with `display_name: null`.
 *
 * Invalidates everything, and has to. The name is denormalised into every
 * response that mentions a vendor — invoice rows, both breakdown nestings, the
 * calendar, projections, reports — so a partial invalidation leaves the old
 * name on whichever screen was missed, which reads as the rename having failed.
 */
export function useRenameService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, displayName }: { name: string; displayName: string | null }) =>
      apiSend<ServiceDetail>('PATCH', `/services/${encodeURIComponent(name)}`, {
        display_name: displayName,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

/**
 * Uploads or clears a vendor's logo.
 *
 * Also clears `logoCache`, which persists data URLs — and negative results —
 * in localStorage. Without that the old logo (or a cached "this vendor has
 * none") survives the upload and the change appears not to have taken.
 */
export function useSetServiceLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, svg }: { name: string; svg: File | null }) => {
      if (svg === null) {
        await apiSend<{ has_custom_logo: boolean }>(
          'DELETE',
          `/services/${encodeURIComponent(name)}/logo`,
        );
      } else {
        await apiPutSvg(`/services/${encodeURIComponent(name)}/logo`, svg);
      }
    },
    onSuccess: (_data, { name }) => {
      forgetServiceLogo(name);
      void queryClient.invalidateQueries();
    },
  });
}

export interface InvoiceQuery {
  currency: string | undefined;
  month?: string | undefined;
  service?: string | undefined;
  status?: string | undefined;
  q?: string | undefined;
  limit?: number;
  offset?: number;
}

export function useInvoices(query: InvoiceQuery) {
  const { currency, month, service, status, q, limit, offset } = query;
  return useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['invoices', currency, month, service, status, q, limit, offset],
    queryFn: () =>
      apiGet<InvoicesResponse>('/invoices', { currency, month, service, status, q, limit, offset }),
    enabled: Boolean(currency),
    retry: retryUnlessUnauthorized,
  });
}

export function useInvoice(invoiceId: number | null) {
  return useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => apiGet<InvoiceDetail>(`/invoices/${invoiceId}`),
    enabled: invoiceId !== null,
    retry: retryUnlessUnauthorized,
  });
}

/**
 * Deletes an uploaded invoice. The server refuses anything that came from the
 * mailbox, so the button that calls this is only offered for uploads.
 *
 * Invalidates everything rather than a hand-picked list of keys. An invoice
 * contributes to the summary, the vendor and category breakdowns, the calendar,
 * every report period and the "last ingest" meta — enumerating those is a list
 * that goes stale the moment a new aggregate is added, and the cost of being
 * wrong is a figure that silently keeps counting a deleted invoice.
 */
export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: number) => apiSend<void>('DELETE', `/invoices/${invoiceId}`),
    onSuccess: (_data, invoiceId) => {
      // drop the detail outright — refetching it would 404
      queryClient.removeQueries({ queryKey: ['invoice', invoiceId] });
      void queryClient.invalidateQueries();
    },
  });
}

export function useReport(
  currency: string | undefined,
  type: PeriodType,
  period: string | undefined,
) {
  return useQuery({
    queryKey: ['report', currency, type, period],
    queryFn: () => apiGet<ReportResponse>('/reports', { currency, type, period }),
    placeholderData: keepPreviousData,
    staleTime: PERIOD_STALE_TIME,
    enabled: Boolean(currency),
    retry: retryUnlessUnauthorized,
  });
}

export function useSetFiscalYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fiscal_year_start_month: number }) =>
      apiSend<{ fiscal_year_start_month: number }>('PATCH', '/settings/fiscal-year', input),
    onSuccess: () => {
      // every fiscal period is re-sliced by this setting
      void queryClient.invalidateQueries({ queryKey: ['meta'] });
      void queryClient.invalidateQueries({ queryKey: ['report'] });
    },
  });
}

/**
 * Org settings, applied partially — only the fields that changed are sent, so
 * a stale form cannot clobber a field someone else just edited.
 *
 * Invalidates everything: the fiscal year re-slices every period, and the
 * default currency changes what figures are converted to, so no cached
 * response survives a change here intact.
 */
export function useSetOrgSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      default_currency?: string | null;
      fiscal_year_start_month?: number;
      department_mode?: DepartmentMode;
      zero_charge_mode?: ZeroChargeMode;
    }) => apiSend<typeof input>('PATCH', '/settings', input),
    /*
     * `void`, not `return`. react-query awaits a promise returned from
     * onSuccess before running the per-call one, and an unfiltered
     * invalidateQueries only settles once every active query has refetched —
     * so returning it left the modal open for seconds after the save had
     * already succeeded, looking like a hang.
     */
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useSetBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { monthly_budget_minor: number | null; currency: string | null }) =>
      apiSend<{ monthly_budget_minor: number | null; currency: string | null }>(
        'PATCH',
        '/budget',
        input,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meta'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });
}

/**
 * What is outstanding for the accountant, in the workspace's display currency.
 *
 * Not cached across currencies by accident: the key carries the currency
 * because the total is converted server-side, and a GBP figure shown under a
 * USD heading is the kind of error nobody spots until a filing is wrong.
 *
 * `staleTime: 0` — unlike a month's figures, this changes the instant an
 * invoice is ingested or a send completes, and the number on this page is the
 * one the user is about to act on.
 */
export function useAccountant(currency: string | undefined) {
  return useQuery({
    queryKey: ['accountant', currency],
    queryFn: () => apiGet<AccountantState>('/accountant', { currency }),
    // The workspace has no currency until `meta` lands; firing without one
    // would 400 on every first paint.
    enabled: Boolean(currency),
    retry: retryUnlessUnauthorized,
  });
}

export function useSetAccountantEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string | null) =>
      apiSend<{ email: string | null }>('PUT', '/accountant', { email }),
    /*
     * The address is what "outstanding" is measured against, so changing it
     * changes the count — refetch rather than patch the cache, since only the
     * server knows what the new address has already had.
     */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accountant'] });
    },
  });
}

export function useSendToAccountant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (currency: string) =>
      apiSend<AccountantSendResult>('POST', '/accountant/send', { currency }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accountant'] });
    },
  });
}
