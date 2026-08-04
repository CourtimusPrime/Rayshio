import {
  CalendarIcon,
  FileBarChartIcon,
  LayoutDashboardIcon,
  PieChartIcon,
  ReceiptIcon,
  TerminalIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useWorkspace } from '../state/workspace';
import { ThemeToggle } from './ThemeToggle';

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboardIcon, end: true },
  { to: '/breakdown', label: 'Breakdown', icon: PieChartIcon, end: false },
  { to: '/invoices', label: 'Invoices', icon: ReceiptIcon, end: false },
  { to: '/reports', label: 'Reports', icon: FileBarChartIcon, end: false },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon, end: false },
  // '/connect', not '/mcp': the MCP protocol endpoint owns /mcp, and a direct
  // load of that path must reach the JSON-RPC handler, not the dashboard
  { to: '/connect', label: 'MCP', icon: TerminalIcon, end: false },
];

export function Sidebar() {
  const { meta } = useWorkspace();
  const endpoint = meta?.mcp_endpoint.replace(/^https?:\/\//, '');

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-line bg-surface md:h-full md:w-60 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-[13px] font-semibold text-canvas">
          iM
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-ink-900">InvoiceMCP</span>
      </div>

      <nav aria-label="Main" className="px-3">
        <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {items.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-accent-soft font-medium text-accent-strong'
                      : 'text-ink-500 hover:bg-canvas hover:text-ink-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`h-4 w-4 ${isActive ? 'text-accent' : 'text-ink-400'}`}
                      strokeWidth={1.75}
                    />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto space-y-3 px-4 pb-4 md:pb-5">
        {/* the endpoint card is desktop-only for space; the toggle is not */}
        <div className="hidden rounded-xl border border-line bg-canvas p-3.5 md:block">
          <div className="flex items-center gap-2">
            <TerminalIcon className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} />
            <span className="text-xs font-medium text-ink-900">MCP server</span>
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          </div>
          <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-ink-500">
            {endpoint ?? '—'}
          </p>
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}
