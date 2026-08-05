import { useLogout } from '../api/hooks';
import { Wordmark } from '../components/Wordmark';
import { SIGN_IN } from '../marketing/copy';
import { useNoindex } from '../utils/useNoindex';

/**
 * Where a brand-new account lands.
 *
 * Signing in and being granted access to a workspace are separate acts —
 * deliberately, so nobody inherits a tenant by being first through the door.
 * That leaves a real state in between, and it needs a page: without one the
 * app treats "signed in, no workspace" as "signed out" and renders the
 * marketing page, so a successful sign-in looks like a failed one and the user
 * loops through Google forever.
 */
export function NoWorkspace() {
  useNoindex();
  const logout = useLogout();

  return (
    <main className="flex min-h-full items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-card">
        <Wordmark />

        <h1 className="mt-5 text-title3 font-semibold text-ink-900">You're signed in</h1>
        <p className="mt-2 text-body text-ink-500">{SIGN_IN.noWorkspace}</p>

        <p className="mt-4 rounded-lg bg-canvas px-3.5 py-3 text-footnote text-ink-500 ring-1 ring-line">
          Your account exists, but it is not attached to any workspace yet, so there is nothing to
          show. An owner can add you — after that, reload this page.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="press h-10 rounded-lg bg-accent px-4 text-footnote font-medium text-white transition-colors hover:bg-accent-strong"
          >
            Reload
          </button>
          <button
            type="button"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
            className="press h-10 rounded-lg border border-line px-4 text-footnote font-medium text-ink-700 transition-colors hover:bg-canvas disabled:opacity-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
