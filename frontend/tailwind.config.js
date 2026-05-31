/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
        display: ['Syne', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: '#0a0a0f',
          1: '#0d0d14',
          2: '#13131a',
          3: '#1a1a24',
        },
        border: { DEFAULT: '#1e1e2e', hover: '#2a2a3a' },
        accent: {
          DEFAULT: '#6c63ff',
          hover: '#5b53ee',
          muted: '#1a1230',
          border: '#3d2f6e',
          text: '#a78bfa',
        },
        success: { DEFAULT: '#4ade80', bg: '#0d2e19', border: '#1f4027' },
        warning: { DEFAULT: '#fbbf24', bg: '#1a1408', border: '#3f2d10' },
        danger: { DEFAULT: '#f87171', bg: '#1a0808', border: '#3f1515' },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease',
        'slide-up': 'slideUp 0.25s ease',
        'pulse-dot': 'pulseDot 1.5s ease infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseDot: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.2 } },
      },
    },
  },
  plugins: [],
}
