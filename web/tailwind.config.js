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
    /*
     * Replaces Tailwind's scale outright rather than extending it. Type is
     * size, leading and tracking as one decision — a size token that does not
     * carry its own leading and tracking is an invitation to pick them ad hoc,
     * which is how this file ended up with ten sizes, six of them arbitrary
     * bracket values. Dropping the default scale also means text-base/lg/xl are
     * simply not classes here: reaching for an untuned size fails visibly.
     *
     * Tracking tightens as size grows and loosens as it shrinks, because
     * letterforms read further apart the larger they get. Body sits near zero.
     */
    fontSize: {
      micro: ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: '0.025em' }],
      caption: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
      /* mono wants looser leading than proportional text at the same size */
      code: ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0em' }],
      footnote: ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '0em' }],
      body: ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '-0.006em' }],
      subhead: ['0.9375rem', { lineHeight: '1.25rem', letterSpacing: '-0.012em' }],
      title3: ['1.0625rem', { lineHeight: '1.375rem', letterSpacing: '-0.018em' }],
      title2: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.021em' }],
      title1: ['1.75rem', { lineHeight: '2rem', letterSpacing: '-0.024em' }],
      display: ['2rem', { lineHeight: '2.25rem', letterSpacing: '-0.028em' }],
      /*
       * The ramp above stops at 32px, which is right for a dense dashboard and
       * wrong for a hero — a marketing headline set at `display` reads as a
       * section title. These three continue the same two curves rather than
       * starting new ones: tracking keeps tightening and leading keeps closing
       * as size grows, and `lede` loosens back out below body for the
       * paragraph under the headline.
       *
       * Used as `text-hero md:text-hero-lg`. Nothing new is needed for section
       * headings — `text-title2` already exists and was unused.
       */
      lede: ['1.0625rem', { lineHeight: '1.75rem', letterSpacing: '-0.014em' }],
      hero: ['2.5rem', { lineHeight: '2.75rem', letterSpacing: '-0.032em' }],
      'hero-lg': ['3.5rem', { lineHeight: '3.75rem', letterSpacing: '-0.036em' }],
    },
    extend: {
      letterSpacing: {
        /*
         * Overrides Tailwind's 0.025em. Only ever paired with uppercase at
         * 11px, which needs materially more tracking than lowercase at the
         * same size — the same size-specific reasoning, applied to case.
         */
        wide: '0.055em',
      },
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
      /*
       * The platform font, not a webfont. It already ships optical sizing,
       * tracking tables and legibility tuning that a downloaded Inter does not
       * — on Apple platforms the four 32px figures get SF Display metrics and
       * the 11px labels get SF Text, automatically. It also removes a
       * render-blocking cross-origin @import from the critical path.
       */
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          'system-ui',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          '"SF Mono"',
          'Menlo',
          'Monaco',
          '"Cascadia Mono"',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
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
