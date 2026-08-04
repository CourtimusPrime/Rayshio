/** Palette, shadows and radii are carried over verbatim from the Magic Patterns design. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#0f766e',
          soft: '#e6f2f1',
          strong: '#0b5c56',
        },
        ink: {
          900: '#1c1c20',
          700: '#3f3f46',
          500: '#71717a',
          400: '#9b9ba3',
        },
        line: {
          DEFAULT: '#ececf0',
          strong: '#e0e0e6',
        },
        canvas: '#fbfbfc',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(24, 24, 28, 0.04)',
        pop: '0 6px 24px rgba(24, 24, 28, 0.08)',
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
};
