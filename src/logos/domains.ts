/**
 * Resolves a vendor to the domain its logo should be fetched from.
 *
 * The sender address is usually the best signal — `noreply@ar.neon.tech` is
 * plainly Neon. It breaks in two ways this module handles:
 *
 *  1. Some vendors bill through a payment processor, so the sender is
 *     `stripe.com` or `paddle.com`. Taking the sender domain there renders
 *     Stripe's logo for Railway. Those senders are refused outright.
 *  2. Registrable-domain extraction needs to know about multi-part public
 *     suffixes, or `no-reply@123-reg.co.uk` collapses to `reg.co.uk`.
 */

/**
 * Senders that front for the actual vendor. A logo fetched from these is the
 * processor's, not the vendor's, so they resolve to no domain at all unless an
 * explicit override supplies one.
 */
const RELAY_DOMAINS = new Set([
  '2checkout.com',
  'amazonses.com',
  'braintreepayments.com',
  'chargebee.com',
  'fastspring.com',
  'gocardless.com',
  'lemonsqueezy.com',
  'mailgun.org',
  'mandrillapp.com',
  'mcsv.net',
  'paddle.com',
  'paypal.com',
  'postmarkapp.com',
  'quaderno.io',
  'recurly.com',
  'sendgrid.net',
  'sparkpostmail.com',
  'squareup.com',
  'stripe.com',
]);

/**
 * Public suffixes with two labels. Not the full PSL — only the ones plausible
 * for a billing sender, so `123-reg.co.uk` survives extraction.
 */
const TWO_LABEL_SUFFIXES = new Set([
  'ac.uk',
  'co.at',
  'co.il',
  'co.in',
  'co.jp',
  'co.kr',
  'co.nz',
  'co.uk',
  'co.za',
  'com.au',
  'com.br',
  'com.mx',
  'com.sg',
  'gov.uk',
  'net.au',
  'org.uk',
]);

/**
 * Vendors whose logo domain cannot be derived from the sender. Keyed by the
 * normalized service name. Add a row here when a vendor bills through a relay.
 */
const VENDOR_DOMAINS: Record<string, string> = {
  '123 reg': '123-reg.co.uk',
  'railway corporation': 'railway.app',
  serper: 'serper.dev',
  'volero ai': 'volero.ai',
};

/** Lowercased and collapsed, so 'Google  Cloud ' and 'google cloud' agree. */
export function normalizeVendor(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Strips subdomains down to the registrable domain, respecting two-label suffixes. */
export function registrableDomain(host: string): string | undefined {
  const labels = host.trim().toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length < 2) return undefined;
  const lastTwo = labels.slice(-2).join('.');
  if (TWO_LABEL_SUFFIXES.has(lastTwo)) {
    return labels.length >= 3 ? labels.slice(-3).join('.') : undefined;
  }
  return lastTwo;
}

/**
 * The domain to fetch a logo from, or undefined when the sender is a relay and
 * no override names the real vendor — in that case the caller falls back to a
 * monogram rather than showing the wrong company's mark.
 */
export function logoDomainFor(serviceName: string, senderAddress: string): string | undefined {
  const override = VENDOR_DOMAINS[normalizeVendor(serviceName)];
  if (override) return override;

  const at = senderAddress.lastIndexOf('@');
  if (at === -1) return undefined;
  const domain = registrableDomain(senderAddress.slice(at + 1));
  if (!domain || RELAY_DOMAINS.has(domain)) return undefined;
  return domain;
}
