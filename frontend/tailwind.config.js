/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sentry: {
          bg:       '#0a0f0a',
          surface:  '#111911',
          card:     '#1a2e1a',
          border:   '#2a4a2a',
          green:    '#39ff14',
          'green-dim': '#1a7a00',
          text:     '#e8f5e8',
          'text-sec': '#7aaa7a',
          red:      '#ff2020',
          yellow:   '#ffd700',
          blue:     '#00bfff',
          purple:   '#cc00cc',
        },
      },
      fontFamily: {
        orbitron: ['Orbitron', 'monospace'],
        mono:     ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-green': 'pulseGreen 2s infinite',
        'scan':        'scan 2s linear infinite',
        'blink':       'blink 1s step-end infinite',
        'grid-move':   'gridMove 20s linear infinite',
        'neon-glow':   'neonGlow 3s ease-in-out infinite',
      },
      keyframes: {
        pulseGreen: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 4px #39ff14' },
          '50%':      { opacity: '0.4', boxShadow: '0 0 12px #39ff14' },
        },
        scan: {
          '0%':   { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '0% 100%' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
        gridMove: {
          '0%':   { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '40px 40px' },
        },
        neonGlow: {
          '0%, 100%': { boxShadow: '0 0 4px #39ff14, 0 0 10px #39ff14' },
          '50%':      { boxShadow: '0 0 8px #39ff14, 0 0 20px #39ff14, 0 0 40px #39ff14' },
        },
      },
    },
  },
  plugins: [],
};
