import { Link } from 'react-router-dom';
import { Wordmark } from '../components/Wordmark';
import { NOT_FOUND } from '../marketing/copy';
import { useNoindex } from '../utils/useNoindex';

/**
 * A real 404, replacing the `<Route path="*" element={<Dashboard/>} />` that
 * used to render the dashboard for every unknown URL — which made a typo look
 * like a working page and made the address bar lie.
 */
export function NotFound() {
  useNoindex();

  return (
    <main className="flex min-h-full items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-sm text-center">
        <Link to="/" aria-label="Rayshio home" className="inline-flex">
          <Wordmark />
        </Link>
        <h1 className="mt-6 text-title2 font-semibold text-ink-900">{NOT_FOUND.title}</h1>
        <p className="mt-2 text-body text-ink-500">{NOT_FOUND.body}</p>
        <Link
          to="/"
          className="press mt-6 inline-flex h-10 items-center rounded-lg bg-accent px-4 text-footnote font-medium text-white transition-colors hover:bg-accent-strong"
        >
          {NOT_FOUND.cta}
        </Link>
      </div>
    </main>
  );
}
