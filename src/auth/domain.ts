/**
 * Email-domain rules for workspace auto-join.
 *
 * The domain a workspace claims is never free text. An admin who could type any
 * domain could claim one they do not hold and absorb its users, so the claim is
 * always derived from the enabling user's own email. That only means something
 * if the email is verified, and if it is not a consumer mailbox: claiming
 * gmail.com would hand every Gmail user to one tenant.
 */

/**
 * Consumer mailbox providers, which no company owns. A false positive here only
 * refuses a claim (the safe direction); a false negative would hand a consumer
 * domain's users to one tenant.
 */
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'aol.com',
  'mail.com',
  'gmx.com',
  'gmx.net',
  'zoho.com',
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'qq.com',
  '163.com',
  'fastmail.com',
  'hey.com',
  'tutanota.com',
  'tuta.io',
]);

/** Providers that sell the same mailbox under many country domains. */
const PUBLIC_FAMILIES: ReadonlySet<string> = new Set([
  'gmx',
  'yahoo',
  'hotmail',
  'outlook',
  'live',
]);

/** Lowercased domain of an address, or undefined when it is not a usable address. */
export function emailDomain(email: string): string | undefined {
  const value = email.trim().toLowerCase();
  if (/\s/.test(value)) return undefined;

  const parts = value.split('@');
  if (parts.length !== 2) return undefined;

  const [local, domain] = parts as [string, string];
  if (local === '') return undefined;

  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) => label === '')) return undefined;
  return domain;
}

export function isPublicEmailDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (PUBLIC_EMAIL_DOMAINS.has(d)) return true;

  const [family, ...rest] = d.split('.');
  return (
    family !== undefined && PUBLIC_FAMILIES.has(family) && (rest.length === 1 || rest.length === 2)
  );
}

export type DomainClaim =
  | { ok: true; domain: string }
  | { ok: false; reason: 'unverified' | 'malformed' | 'public-provider'; domain: string | null };

/**
 * Whether this address may claim its own domain. A public provider is reported
 * ahead of unverified because verifying cannot fix it.
 */
export function claimableDomain(email: string, emailVerified: boolean): DomainClaim {
  const domain = emailDomain(email);
  if (domain === undefined) return { ok: false, reason: 'malformed', domain: null };
  if (isPublicEmailDomain(domain)) return { ok: false, reason: 'public-provider', domain };
  if (!emailVerified) return { ok: false, reason: 'unverified', domain };
  return { ok: true, domain };
}
