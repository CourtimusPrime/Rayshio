import anthropic from '@lobehub/icons-static-svg/icons/anthropic.svg?raw';
import cloudflare from '@lobehub/icons-static-svg/icons/cloudflare-color.svg?raw';
import google from '@lobehub/icons-static-svg/icons/google-color.svg?raw';
import googleCloud from '@lobehub/icons-static-svg/icons/googlecloud-color.svg?raw';
import openrouter from '@lobehub/icons-static-svg/icons/openrouter.svg?raw';
import railway from '@lobehub/icons-static-svg/icons/railway.svg?raw';

/**
 * Brand marks from @lobehub/icons-static-svg, inlined at build time — these
 * cost no request and need no cache.
 *
 * The set is an AI/LLM brand collection, so it covers only part of a mailbox's
 * vendors; everything else falls back to the proxied favicon in ServiceLogo.
 * Keys are normalized vendor names (see `normalizeVendor`).
 *
 * Some marks are monochrome and render in `currentColor`: Anthropic and Railway
 * ship no colour variant, and OpenRouter's is a single #C8FF00 lime drawn for
 * dark backgrounds, which all but vanishes on the white disc these sit on.
 */
const LOBE_ICONS: Record<string, string> = {
  anthropic,
  cloudflare,
  'google cloud': googleCloud,
  'google cloud platform': googleCloud,
  'google workspace': google,
  openrouter,
  'railway corporation': railway,
};

/** Mirrors `normalizeVendor` on the server so both sides key the same way. */
export function normalizeVendor(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The inlined SVG markup for a vendor, or undefined if the set has no mark. */
export function lobeIconFor(name: string): string | undefined {
  return LOBE_ICONS[normalizeVendor(name)];
}
