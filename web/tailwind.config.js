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
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
};
