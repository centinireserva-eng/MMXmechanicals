import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mmx: {
          bg: '#0a0a0b', surface: '#0f1210', elevated: '#151917',
          border: '#2a312d', accent: '#8cff70', 'accent-2': '#65d8ff',
          'accent-3': '#8396ff', danger: '#ff748d', warn: '#ffd75a',
          text: '#edf3ef', muted: '#99a59f', dim: '#4a4d52',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn .4s cubic-bezier(.16,1,.3,1)',
        'slide-up': 'slideUp .5s cubic-bezier(.16,1,.3,1)',
        'glow-pulse': 'glowPulse 2s cubic-bezier(.16,1,.3,1) infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        glowPulse: { '0%,100%': { boxShadow: '0 0 20px rgba(0,229,160,.15)' }, '50%': { boxShadow: '0 0 40px rgba(0,229,160,.35)' } },
      },
    },
  },
  plugins: [],
};
export default config;
