import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#2563eb',
          600: '#1d4ed8',
        },
        slate: {
          850: '#172133',
          950: '#0d1526',
        },
      },
      boxShadow: {
        panel: '0 2px 8px rgba(17, 24, 39, 0.08)',
      },
      borderRadius: {
        panel: '14px',
      },
      fontFamily: {
        sans: ['InterVariable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
