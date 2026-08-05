import { Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './api/hooks';
import { useMonthPrefetch } from './api/prefetch';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { LoadingBlock } from './components/states';
import { Breakdown } from './pages/Breakdown';
import { Calendar } from './pages/Calendar';
import { Dashboard } from './pages/Dashboard';
import { Invoices } from './pages/Invoices';
import { Login } from './pages/Login';
import { Mcp } from './pages/Mcp';
import { Reports } from './pages/Reports';
import { WorkspaceProvider, useWorkspace } from './state/workspace';
import { useScrollEdge } from './utils/useScrollEdge';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/breakdown': 'Breakdown',
  '/invoices': 'Invoices',
  '/reports': 'Reports',
  '/calendar': 'Calendar',
  '/connect': 'MCP',
};

export function App() {
  const { data, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex min-h-full items-center justify-center bg-canvas p-8">
        <LoadingBlock className="h-32 w-full max-w-sm" />
      </div>
    );
  }

  if (!data?.authenticated) return <Login />;

  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

function Shell() {
  const { pathname } = useLocation();
  const { currency, month, months } = useWorkspace();
  // warm every month in the background so paging between them is instant
  useMonthPrefetch(currency, month, months);
  const { sentinel, atTop } = useScrollEdge();

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
        <TopBar title={titles[pathname] ?? 'Dashboard'} scrolled={!atTop} />
        <main id="main-content" tabIndex={-1} className="flex-1 px-5 py-6 md:px-8 md:py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/breakdown" element={<Breakdown />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/connect" element={<Mcp />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
