import { CalendarRangeIcon } from 'lucide-react';
import { useSetFiscalYear } from '../api/hooks';
import { useWorkspace } from '../state/workspace';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Which calendar month the fiscal year starts in. Changing it re-slices every
 * fiscal period, so the reports invalidate on save.
 */
export function FiscalYearSetting() {
  const { meta } = useWorkspace();
  const setFiscalYear = useSetFiscalYear();
  const startMonth = meta?.fiscal_year_start_month ?? 1;

  return (
    <label className="flex items-center gap-2">
      <CalendarRangeIcon className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.75} />
      <span className="text-caption text-ink-500">Fiscal year starts</span>
      <select
        value={startMonth}
        onChange={(event) =>
          setFiscalYear.mutate({ fiscal_year_start_month: Number(event.target.value) })
        }
        className="h-8 rounded-lg border border-line bg-surface px-2 text-footnote text-ink-900 hover:bg-canvas"
      >
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
