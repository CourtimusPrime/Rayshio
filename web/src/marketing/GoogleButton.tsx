import googleMark from '@lobehub/icons-static-svg/icons/google-color.svg?raw';
import { useState } from 'react';
import { authClient } from '../api/authClient';

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
}: {
  label: string;
  next?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void authClient.signIn
          .social({ provider: 'google', callbackURL: next })
          // the redirect normally ends this page's life; if it fails, the
          // button has to become usable again rather than staying spent
          .catch(() => setPending(false));
      }}
      className={`press-lg inline-flex h-11 items-center justify-center gap-2.5 rounded-lg border border-line bg-surface px-5 text-body font-medium text-ink-900 shadow-e1 transition-shadow hover:shadow-e2 disabled:opacity-60 ${className}`}
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
  );
}
