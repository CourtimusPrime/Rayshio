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

interface ThemeValue {
  /** What the user chose, including 'system'. */
  preference: ThemePreference;
  /** What is actually rendered right now. */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Cycles light → dark → system. */
  cycle: () => void;
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
  const isFirstRun = useRef(true);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;

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
    () => ({ preference, theme, setPreference, cycle }),
    [preference, theme, setPreference, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

/**
 * Recharts takes colours as props, not classes, so it cannot read the CSS
 * variables the rest of the UI uses. These mirror the two palettes in index.css
 * — keep them in step when either changes.
 */
export function useChartColors() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  return useMemo(
    () => ({
      accent: dark ? '#2aa79b' : '#0f766e',
      barMuted: dark ? '#1f4d48' : '#cfe4e2',
      grid: dark ? '#26262c' : '#f2f2f5',
      cursor: dark ? '#1e1e24' : '#fafafa',
      axisTick: dark ? '#74747d' : '#9b9ba3',
      labelTick: dark ? '#9a9aa3' : '#71717a',
      tooltip: {
        borderRadius: 10,
        border: `1px solid ${dark ? '#33333b' : '#ececf0'}`,
        background: dark ? '#17171b' : '#ffffff',
        color: dark ? '#f2f2f4' : '#1c1c20',
        boxShadow: dark ? '0 6px 24px rgba(0,0,0,0.5)' : '0 6px 24px rgba(24,24,28,0.08)',
        fontSize: 12,
      } as const,
    }),
    [dark],
  );
}
