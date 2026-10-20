/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        deadlock: {
          bg: '#0c0b0e',
          panel: '#151319',
          panelLight: '#1e1b24',
          border: '#2e2938',
          amber: '#f59e0b',
          gold: '#d4af37',
          weapon: '#ea580c',
          weaponLight: '#fb923c',
          vitality: '#16a34a',
          vitalityLight: '#4ade80',
          spirit: '#9333ea',
          spiritLight: '#c084fc',
        }
      },
      // Type scale (variables in src/index.css)
      fontSize: {
        small: ['var(--text-small)', { lineHeight: '1rem' }],
        body: ['var(--text-body)', { lineHeight: '1rem' }],
        title: ['var(--text-title)', { lineHeight: '1.25rem' }],
        heading: ['var(--text-heading)', { lineHeight: '1.5rem' }],
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Cinzel', 'Georgia', 'serif'],
      },
      boxShadow: {
        'glow-amber': '0 0 15px -3px rgba(245, 158, 11, 0.35)',
        'glow-weapon': '0 0 15px -3px rgba(234, 88, 12, 0.4)',
        'glow-vitality': '0 0 15px -3px rgba(22, 163, 74, 0.4)',
        'glow-spirit': '0 0 15px -3px rgba(147, 51, 234, 0.4)',
      }
    },
  },
  plugins: [],
}
