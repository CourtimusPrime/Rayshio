import { BanknoteIcon, MailIcon, ReceiptTextIcon } from 'lucide-react';
import type { DocumentType } from '../types';

/**
 * What kind of document sits behind a row.
 *
 * This replaced the pipeline `status` badge in the tables. Status answered a
 * question about our own ingestion — parsed, pending, failed — which is
 * meaningful when something breaks and noise the rest of the time, since almost
 * every row says the same thing. Type answers the question a person reconciling
 * spend actually has: is there a document here, and is it a bill or proof of
 * payment.
 *
 * Colour carries meaning rather than decoration: green settles a charge, yellow
 * is a document that is merely evidence of one, red marks the row with no
 * attachment at all — the one you cannot forward to an accountant.
 */

const styles: Record<DocumentType, { label: string; className: string; Icon: typeof MailIcon }> = {
  invoice: {
    label: 'Invoice',
    className: 'bg-success-soft text-success-text',
    // `BanknoteCheck` was asked for and does not exist in Lucide — not in the
    // installed 0.577, nor in 1.34. `Banknote` is the closest without the tick.
    Icon: BanknoteIcon,
  },
  receipt: {
    label: 'Receipt',
    className: 'bg-warn-soft text-warn-text',
    Icon: ReceiptTextIcon,
  },
  email: {
    label: 'Email',
    className: 'bg-danger-soft text-danger-text',
    Icon: MailIcon,
  },
};

export function TypeBadge({ type }: { type: DocumentType }) {
  const style = styles[type] ?? styles.invoice;
  const { Icon } = style;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium ${style.className}`}
    >
      {/*
        Decorative: the label beside it already says the same thing, so
        announcing the icon would read the type twice to a screen reader.
      */}
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      {style.label}
    </span>
  );
}
