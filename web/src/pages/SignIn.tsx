import { Link, useSearchParams } from 'react-router-dom';
import { ErrorNote } from '../components/states';
import { Wordmark } from '../components/Wordmark';
import { GoogleButton } from '../marketing/GoogleButton';
import { SIGN_IN } from '../marketing/copy';
import { safeNext } from '../routes';
import { useNoindex } from '../utils/useNoindex';

/**
 * Replaces the shared-password card. Same card, accent and type vocabulary —
 * only the mechanism changed.
 *
 * Better Auth redirects back here with `?error=...` when a sign-in is refused,
 * which is what the allowlist rejection surfaces as. Distinguishing the two
 * common cases matters: "you are not on the list" and "you are on the list but
 * have no workspace" need different next actions from the reader.
 */
export function SignIn() {
  useNoindex();
  const [params] = useSearchParams();

  const next = safeNext(params.get('next'));
  const error = params.get('error');

  const message = (() => {
    if (!error) return undefined;
    if (error === 'no_workspace') return SIGN_IN.noWorkspace;
    // Better Auth reports the thrown APIError as a forbidden/denied variant
    if (/forbidden|denied|not_allowed|signup/i.test(error)) return SIGN_IN.notAllowed;
    return SIGN_IN.failed;
  })();

  return (
    <main className="flex min-h-full items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-card">
        <Link to="/" aria-label="Rayshio home">
          <Wordmark />
        </Link>

        <h1 className="mt-5 text-title3 font-semibold text-ink-900">{SIGN_IN.title}</h1>
        <p className="mt-1.5 text-caption text-ink-500">{SIGN_IN.subtitle}</p>

        {message && (
          <div className="mt-4">
            <ErrorNote message={message} />
          </div>
        )}

        <GoogleButton label={SIGN_IN.cta} next={next} className="mt-6 w-full" />
      </div>
    </main>
  );
}
