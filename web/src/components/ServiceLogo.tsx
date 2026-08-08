import { useServiceEditor } from '../state/serviceEditor';
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
  sm: { frame: 'h-7 w-7', pad: 'p-1', glyph: 20, text: 'text-micro' },
  md: { frame: 'h-9 w-9', pad: 'p-1.5', glyph: 24, text: 'text-footnote' },
} as const;

interface ServiceLogoProps {
  name: string;
  size?: keyof typeof SIZES;
  /**
   * Whether tier 2 may run. Set false on the signed-out marketing page: that
   * lookup goes to `/api/logo/:service`, which is behind `requireAuth`, so a
   * vendor without a build-time mark would make a visitor fire an
   * authenticated request and log a 401 on the landing page.
   *
   * A prop rather than a rule to remember, because the failure is silent and
   * depends on exactly how a vendor is spelled — 'Railway' misses the icon set,
   * whose key is 'railway corporation'.
   */
  allowFetch?: boolean;
  /**
   * Whether clicking opens the vendor's editor, when an editor is available at
   * all. Set false inside `ServiceModal` itself, where the logo is the subject
   * of the dialog rather than a way into it — a button onto itself.
   */
  interactive?: boolean;
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
export function ServiceLogo({
  name,
  size = 'sm',
  allowFetch = true,
  interactive = true,
}: ServiceLogoProps) {
  const { frame, pad, glyph, text } = SIZES[size];
  const editor = useServiceEditor();

  /*
   * An uploaded logo outranks the build-time brand mark.
   *
   * Tier 1 normally short-circuits before any lookup, which is what keeps this
   * component free of requests for the vendors the icon set covers. But an org
   * that uploads its own mark for one of those vendors would otherwise see
   * nothing change — the file stored, served by the API, and never asked for.
   */
  const hasCustomLogo = editor?.customLogos.has(name) ?? false;
  const lobeIcon = hasCustomLogo ? undefined : lobeIconFor(name);
  // tier 1 needs no lookup, so only ask the server about the vendors it misses
  const logo = useServiceLogo(name, allowFetch && lobeIcon === undefined);
  const brand = brandFor(name);

  const shell = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${frame}`;

  let visual: JSX.Element;
  if (lobeIcon) {
    visual = (
      <span
        aria-hidden="true"
        className={`${shell} ${pad} bg-white ring-1 ring-line`}
        data-service-logo="mark"
        style={{ color: MARK_INK, fontSize: glyph }}
        // build-time asset from the icon package, not user or network content
        dangerouslySetInnerHTML={{ __html: lobeIcon }}
      />
    );
  } else if (logo) {
    visual = (
      <span
        aria-hidden="true"
        className={`${shell} ${pad} bg-white ring-1 ring-line`}
        data-service-logo="favicon"
      >
        {/*
          An <img>, never inline markup. A logo here can be an SVG somebody
          uploaded, and browsers do not execute script inside an image — which
          is exactly the property the tier above forfeits, and why that one is
          restricted to build-time package assets.
        */}
        <img alt="" className="h-full w-full object-contain" src={logo} />
      </span>
    );
  } else {
    visual = (
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

  // Outside the signed-in app there is no editor to open, so the logo stays the
  // decoration it has always been — which is what keeps the marketing page from
  // sprouting buttons onto an authenticated modal.
  if (!interactive || !editor) return visual;

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`Edit ${name}`}
      onClick={(event) => {
        // Several call sites put this inside a row that is itself clickable —
        // an invoice row opening its drawer, an accordion header expanding.
        // Editing the vendor is a different intent from either.
        event.stopPropagation();
        editor.open(name);
      }}
      /* `relative` lifts it above the full-row ::after overlay in InvoiceTable,
         which would otherwise take the click before it ever arrives here. */
      className="press tap relative z-raised rounded-full transition-opacity hover:opacity-80"
    >
      {visual}
    </button>
  );
}
