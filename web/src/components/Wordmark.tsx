import { PRODUCT_NAME } from '../marketing/copy';

/**
 * The logo lockup, which existed twice in near-identical form — once in the
 * sidebar and once on the login card. One component so the mark cannot drift
 * between the signed-in and signed-out halves of the product.
 */

const SIZES = {
  sm: { badge: 'h-8 w-8 rounded-lg text-footnote', text: 'text-subhead' },
  lg: { badge: 'h-9 w-9 rounded-xl text-body', text: 'text-title3' },
} as const;

interface WordmarkProps {
  size?: keyof typeof SIZES;
  className?: string;
}

export function Wordmark({ size = 'sm', className = '' }: WordmarkProps) {
  const { badge, text } = SIZES[size];

  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center bg-ink-900 font-semibold text-canvas ${badge}`}
      >
        R
      </span>
      <span className={`font-semibold text-ink-900 ${text}`}>{PRODUCT_NAME}</span>
    </span>
  );
}
