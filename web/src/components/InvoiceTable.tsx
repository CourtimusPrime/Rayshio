import { categoryLabel } from '../categoryColors';
import type { InvoiceRow } from '../types';
import { formatCurrency, formatDate } from '../utils/format';
import { ServiceLogo } from './ServiceLogo';
import { StatusBadge } from './StatusBadge';

const headerClass =
  'px-5 py-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-400';

export function InvoiceTable({
  rows,
  onSelect,
}: {
  rows: InvoiceRow[];
  onSelect: (invoiceId: number) => void;
}) {
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-line bg-canvas">
            <th scope="col" className={`${headerClass} md:px-6`}>
              Service
            </th>
            <th scope="col" className={headerClass}>
              Category
            </th>
            <th scope="col" className={`${headerClass} text-right`}>
              Amount
            </th>
            <th scope="col" className={headerClass}>
              Date
            </th>
            <th scope="col" className={`${headerClass} md:px-6`}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((invoice) => (
            <tr
              key={invoice.invoice_id}
              onClick={() => onSelect(invoice.invoice_id)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(invoice.invoice_id);
                }
              }}
              className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-canvas"
            >
              <td className="px-5 py-3.5 md:px-6">
                <div className="flex items-center gap-3">
                  <ServiceLogo name={invoice.service} />
                  <span>
                    <span className="block text-[13px] font-medium text-ink-900">
                      {invoice.service}
                    </span>
                    <span className="block font-mono text-[11px] text-ink-400">
                      {invoice.invoice_number ?? '—'}
                    </span>
                  </span>
                </div>
              </td>
              <td className="px-5 py-3.5 text-[13px] text-ink-500">{categoryLabel(invoice.category)}</td>
              <td className="tnum px-5 py-3.5 text-right text-[13px] font-medium text-ink-900">
                {formatCurrency(invoice.converted_value, invoice.display_currency)}
                {/* what the vendor actually billed, when it differs */}
                {invoice.is_converted && (
                  <span className="mt-0.5 block text-[11px] font-normal text-ink-400">
                    {formatCurrency(invoice.value, invoice.currency)}
                  </span>
                )}
              </td>
              <td className="tnum px-5 py-3.5 text-[13px] text-ink-500">
                {invoice.invoice_date
                  ? formatDate(invoice.invoice_date)
                  : formatDate(invoice.delivered_at.slice(0, 10))}
              </td>
              <td className="px-5 py-3.5 md:px-6">
                <StatusBadge status={invoice.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
