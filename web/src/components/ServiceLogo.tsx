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

interface ServiceLogoProps {
  name: string;
  size?: 'sm' | 'md';
}

export function ServiceLogo({ name, size = 'sm' }: ServiceLogoProps) {
  const brand = brandFor(name);
  const dimension = size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-[13px]';

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-semibold ${dimension}`}
      style={{ backgroundColor: brand.bg, color: brand.fg }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
