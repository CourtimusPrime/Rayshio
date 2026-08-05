import { InfoIcon } from 'lucide-react';
import type { ConversionMeta } from '../types';
import { formatDate } from '../utils/format';

/**
 * Converted totals must say so. The spec allows query-time conversion only when
 * the output is "explicitly labeled as converted and dated" — this is that label.
 */
export function ConversionNote({ meta }: { meta: ConversionMeta | undefined }) {
  if (!meta?.converted) return null;

  const others = meta.source_currencies.filter((c) => c !== meta.display_currency);
  if (others.length === 0) return null;

  const dated = meta.rate_date ? ` at rates from ${formatDate(meta.rate_date)}` : '';
  const pegged =
    meta.rate_source === 'peg'
      ? ' (fixed peg)'
      : meta.rate_source === 'mixed'
        ? ' (ECB rates, plus a fixed peg where the ECB publishes none)'
        : ' (ECB reference rates)';

  return (
    <p className="mt-2 flex items-start gap-1.5 text-micro leading-relaxed text-ink-400">
      <InfoIcon className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.75} />
      <span>
        Includes {others.join(', ')} converted to {meta.display_currency}
        {dated}
        {pegged}. Each invoice uses the rate on its own date.
      </span>
    </p>
  );
}
