import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0f',
        panel: '#12121a',
        border: '#1e1e2e',
        accent: '#00ff88',
        muted: '#3a3a4a',
        text: '#e8e8f0',
        'text-dim': '#7a7a9a',
      },
      fontFamily: {
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
        sans: ['"Space Mono"', 'ui-monospace', 'monospace'],
        display: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
