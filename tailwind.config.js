// Class names for the design tokens of src/styles/tokens.css (the values live there, not here).
const channel = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const steps = [100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const family = (name) => Object.fromEntries(steps.map((step) => [step, channel(`${name}-${step}`)]));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    // Replaces Tailwind's palette: only the tokens exist (plus transparent and currentColor)
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      surface: {
        base: channel('surface-base'),
        header: channel('surface-header'),
        panel: channel('surface-panel'),
        raised: channel('surface-raised'),
        line: channel('surface-line'),
      },
      ink: {
        strong: channel('ink-strong'),
        DEFAULT: channel('ink'),
        soft: channel('ink-soft'),
        muted: channel('ink-muted'),
        faint: channel('ink-faint'),
        ghost: channel('ink-ghost'),
      },
      'on-accent': channel('on-accent'),
      legendary: channel('legendary'),
      bone: channel('bone'),
      shade: channel('shade'),
      accent: family('accent'),
      good: family('good'),
      bad: family('bad'),
      weapon: family('weapon'),
      spirit: family('spirit'),
      vitality: family('vitality'),
      choice: family('choice'),
      info: family('info'),
      enhanced: family('enhanced'),
    },
    borderRadius: {
      none: '0',
      sm: 'var(--radius-sm)',
      DEFAULT: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      '2xl': 'var(--radius-2xl)',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      raised: 'var(--shadow-raised)',
      overlay: 'var(--shadow-overlay)',
      pill: 'var(--shadow-pill)',
    },
    dropShadow: {
      none: '0 0 #0000',
      text: 'var(--shadow-text)',
    },
    // The four sizes of the scale (src/typeScale.test.ts rejects any other)
    fontSize: {
      small: ['var(--text-small)', { lineHeight: 'var(--text-small-leading)' }],
      body: ['var(--text-body)', { lineHeight: 'var(--text-body-leading)' }],
      title: ['var(--text-title)', { lineHeight: 'var(--text-title-leading)' }],
      heading: ['var(--text-heading)', { lineHeight: 'var(--text-heading-leading)' }],
    },
    fontFamily: {
      sans: 'var(--font-body)',
      body: 'var(--font-body)',
      label: 'var(--font-label)',
      display: 'var(--font-display)',
    },
    extend: {
      letterSpacing: {
        caps: 'var(--tracking-caps)',
        display: 'var(--tracking-display)',
      },
    },
  },
  plugins: [],
}
