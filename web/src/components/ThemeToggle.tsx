import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useRovingTabIndex } from '../hooks/useRovingTabIndex';
import { useTheme } from '../state/theme';
import type { ThemePreference } from '../state/theme';

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: MonitorIcon },
];

const VALUES = OPTIONS.map((option) => option.value);

/**
 * Three explicit choices rather than a two-state switch: with a plain toggle
 * there is no way back to following the OS once you have touched it.
 */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  // a radiogroup's documented contract is arrow-key navigation with one tab
  // stop; declaring the role without it misleads anyone who knows the pattern
  const { itemProps } = useRovingTabIndex({
    values: VALUES,
    active: preference,
    onActivate: setPreference,
  });

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-1 rounded-lg border border-line bg-canvas p-0.5"
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
            {...itemProps(value)}
            /* grown from h-7 rather than padded: three 28px targets at a 30px
               pitch would have overlapping hit boxes, and .tap-y expands only
               on the axis where there is room */
            className={`press tap-y flex h-9 flex-1 items-center justify-center rounded-md transition-colors ${
              active ? 'bg-surface text-ink-900 shadow-card' : 'text-ink-400 hover:text-ink-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}
