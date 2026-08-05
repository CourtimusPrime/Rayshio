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
import type { ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Also read by the pre-paint script in index.html — keep the two in step. */
const STORAGE_KEY = 'invoicemcp.theme';

/** How long the one-shot colour cross-fade below runs for. */
const THEME_FADE_MS = 260;

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

  const isFirstRun = useRef(true);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;

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
  }, [theme]);

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

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
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
