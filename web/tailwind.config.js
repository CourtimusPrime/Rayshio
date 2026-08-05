/**
 * Palette, shadows and radii from the Magic Patterns design.
 *
 * Colours resolve to CSS variables rather than literals so a theme swap is one
 * class on <html> instead of a `dark:` variant on every element. The light
 * values in index.css are the design's originals, unchanged.
 *
 * Each variable holds an sRGB channel triplet, wrapped here as
 * `rgb(var(--x) / <alpha-value>)`. Tailwind substitutes 1 for `<alpha-value>`
 * when there is no modifier and the modifier otherwise, so opacity modifiers
 * compose. A bare `var(--x)` colour cannot: Tailwind emits it verbatim and the
 * alpha is silently discarded.
 */

/** Every palette entry is declared the same way; this keeps that honest. */
const token = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: token('--accent'),
          soft: token('--accent-soft'),
          strong: token('--accent-strong'),
        },
        ink: {
          900: token('--ink-900'),
          700: token('--ink-700'),
          500: token('--ink-500'),
          400: token('--ink-400'),
        },
        line: {
          DEFAULT: token('--line'),
          strong: token('--line-strong'),
        },
        canvas: token('--canvas'),
        /** Card and header background — `bg-white` in the original design. */
        surface: token('--surface'),
        /** Status tints, so badges stay legible in both themes. */
        warn: {
          soft: token('--warn-soft'),
          text: token('--warn-text'),
          solid: token('--warn-solid'),
        },
        danger: {
          soft: token('--danger-soft'),
          text: token('--danger-text'),
          solid: token('--danger-solid'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        e1: 'var(--shadow-e1)',
        e2: 'var(--shadow-e2)',
        e3: 'var(--shadow-e3)',
        e4: 'var(--shadow-e4)',
        edge: 'var(--shadow-edge)',
        /*
         * Aliases onto the new ramp. The design only ever had two levels, and
         * every one of its 25 call sites means "a card" or "the drawer" — so
         * they map cleanly and deepen without a find-and-replace.
         */
        card: 'var(--shadow-e1)',
        pop: 'var(--shadow-e4)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
      },
      zIndex: {
        raised: 'var(--z-raised)',
        sidebar: 'var(--z-sidebar)',
        chrome: 'var(--z-chrome)',
        scrim: 'var(--z-scrim)',
        sheet: 'var(--z-sheet)',
        popover: 'var(--z-popover)',
        toast: 'var(--z-toast)',
      },
      transitionTimingFunction: {
        apple: 'var(--ease-out-apple)',
        'apple-in-out': 'var(--ease-in-out-apple)',
      },
    },
  },
};
