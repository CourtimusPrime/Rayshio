/**
 * Palette, shadows and radii from the Magic Patterns design.
 *
 * Colours resolve to CSS variables rather than literals so a theme swap is one
 * class on <html> instead of a `dark:` variant on every element. The light
 * values in index.css are the design's originals, unchanged.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          strong: 'var(--accent-strong)',
        },
        ink: {
          900: 'var(--ink-900)',
          700: 'var(--ink-700)',
          500: 'var(--ink-500)',
          400: 'var(--ink-400)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        canvas: 'var(--canvas)',
        /** Card and header background — `bg-white` in the original design. */
        surface: 'var(--surface)',
        /** Status tints, so badges stay legible in both themes. */
        warn: { soft: 'var(--warn-soft)', text: 'var(--warn-text)', solid: 'var(--warn-solid)' },
        danger: {
          soft: 'var(--danger-soft)',
          text: 'var(--danger-text)',
          solid: 'var(--danger-solid)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
};
