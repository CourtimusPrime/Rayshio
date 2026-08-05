import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CalendarResponse,
  CategoriesResponse,
  InvoiceDetail,
  InvoicesResponse,
  Meta,
  PeriodType,
  ReportResponse,
  ServicesResponse,
  Summary,
} from '../types';
import { authClient } from './authClient';
import { ApiError, apiGet, apiSend } from './client';

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
 * That endpoint answers from `resolveAuthContext`, which accepts a Better Auth
 * session *or* a legacy `imcp_session` cookie. Asking Better Auth directly
 * would report anyone still holding the old cookie as signed out and bounce
 * them to the sign-in page mid-session — the one thing R1 is arranged to avoid.
 *
 * It also answers "is there a tenant to show", not merely "is there a user":
 * a signed-in account with no membership is authenticated but has nothing to
 * render, and the server is the only side that knows that.
 */
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => apiGet<{ authenticated: boolean; pending: boolean }>('/session'),
    retry: false,
  });
}

/**
 * Ends both kinds of session, because in R1 a browser may hold either. The
 * legacy DELETE is allowed to fail — once R2 removes that route, a 404 here
 * must not stop the Better Auth sign-out from completing.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiSend('DELETE', '/session').catch(() => undefined);
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
  calendar: (currency: string | undefined, month: string) => ({
    queryKey: ['calendar', currency, month] as const,
    queryFn: () => apiGet<CalendarResponse>('/calendar', { currency, month }),
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

export function useCalendar(currency: string | undefined, month: string) {
  return useQuery({
    ...monthQueries.calendar(currency, month),
    placeholderData: keepPreviousData,
    enabled: Boolean(currency),
    retry: retryUnlessUnauthorized,
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
