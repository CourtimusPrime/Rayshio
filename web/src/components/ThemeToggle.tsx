import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from '../state/theme';
import type { ThemePreference } from '../state/theme';

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: MonitorIcon },
];

/**
 * Three explicit choices rather than a two-state switch: with a plain toggle
 * there is no way back to following the OS once you have touched it.
 */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-lg border border-line bg-canvas p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={`flex h-7 flex-1 items-center justify-center rounded-md transition-colors ${
              active
                ? 'bg-surface text-ink-900 shadow-card'
                : 'text-ink-400 hover:text-ink-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}
