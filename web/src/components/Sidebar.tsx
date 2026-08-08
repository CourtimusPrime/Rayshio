import {
  CalendarIcon,
  FileBarChartIcon,
  LayoutDashboardIcon,
  PieChartIcon,
  ReceiptIcon,
  SearchIcon,
  SettingsIcon,
  TerminalIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMotionPrefs } from '../motion/useMotionPrefs';
import { OrgSettingsModal } from './OrgSettingsModal';
import { ThemeToggle } from './ThemeToggle';
import { Wordmark } from './Wordmark';

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [term, setTerm] = useState('');
  const navigate = useNavigate();
  const prefs = useMotionPrefs();

  return (
    <aside className="material-rail relative z-sidebar flex w-full shrink-0 flex-col md:h-full md:w-60">
      <div className="px-5 py-5">
        <Wordmark />
      </div>

      {/*
        Search sits above the nav rather than in the header. It searches
        invoices specifically — not the page you are on — so it belongs beside
        the thing it navigates to rather than in the chrome of whatever surface
        happens to be open.

        Hidden below md, where the rail collapses to a horizontal strip of tabs
        with no room for a field; the Invoices page carries its own search there.
      */}
      <form
        className="relative hidden px-3 pb-3 md:block"
        onSubmit={(event) => {
          event.preventDefault();
          navigate(term.trim() ? `/invoices?q=${encodeURIComponent(term.trim())}` : '/invoices');
        }}
      >
        <label>
          <span className="sr-only">Search invoices</span>
          <SearchIcon
            className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            strokeWidth={1.75}
          />
          <input
            type="search"
            placeholder="Search invoices"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className="h-9 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-body text-ink-900 placeholder:text-ink-400 focus:border-line-strong focus:bg-surface"
          />
        </label>
      </form>

      <nav aria-label="Main" className="px-3">
        {/* a horizontal scroller below md; needs a tab stop to be keyboard-scrollable */}
        <ul tabIndex={0} className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {items.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `press-row relative flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-body ${
                    isActive
                      ? 'font-medium text-accent-strong'
                      : 'text-ink-500 hover:bg-canvas hover:text-ink-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/*
                      The active background is its own element rather than a
                      class on the link, which is what lets it travel.

                      A shared `layoutId` makes Motion treat the pill leaving
                      one tab and the pill arriving at the next as the same
                      object, so it interpolates between the two positions
                      instead of disappearing and reappearing. As a class the
                      highlight could only ever cut.

                      Dropped entirely under reduced motion — without a
                      layoutId there is nothing to match against, so it simply
                      appears on the new tab.
                    */}
                    {isActive && (
                      <motion.span
                        {...(prefs.reduced ? {} : { layoutId: 'sidebar-active-tab' })}
                        className="absolute inset-0 rounded-lg bg-accent-soft"
                        transition={prefs.spring('quick')}
                      />
                    )}
                    {/*
                      Positioned, so it paints above the pill. The pill is an
                      absolutely-positioned sibling, and a positioned element
                      otherwise paints over in-flow content regardless of
                      source order — the label would sit behind its own
                      highlight.
                    */}
                    <span className="relative flex items-center gap-2.5">
                      <Icon
                        className={`h-4 w-4 ${isActive ? 'text-accent' : 'text-ink-400'}`}
                        strokeWidth={1.75}
                      />
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto space-y-3 px-4 pb-4 md:pb-5">
        {/* org-level configuration: default currency, fiscal year, department mode */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="press-row flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-body text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900"
        >
          <SettingsIcon className="h-4 w-4 text-ink-400" strokeWidth={1.75} />
          Settings
        </button>
        <ThemeToggle />
      </div>

      <OrgSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}
