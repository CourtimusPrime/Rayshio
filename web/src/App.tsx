import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './api/hooks';
import { useMonthPrefetch } from './api/prefetch';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { LoadingBlock } from './components/states';
import { Breakdown } from './pages/Breakdown';
import { Calendar } from './pages/Calendar';
import { Dashboard } from './pages/Dashboard';
import { Invoices } from './pages/Invoices';
import { Landing } from './pages/Landing';
import { Privacy, Terms } from './pages/Legal';
import { Mcp } from './pages/Mcp';
import { NotFound } from './pages/NotFound';
import { Reports } from './pages/Reports';
import { SignIn } from './pages/SignIn';
import { APP_TITLES, isAppPath } from './routes';
import { WorkspaceProvider, useWorkspace } from './state/workspace';
import { useNoindex } from './utils/useNoindex';
import { useScrollEdge } from './utils/useScrollEdge';

export function App() {
  const { data, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex min-h-full items-center justify-center bg-canvas p-8">
        <LoadingBlock className="h-32 w-full max-w-sm" />
      </div>
    );
  }

  if (!data?.authenticated) return <PublicRoutes />;

  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

/**
 * The signed-out route table. It exists at all because the gate used to sit
 * *above* the router, which meant react-router had no unauthenticated routes —
 * every signed-out URL rendered the same login card.
 *
 * `/` is the marketing page here and the dashboard in `Shell`. Making the path
 * polymorphic is what avoids moving the app under `/app`, which would have
 * touched every NavLink, the titles map and every existing bookmark for no
 * gain — and a crawler is always signed out, so `/` is the marketing page for
 * precisely the audience that needs one.
 */
function PublicRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="*" element={<SignedOutFallback />} />
    </Routes>
  );
}

/**
 * A signed-out visitor on an unknown path is one of two people: someone who
 * followed a deep link into the app and should sign in and be returned there,
 * or someone who mistyped. Only the first deserves a redirect — sending every
 * unknown URL to the sign-in page is a dead end dressed up as a login.
 */
function SignedOutFallback() {
  const { pathname, search } = useLocation();
  if (!isAppPath(pathname)) return <NotFound />;
  return <Navigate replace to={`/signin?next=${encodeURIComponent(pathname + search)}`} />;
}

function Shell() {
  const { pathname } = useLocation();
  const { currency, month, months } = useWorkspace();
  // warm every month in the background so paging between them is instant
  useMonthPrefetch(currency, month, months);
  const { sentinel, atTop } = useScrollEdge();
  // the signed-in app has no business in a search index
  useNoindex();

  return (
    <div className="flex min-h-full w-full flex-col bg-surface md:h-full md:flex-row">
      {/* lives here rather than in index.html: the target is React-owned, and
          the six nav links are otherwise in front of the content on every page */}
      <a
        href="#main-content"
        className="skip-link rounded-lg border border-line bg-surface px-3 py-2 text-body font-medium text-ink-900 shadow-e3"
      >
        Skip to content
      </a>
      <Sidebar />

      {/*
        This div, not <main>, is the desktop scroll container. The top bar is a
        translucent material with content passing under it, and sticky only
        resolves against an ancestor scroller — as a sibling of <main> the bar
        could never stick to anything. `bg-canvas` has to live here too, or the
        strip behind the translucent bar shows the shell's surface colour.
      */}
      <div
        data-scroll-container
        className="flex min-w-0 flex-1 flex-col bg-canvas md:h-full md:overflow-y-auto"
      >
        {/* 1px so it has a real box for the observer, negative-margined back so
            it costs no layout and leaves no strip above the bar */}
        <div ref={sentinel} aria-hidden="true" className="-mb-px h-px shrink-0" />
        <TopBar title={APP_TITLES[pathname] ?? 'Dashboard'} scrolled={!atTop} />
        <main id="main-content" tabIndex={-1} className="flex-1 px-5 py-6 md:px-8 md:py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/breakdown" element={<Breakdown />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/connect" element={<Mcp />} />
            {/* arriving at /signin while signed in: there is nothing to sign into */}
            <Route path="/signin" element={<Navigate replace to="/" />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            {/* a real 404 — this used to render the dashboard for any typo */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
