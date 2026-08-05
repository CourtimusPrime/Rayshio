import googleMark from '@lobehub/icons-static-svg/icons/google-color.svg?raw';
import { useState } from 'react';
import { authClient } from '../api/authClient';
import { ErrorNote } from '../components/states';

/**
 * The official four-colour G, already a dependency — `serviceIcons.ts` imports
 * the same asset — so this needs no new file and no network request.
 *
 * It sits on `bg-surface` rather than the teal accent on purpose. Google's
 * brand guidelines require the mark on a neutral surface, which is why the
 * header CTA stays accent-coloured and links here instead of carrying the mark
 * itself.
 */
export function GoogleButton({
  label,
  next = '/',
  className = '',
  block = false,
}: {
  label: string;
  next?: string;
  className?: string;
  /** Fill the container, as on the sign-in card. Sized to its label otherwise. */
  block?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  /**
   * Failure has to be visible. `signIn.social` reports a refused sign-in by
   * *returning* an error rather than throwing, so a bare `.catch()` swallows
   * the common cases entirely — an unconfigured provider, or a server that
   * never mounted the auth handler, both left the button silently resetting
   * itself, which reads as "the button is broken" rather than "sign-in is
   * misconfigured".
   */
  async function start() {
    setPending(true);
    setError(undefined);
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: next,
      });
      const failure = (result as { error?: { message?: string } } | undefined)?.error;
      if (failure) {
        setError(failure.message ?? 'Sign-in is unavailable right now.');
        setPending(false);
      }
      // on success the browser is redirecting; leave `pending` set so the
      // button cannot be clicked twice during the hand-off
    } catch {
      setError('Could not reach the sign-in service.');
      setPending(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={pending}
        onClick={() => void start()}
        /* inline-flex, so inside the closing card's `text-center` the button
           centres like text does rather than needing its own layout rule */
        className={`press-lg inline-flex h-11 items-center justify-center gap-2.5 rounded-lg border border-line bg-surface px-5 text-body font-medium text-ink-900 shadow-e1 transition-shadow hover:shadow-e2 disabled:opacity-60 ${block ? 'w-full' : ''}`}
      >
        <span
          aria-hidden="true"
          className="flex h-[18px] w-[18px] items-center justify-center"
          style={{ fontSize: 18 }}
          // build-time asset from the icon package, not user or network content
          dangerouslySetInnerHTML={{ __html: googleMark }}
        />
        {pending ? 'Redirecting…' : label}
      </button>

      {error && (
        <div className="mt-3">
          <ErrorNote message={error} live="assertive" />
        </div>
      )}
    </div>
  );
}
