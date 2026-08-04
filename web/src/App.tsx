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

  return (
    <div className="flex min-h-full w-full flex-col bg-surface md:h-full md:flex-row">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col md:h-full md:overflow-hidden">
        <TopBar title={titles[pathname] ?? 'Dashboard'} />
        <main className="flex-1 bg-canvas px-5 py-6 md:overflow-y-auto md:px-8 md:py-8">
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
