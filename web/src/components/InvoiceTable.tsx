import { categoryLabel } from '../categoryColors';
import type { InvoiceRow } from '../types';
import { formatCurrency, formatDate } from '../utils/format';
import { ServiceLogo } from './ServiceLogo';
import { TypeBadge } from './TypeBadge';

const headerClass = 'px-5 py-2.5 text-micro font-medium uppercase tracking-wide text-ink-400';

export function InvoiceTable({
  rows,
  onSelect,
  selectedId = null,
}: {
  rows: InvoiceRow[];
  onSelect: (invoiceId: number) => void;
  /** Which row's drawer is open, so its trigger can say so. */
  selectedId?: number | null;
}) {
  return (
    /*
     * The table is wider than a phone, so this is a scroll region. Without a
     * tab stop it cannot be scrolled by keyboard at all in Safari or Firefox —
     * Chrome adds one implicitly, which is exactly why it is easy to miss.
     */
    <div
      className="overflow-x-auto border-t border-line"
      tabIndex={0}
      role="region"
      aria-label="Invoices"
    >
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
              Type
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((invoice) => (
            <tr
              key={invoice.invoice_id}
              className="press-row relative cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-canvas"
            >
              <td className="px-5 py-3.5 md:px-6">
                <div className="flex items-center gap-3">
                  <ServiceLogo name={invoice.service} />
                  <span>
                    {/*
                      A real button whose ::after covers the whole row, rather
                      than a click handler on the <tr>. The row previously had
                      tabIndex and a key handler but no role and no accessible
                      name, so it announced as a plain table row that happened
                      to do something. Putting role="button" on the <tr> would
                      fix the name at the cost of removing the row from the
                      table's accessibility tree, taking the column headers with
                      it — so the control goes inside the cell instead.
                    */}
                    <button
                      type="button"
                      onClick={() => onSelect(invoice.invoice_id)}
                      aria-haspopup="dialog"
                      aria-expanded={selectedId === invoice.invoice_id}
                      className="block text-left text-footnote font-medium text-ink-900 after:absolute after:inset-0 after:content-['']"
                    >
                      {invoice.service}
                      <span className="sr-only">
                        {` — ${formatCurrency(invoice.converted_value, invoice.display_currency)}, ${
                          invoice.invoice_date
                            ? formatDate(invoice.invoice_date)
                            : formatDate(invoice.delivered_at.slice(0, 10))
                        }`}
                      </span>
                    </button>
                    <span className="block font-mono text-micro text-ink-400">
                      {invoice.invoice_number ?? '—'}
                    </span>
                  </span>
                </div>
              </td>
              <td className="px-5 py-3.5 text-footnote text-ink-500">
                {categoryLabel(invoice.category)}
              </td>
              <td className="tnum px-5 py-3.5 text-right text-footnote font-medium text-ink-900">
                {formatCurrency(invoice.converted_value, invoice.display_currency)}
                {/* what the vendor actually billed, when it differs */}
                {invoice.is_converted && (
                  <span className="mt-0.5 block text-micro font-normal text-ink-400">
                    {formatCurrency(invoice.value, invoice.currency)}
                  </span>
                )}
              </td>
              <td className="tnum px-5 py-3.5 text-footnote text-ink-500">
                {invoice.invoice_date
                  ? formatDate(invoice.invoice_date)
                  : formatDate(invoice.delivered_at.slice(0, 10))}
              </td>
              <td className="px-5 py-3.5 md:px-6">
                <TypeBadge type={invoice.type} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
