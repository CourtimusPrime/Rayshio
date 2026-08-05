import { LockIcon } from 'lucide-react';
import { useState } from 'react';
import { useLogin } from '../api/hooks';
import { ErrorNote } from '../components/states';

/** Not in the design — built from its card, accent and typography vocabulary. */
export function Login() {
  const [password, setPassword] = useState('');
  const login = useLogin();

  return (
    <main className="flex min-h-full items-center justify-center bg-canvas px-5 py-12">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate(password);
        }}
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-card"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-footnote font-semibold text-canvas">
            iM
          </span>
          <span className="text-subhead font-semibold text-ink-900">InvoiceMCP</span>
        </div>

        <h1 className="mt-5 text-body font-medium text-ink-900">Sign in to your dashboard</h1>
        <p className="mt-1 text-caption text-ink-500">
          This workspace is protected by a shared password.
        </p>

        <label className="mt-5 block">
          <span className="text-footnote text-ink-700">Password</span>
          <div className="relative mt-1.5">
            <LockIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              strokeWidth={1.75}
            />
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-body text-ink-900 focus:border-line-strong focus:bg-surface"
            />
          </div>
        </label>

        {login.error && (
          <div className="mt-4">
            <ErrorNote message={(login.error as Error).message} />
          </div>
        )}

        <button
          type="submit"
          disabled={login.isPending || password === ''}
          className="press-lg mt-5 h-10 w-full rounded-lg bg-accent text-footnote font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
