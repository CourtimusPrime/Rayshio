import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import type { ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Also read by the pre-paint script in index.html — keep the two in step. */
const STORAGE_KEY = 'invoicemcp.theme';

/** How long the one-shot colour cross-fade below runs for. */
const THEME_FADE_MS = 260;

/**
 * The curtain: one sweep down to cover, the palette swaps behind it, one sweep
 * up to reveal. Each leg runs for this long, so a flip costs twice it.
 *
 * 380 rather than the 550 the reference used. A theme toggle is a control
 * someone may hit twice in a row to compare, and 1.1s of blackout each way
 * turns comparing into waiting.
 */
const CURTAIN_MS = 380;

/** The reference's easing: slow in, fast through, slow out — a real sweep. */
const CURTAIN_EASE = 'cubic-bezier(0.76, 0, 0.24, 1)';

type CurtainPhase = 'falling' | 'rising';

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * The incoming theme's canvas colour, read from the non-inverting tokens so the
 * palette is never restated here.
 */
function canvasColour(theme: ResolvedTheme): string {
  const style = getComputedStyle(document.documentElement);
  const raw = style.getPropertyValue(theme === 'dark' ? '--canvas-dark' : '--canvas-light').trim();
  return raw ? `rgb(${raw.split(/\s+/).join(', ')})` : 'transparent';
}

export interface ChartColors {
  accent: string;
  barMuted: string;
  grid: string;
  cursor: string;
  axisTick: string;
  labelTick: string;
  tooltip: {
    borderRadius: number;
    border: string;
    background: string;
    color: string;
    boxShadow: string;
    fontSize: number;
  };
}

interface ThemeValue {
  /** What the user chose, including 'system'. */
  preference: ThemePreference;
  /** What is actually rendered right now. */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Cycles light → dark → system. */
  cycle: () => void;
  /** Resolved from CSS for the current theme; see readChartColors. */
  chart: ChartColors;
}

/**
 * Recharts takes colours as props rather than classes, so it cannot read the
 * CSS variables the rest of the UI uses. Rather than restate the palette in TS
 * — which is how the chart accent silently drifted from the UI accent in dark —
 * read the resolved custom properties back off <html>.
 *
 * One getComputedStyle call, not one per token: it is the expensive half.
 */
function readChartColors(): ChartColors {
  const style = getComputedStyle(document.documentElement);
  /** Palette variables are channel triplets; SVG attributes want a colour. */
  const colour = (name: string) => {
    const raw = style.getPropertyValue(name).trim();
    return raw ? `rgb(${raw.split(/\s+/).join(', ')})` : 'transparent';
  };

  return {
    accent: colour('--chart-accent'),
    barMuted: colour('--chart-bar-muted'),
    grid: colour('--chart-grid'),
    cursor: colour('--chart-cursor'),
    axisTick: colour('--chart-axis'),
    labelTick: colour('--chart-tick'),
    tooltip: {
      borderRadius: Number.parseInt(style.getPropertyValue('--radius-lg'), 10) || 10,
      border: `1px solid ${colour('--line-strong')}`,
      background: colour('--surface'),
      color: colour('--ink-900'),
      boxShadow: style.getPropertyValue('--shadow-e3').trim(),
      fontSize: 12,
    },
  };
}

const ThemeContext = createContext<ThemeValue | null>(null);

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStored(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  // following the OS is only meaningful if we react when the OS changes
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const onChange = () => setSystem(media.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const theme: ResolvedTheme = preference === 'system' ? system : preference;

  /*
   * The whole palette hangs off this one class (see index.css).
   *
   * Layout effect, not effect: the class has to be on <html> before paint, and
   * before anything reads a resolved custom property off it.
   *
   * Flipping theme swaps every colour in the app at once, which is an abrupt
   * brightness change. A blanket transition would make every hover feel laggy,
   * so instead an attribute turns one on for the length of the flip and takes
   * it off again. The first run is skipped — that is the pre-paint script's
   * class being confirmed, not a change the user made.
   */
  const [chart, setChart] = useState<ChartColors>(readChartColors);

  /*
   * `applied` is the theme actually on <html>, which lags `theme` for exactly
   * as long as the curtain takes to cover the screen. Without the second piece
   * of state the palette would swap while the curtain was still falling, which
   * is the one frame the whole effect exists to hide.
   */
  const [applied, setApplied] = useState<ResolvedTheme>(theme);
  const [curtain, setCurtain] = useState<{ phase: CurtainPhase; colour: string } | null>(null);

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current || theme === applied) return;

    // Reduced motion keeps the cross-fade and skips the sweep entirely: a
    // full-screen wipe is exactly the kind of large-area movement the
    // preference is asking us not to make.
    if (prefersReducedMotion()) {
      setApplied(theme);
      return;
    }

    /*
     * A view transition when the browser has one.
     *
     * The curtain below covers the app, swaps the palette behind itself and
     * uncovers — which means there is a moment where the screen is a blank
     * panel and the content is gone. A view transition instead snapshots the
     * page before and after, so the wipe reveals the *new theme over the old
     * one*: both are real content and nothing is ever hidden.
     *
     * `flushSync` is required, not stylistic. startViewTransition captures the
     * "after" state when its callback returns, and a normal React setState is
     * asynchronous — the callback would return before the DOM changed and the
     * transition would capture two identical frames.
     */
    const startViewTransition = (
      document as Document & {
        startViewTransition?: (cb: () => void) => { finished: Promise<void> };
      }
    ).startViewTransition;

    if (typeof startViewTransition === 'function') {
      startViewTransition.call(document, () => {
        flushSync(() => setApplied(theme));
      });
      return;
    }

    setCurtain({ phase: 'falling', colour: canvasColour(theme) });
    const cover = window.setTimeout(() => {
      setApplied(theme);
      setCurtain((c) => (c ? { ...c, phase: 'rising' } : c));
    }, CURTAIN_MS);

    return () => window.clearTimeout(cover);
  }, [theme, applied]);

  // Cleared on its own timer so a flip back mid-rise restarts cleanly rather
  // than leaving a half-raised curtain pinned over the app.
  useEffect(() => {
    if (curtain?.phase !== 'rising') return;
    const done = window.setTimeout(() => setCurtain(null), CURTAIN_MS + 40);
    return () => window.clearTimeout(done);
  }, [curtain?.phase]);

  /*
   * The whole palette hangs off this one class (see index.css).
   *
   * Layout effect, not effect: the class has to be on <html> before paint, and
   * before anything reads a resolved custom property off it.
   *
   * Flipping theme swaps every colour in the app at once, which is an abrupt
   * brightness change. A blanket transition would make every hover feel laggy,
   * so instead an attribute turns one on for the length of the flip and takes
   * it off again. The first run is skipped — that is the pre-paint script's
   * class being confirmed, not a change the user made.
   */
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', applied === 'dark');
    root.style.colorScheme = applied;

    // after the class, so the resolved values are the new theme's. A state
    // update inside a layout effect re-renders before paint, so the charts
    // never draw a frame with the old palette.
    setChart(readChartColors());

    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    root.setAttribute('data-theme-transition', '');
    const timer = window.setTimeout(
      () => root.removeAttribute('data-theme-transition'),
      THEME_FADE_MS + 40,
    );
    return () => window.clearTimeout(timer);
  }, [applied]);

  const setPreference = useCallback((next: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, next);
    setPreferenceState(next);
  }, []);

  const cycle = useCallback(() => {
    setPreference(preference === 'light' ? 'dark' : preference === 'dark' ? 'system' : 'light');
  }, [preference, setPreference]);

  const value = useMemo(
    () => ({ preference, theme, setPreference, cycle, chart }),
    [preference, theme, setPreference, cycle, chart],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      {curtain && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: curtain.colour,
            /*
             * Keyframes, not a transition. The element mounts at the moment the
             * fall begins, and a transition cannot animate away from a value
             * the element never held — it would paint fully covered on frame
             * one. An animation carries its own from-state.
             */
            transformOrigin: 'top',
            animation: `${
              curtain.phase === 'falling' ? 'curtain-fall' : 'curtain-rise'
            } ${CURTAIN_MS}ms ${CURTAIN_EASE} forwards`,
            /* above the toast layer, which is the top of the app's z ladder */
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        />
      )}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

/** The chart palette for the current theme, resolved from CSS. */
export function useChartColors(): ChartColors {
  return useTheme().chart;
}
