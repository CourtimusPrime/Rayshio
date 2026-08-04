import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMeta } from '../api/hooks';
import type { Meta } from '../types';
import { monthKey } from '../utils/format';

const CURRENCY_KEY = 'invoicemcp.currency';

interface WorkspaceValue {
  meta: Meta | undefined;
  isLoading: boolean;
  error: Error | null;
  /**
   * Display currency. Every invoice is shown regardless of what it was billed
   * in; amounts are converted to this at the rate on each invoice's own date.
   */
  currency: string | undefined;
  setCurrency: (currency: string) => void;
  currencies: string[];
  /** The month the dashboard and breakdown pages report on. */
  month: string;
  setMonth: (month: string) => void;
  months: { month: string; invoice_count: number }[];
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: meta, isLoading, error } = useMeta();
  const [selectedCurrency, setSelectedCurrency] = useState<string | undefined>(
    () => localStorage.getItem(CURRENCY_KEY) ?? undefined,
  );
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>();

  const currencies = useMemo(() => meta?.currencies ?? [], [meta]);
  const months = useMemo(() => meta?.months ?? [], [meta]);

  // fall back to the busiest currency whenever the stored one is not in the data
  const currency =
    selectedCurrency && currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0];

  // today's calendar month is empty for most of any given month, so default to
  // the newest month that actually has invoices
  const month = selectedMonth ?? meta?.latest_month ?? monthKey(new Date());

  useEffect(() => {
    if (currency) localStorage.setItem(CURRENCY_KEY, currency);
  }, [currency]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      meta,
      isLoading,
      error: error as Error | null,
      currency,
      setCurrency: setSelectedCurrency,
      currencies,
      month,
      setMonth: setSelectedMonth,
      months,
    }),
    [meta, isLoading, error, currency, currencies, month, months],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
