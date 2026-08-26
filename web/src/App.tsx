import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './api/hooks';
import { useMonthPrefetch } from './api/prefetch';
import { RouteSkeleton } from './components/RouteSkeleton';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { UploadToast } from './components/UploadToast';
import { LoadingBlock } from './components/states';
import { Landing } from './pages/Landing';
import { NoWorkspace } from './pages/NoWorkspace';
import { SignIn } from './pages/SignIn';

/*
 * The signed-in routes load on demand; the public ones do not.
 *
 * Everything used to ship in one 907 kB chunk, which meant a first-time visitor
 * downloaded Recharts, Framer Motion and every dashboard page before the
 * landing headline could paint — for a page that renders none of it. Landing,
 * SignIn and NoWorkspace stay eager because they *are* the first paint.
 *
 * These pages use named exports, so each import is mapped to a default here
 * rather than changing eleven files to satisfy `lazy`.
 */
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Breakdown = lazy(() => import('./pages/Breakdown').then((m) => ({ default: m.Breakdown })));
const Invoices = lazy(() => import('./pages/Invoices').then((m) => ({ default: m.Invoices })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const Accountant = lazy(() =>
  import('./pages/Accountant').then((m) => ({ default: m.Accountant })),
);
const Mcp = lazy(() => import('./pages/Mcp').then((m) => ({ default: m.Mcp })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));
const Privacy = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Terms })));
import { APP_TITLES, isAppPath } from './routes';
import { ServiceEditorProvider } from './state/serviceEditor';
import { UploadsProvider } from './state/uploads';
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

  /*
   * `pending` is a signed-in account that belongs to no workspace — the state
   * every new registration starts in. Falling through to PublicRoutes here
   * would render the marketing page at someone who just signed in
   * successfully, so they would try again, and again.
   */
  if (data?.pending) return <NoWorkspace />;

  if (!data?.authenticated) return <PublicRoutes />;

  return (
    <WorkspaceProvider>
      {/* Inside the signed-in tree and outside the router, so a batch started
          on /invoices keeps reporting after the page that started it unmounts. */}
      <UploadsProvider>
        {/* Inside WorkspaceProvider because it reads meta, and inside the
            authenticated tree because its absence is what keeps vendor logos
            inert on the signed-out marketing page. */}
        <ServiceEditorProvider>
          <Shell />
          <UploadToast />
        </ServiceEditorProvider>
      </UploadsProvider>
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
    /* Legal and NotFound are lazy here too, so this needs its own boundary —
       without it a signed-out visitor on /privacy throws rather than renders. */
    <Suspense fallback={<div className="min-h-full bg-canvas" />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<SignedOutFallback />} />
      </Routes>
    </Suspense>
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
        /* overscroll-contain: reaching the end of this scroller must not hand
           the gesture to the document behind it, or the whole shell drifts */
        className="flex min-w-0 flex-1 flex-col overscroll-contain bg-canvas md:h-full md:overflow-y-auto"
      >
        {/* 1px so it has a real box for the observer, negative-margined back so
            it costs no layout and leaves no strip above the bar */}
        <div ref={sentinel} aria-hidden="true" className="-mb-px h-px shrink-0" />
        <TopBar
          title={APP_TITLES[pathname] ?? 'Dashboard'}
          scrolled={!atTop}
          /*
            Reports drives its own fiscal period, and Accountant is scoped by
            what has been sent rather than by a month — a month picker above
            either one would appear to filter a figure it has no effect on.
          */
          showMonthNav={pathname !== '/reports' && pathname !== '/accountant'}
        />
        <main id="main-content" tabIndex={-1} className="flex-1 px-5 py-6 md:px-8 md:py-8">
          {/*
            The fallback traces the arriving page's own layout rather than
            being one generic block. It still keeps the scroller from
            collapsing — which is why the old block existed — but it no longer
            resizes when the real page lands, and it tells the user which tab
            they are waiting on.

            Keyed on pathname so React tears the old skeleton down and builds
            the new one when the route changes mid-flight; without the key a
            fast second navigation keeps showing the first tab's shape.
          */}
          <Suspense fallback={<RouteSkeleton key={pathname} pathname={pathname} />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/breakdown" element={<Breakdown />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/accountant" element={<Accountant />} />
              <Route path="/connect" element={<Mcp />} />
              {/* arriving at /signin while signed in: there is nothing to sign into */}
              <Route path="/signin" element={<Navigate replace to="/" />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              {/* a real 404 — this used to render the dashboard for any typo */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
