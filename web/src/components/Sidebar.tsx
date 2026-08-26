import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { type ComponentType, type FocusEvent, type RefAttributes, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useMotionPrefs } from '../motion/useMotionPrefs';
import { OrgSettingsModal } from './OrgSettingsModal';
import { ThemeToggle } from './ThemeToggle';
import { Wordmark } from './Wordmark';
import { ChartPieAnimated } from './icons/ChartPieAnimated';
import { FileChartLineAnimated } from './icons/FileChartLineAnimated';
import { HandCoinsAnimated } from './icons/HandCoinsAnimated';
import { LayoutGridAnimated } from './icons/LayoutGridAnimated';
import { ReceiptTextAnimated } from './icons/ReceiptTextAnimated';
import { SettingsAnimated } from './icons/SettingsAnimated';
import { TerminalAnimated } from './icons/TerminalAnimated';
import type { AnimatedIconHandle } from './icons/handle';

/**
 * A nav icon is either a plain Lucide glyph or one that plays on hover.
 *
 * Both are called the same way — `className` and `strokeWidth` — so the only
 * thing the tab needs to know is whether to keep a ref and fire it, which
 * `animated` says. Animating another tab is one entry in the list below plus
 * the icon component; the tab itself does not change.
 */
type IconProps = { className?: string; strokeWidth?: number };
type AnimatedIcon = ComponentType<IconProps & RefAttributes<AnimatedIconHandle>>;

/*
 * A discriminated union rather than one optional flag: `animated: true` is what
 * makes the icon's type the one that accepts a handle ref. With a single `icon`
 * type wide enough for both, passing a ref to a plain Lucide glyph would
 * typecheck and then hand back an SVG element with no `play` on it.
 */
type NavItem = { to: string; label: string; end: boolean } & (
  | { icon: LucideIcon; animated?: false }
  | { icon: AnimatedIcon; animated: true }
);

const items: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutGridAnimated, end: true, animated: true },
  { to: '/breakdown', label: 'Breakdown', icon: ChartPieAnimated, end: false, animated: true },
  { to: '/invoices', label: 'Invoices', icon: ReceiptTextAnimated, end: false, animated: true },
  { to: '/reports', label: 'Reports', icon: FileChartLineAnimated, end: false, animated: true },
  { to: '/accountant', label: 'Accountant', icon: HandCoinsAnimated, end: false, animated: true },
  // '/connect', not '/mcp': the MCP protocol endpoint owns /mcp, and a direct
  // load of that path must reach the JSON-RPC handler, not the dashboard
  { to: '/connect', label: 'MCP', icon: TerminalAnimated, end: false, animated: true },
];

export function Sidebar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsIcon = useRef<AnimatedIconHandle>(null);
  const prefs = useMotionPrefs();

  return (
    <aside className="material-rail relative z-sidebar flex w-full shrink-0 flex-col md:h-full md:w-60">
      <div className="px-5 py-5">
        <Wordmark />
      </div>

      <nav aria-label="Main" className="px-3">
        {/* a horizontal scroller below md; needs a tab stop to be keyboard-scrollable */}
        <ul tabIndex={0} className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {items.map((item) => (
            <SidebarTab key={item.to} item={item} prefs={prefs} />
          ))}
        </ul>
      </nav>

      <div className="mt-auto space-y-3 px-4 pb-4 md:pb-5">
        {/* org-level configuration: default currency, fiscal year, department mode */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          onMouseEnter={() => settingsIcon.current?.play()}
          onFocus={(event) => {
            // See SidebarTab: a click focuses the button, and replaying the cog
            // as the modal opens reads as the modal animating, not the icon.
            if (event.target.matches(':focus-visible')) settingsIcon.current?.play();
          }}
          className="press-row flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-body text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900"
        >
          <SettingsAnimated
            ref={settingsIcon}
            className="h-4 w-4 text-ink-400"
            strokeWidth={1.75}
          />
          Settings
        </button>
        <ThemeToggle />
      </div>

      <OrgSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}

/**
 * One nav tab.
 *
 * A component rather than JSX inside the map because of the ref: hooks cannot
 * be called in a loop body, and the hover animation needs somewhere per-tab to
 * keep its handle. The mouse listener sits on the link, not the icon, so the
 * whole row is the target — hovering the label plays it too, which is what
 * "hovering the tab" means to anyone using it.
 */
function SidebarTab({
  item,
  prefs,
}: {
  item: NavItem;
  prefs: ReturnType<typeof useMotionPrefs>;
}) {
  const { to, label, end } = item;
  const iconRef = useRef<AnimatedIconHandle>(null);
  const play = item.animated ? () => iconRef.current?.play() : undefined;

  /*
   * Hover plays it; clicking must not.
   *
   * `onFocus` alone would, because clicking a link focuses it — so the icon
   * replayed on every navigation, competing with the page transition for
   * attention at exactly the moment the user has stopped looking at the rail.
   * `:focus-visible` is the browser's own answer to "did this focus come from
   * the keyboard": false for a pointer click, true for Tab. So keyboard users
   * still get the same feedback and a click gets none.
   */
  const playOnKeyboardFocus = play
    ? (event: FocusEvent<HTMLAnchorElement>) => {
        if (event.target.matches(':focus-visible')) play();
      }
    : undefined;

  return (
    <li>
      <NavLink
        to={to}
        end={end}
        onMouseEnter={play}
        onFocus={playOnKeyboardFocus}
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
              The active background is its own element rather than a class on
              the link, which is what lets it travel.

              A shared `layoutId` makes Motion treat the pill leaving one tab
              and the pill arriving at the next as the same object, so it
              interpolates between the two positions instead of disappearing
              and reappearing. As a class the highlight could only ever cut.

              Dropped entirely under reduced motion — without a layoutId there
              is nothing to match against, so it simply appears on the new tab.
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
              absolutely-positioned sibling, and a positioned element otherwise
              paints over in-flow content regardless of source order — the
              label would sit behind its own highlight.
            */}
            <span className="relative flex items-center gap-2.5">
              {item.animated ? (
                <item.icon
                  ref={iconRef}
                  className={`h-4 w-4 ${isActive ? 'text-accent' : 'text-ink-400'}`}
                  strokeWidth={1.75}
                />
              ) : (
                <item.icon
                  className={`h-4 w-4 ${isActive ? 'text-accent' : 'text-ink-400'}`}
                  strokeWidth={1.75}
                />
              )}
              {label}
            </span>
          </>
        )}
      </NavLink>
    </li>
  );
}
