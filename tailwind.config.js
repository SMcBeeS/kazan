/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Deep midnight, dim dark-blue monochromatic palette (no purple).
        night: {
          950: '#030712',
          900: '#090d16',
          850: '#0d131f',
          800: '#131a29',
          750: '#1a2031',
          700: '#232a3d',
          600: '#2f3850',
        },
        brand: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        accent: {
          // Cool white/slate for highlights instead of magenta/purple
          400: '#cbd5e1',
          500: '#94a3b8',
          600: '#64748b',
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
      },
      fontFamily: {
        // Modern Latin-first stack (Plus Jakarta Sans) with Arabic fallbacks
        sans: [
          'Plus Jakarta Sans',
          'Cairo',
          'Tajawal',
          'IBM Plex Sans Arabic',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
        display: ['Plus Jakarta Sans', 'Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
        // Dedicated Arabic faces (Cairo first) — applied to every Arabic/RTL
        // element via `font-cairo` (or the `font-arabic` alias) and via the
        // html[lang=ar]/[dir=rtl] rules in index.css.
        cairo: ['Cairo', 'sans-serif'],
        arabic: ['Cairo', 'Tajawal', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(15, 23, 42, 0.6)',
        'glow-accent': '0 0 20px -4px rgba(226, 232, 240, 0.35)',
        card: '0 12px 40px -12px rgba(0, 0, 0, 0.75)',
      },
      backgroundImage: {
        'hero-gradient':
          'linear-gradient(to top, #030712 4%, rgba(3,7,18,0.85) 30%, rgba(3,7,18,0.25) 65%, rgba(3,7,18,0.55) 100%)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out both',
        'fade-up': 'fade-up 0.6s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
        'slide-down': 'slideDown 0.2s ease-out forwards',
        marquee: 'marquee 30s linear infinite',
      },
    },
  },
  plugins: [],
}
