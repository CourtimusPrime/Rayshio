import { useServiceLogo } from '../utils/logoCache';
import { lobeIconFor } from './serviceIcons';

/** Brand swatches carried over from the design, keyed by vendor name. */
const serviceBrand: Record<string, { bg: string; fg: string }> = {
  AWS: { bg: '#fff4e6', fg: '#b45309' },
  Neon: { bg: '#ecfdf5', fg: '#047857' },
  Vercel: { bg: '#f4f4f5', fg: '#18181b' },
  Notion: { bg: '#f4f4f5', fg: '#3f3f46' },
  Linear: { bg: '#eef2ff', fg: '#4338ca' },
  Figma: { bg: '#fef2f2', fg: '#be123c' },
  Datadog: { bg: '#f5f3ff', fg: '#6d28d9' },
  OpenAI: { bg: '#f0fdfa', fg: '#0f766e' },
  Anthropic: { bg: '#fff7ed', fg: '#c2410c' },
  Supabase: { bg: '#f0fdf4', fg: '#15803d' },
};

/**
 * Vendors come from the user's mailbox, so the fixed map above will never cover
 * all of them. Unmapped names get a deterministic swatch from the same palette
 * rather than all collapsing to the same grey.
 */
const fallbackPalette = [
  { bg: '#f4f4f5', fg: '#3f3f46' },
  { bg: '#eef2ff', fg: '#4338ca' },
  { bg: '#ecfdf5', fg: '#047857' },
  { bg: '#fff7ed', fg: '#c2410c' },
  { bg: '#f5f3ff', fg: '#6d28d9' },
  { bg: '#fef2f2', fg: '#be123c' },
  { bg: '#f0fdfa', fg: '#0f766e' },
];

function brandFor(name: string): { bg: string; fg: string } {
  const known = serviceBrand[name];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return fallbackPalette[hash % fallbackPalette.length] as { bg: string; fg: string };
}

/**
 * Real brand marks sit on a white disc in both themes. Vendor logos are drawn
 * for light backgrounds — a dark navy mark on a dark circle disappears — and a
 * white disc is what every other product does with third-party logos.
 */
const MARK_INK = '#1c1c20';

const SIZES = {
  sm: { frame: 'h-7 w-7', pad: 'p-1', glyph: 20, text: 'text-[11px]' },
  md: { frame: 'h-9 w-9', pad: 'p-1.5', glyph: 24, text: 'text-[13px]' },
} as const;

interface ServiceLogoProps {
  name: string;
  size?: keyof typeof SIZES;
}

/**
 * A vendor's logo in a circular frame, in three tiers:
 *
 *  1. a brand mark from @lobehub/icons-static-svg, inlined at build time;
 *  2. the vendor's favicon, proxied by `/api/logo/:service` so the browser
 *     never calls an icon service directly, and cached in localStorage;
 *  3. a two-letter monogram on a deterministic brand tint.
 *
 * The lobe set is an AI/LLM collection, so tier 1 covers only some vendors;
 * tier 2 is what makes the rest of a mailbox's senders show a real logo.
 */
export function ServiceLogo({ name, size = 'sm' }: ServiceLogoProps) {
  const { frame, pad, glyph, text } = SIZES[size];
  const lobeIcon = lobeIconFor(name);
  // tier 1 needs no lookup, so only ask the server about the vendors it misses
  const logo = useServiceLogo(name, lobeIcon === undefined);
  const brand = brandFor(name);

  const shell = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${frame}`;

  if (lobeIcon) {
    return (
      <span
        aria-hidden="true"
        className={`${shell} ${pad} bg-white ring-1 ring-line`}
        data-service-logo="mark"
        style={{ color: MARK_INK, fontSize: glyph }}
        // build-time asset from the icon package, not user or network content
        dangerouslySetInnerHTML={{ __html: lobeIcon }}
      />
    );
  }

  if (logo) {
    return (
      <span
        aria-hidden="true"
        className={`${shell} ${pad} bg-white ring-1 ring-line`}
        data-service-logo="favicon"
      >
        <img alt="" className="h-full w-full object-contain" src={logo} />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${shell} font-semibold ${text}`}
      data-service-logo="monogram"
      style={{ backgroundColor: brand.bg, color: brand.fg }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
