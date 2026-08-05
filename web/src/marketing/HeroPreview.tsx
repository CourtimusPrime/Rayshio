import { ServiceLogo } from '../components/ServiceLogo';
import { PREVIEW_NOTE } from './copy';

/**
 * A still of the dashboard, built from the app's own card vocabulary rather
 * than a screenshot — so it stays correct when the palette or the type ramp
 * moves, and so it renders sharp at any density.
 *
 * The vendors are names `serviceIcons.ts` covers with a build-time brand mark,
 * and `allowFetch={false}` enforces that rather than trusting it. `ServiceLogo`
 * otherwise falls back to `/api/logo/:service`, which is behind `requireAuth` —
 * an unrecognised vendor here would make a signed-out visitor fire an
 * authenticated request and log a 401 on the marketing page.
 *
 * The spelling matters and the failure is silent: 'Railway' does *not* match,
 * because the icon set's key is 'railway corporation'.
 */

const VENDORS = [
  { name: 'Anthropic', amount: '$412.00' },
  { name: 'Cloudflare', amount: '$186.40' },
  { name: 'OpenRouter', amount: '$91.00' },
];

const TREND = [38, 52, 47, 64, 71, 88];

export function HeroPreview() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-e3">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-micro font-medium uppercase tracking-wide text-ink-400">
            July spend
          </p>
          <p className="mt-1 text-display font-semibold text-ink-900">$689.40</p>
        </div>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-micro font-medium text-accent-strong">
          +12.4%
        </span>
      </div>

      {/* the same six-month trend the dashboard's summary card shows */}
      <div className="mt-5 flex h-16 items-end gap-1.5" aria-hidden="true">
        {TREND.map((height, i) => (
          <div
            key={`${height}-${i}`}
            className={`flex-1 rounded-sm ${i === TREND.length - 1 ? 'bg-accent' : 'bg-accent-soft'}`}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>

      <div className="mt-5 space-y-3 border-t border-line pt-4">
        {VENDORS.map((vendor) => (
          <div key={vendor.name} className="flex items-center gap-3">
            <ServiceLogo name={vendor.name} allowFetch={false} />
            <span className="min-w-0 flex-1 truncate text-body text-ink-900">{vendor.name}</span>
            <span className="font-mono text-caption text-ink-500">{vendor.amount}</span>
          </div>
        ))}
      </div>

      {/* matches ConversionNote's honesty about figures the reader cannot check */}
      <p className="mt-4 text-micro text-ink-400">{PREVIEW_NOTE}</p>
    </div>
  );
}
