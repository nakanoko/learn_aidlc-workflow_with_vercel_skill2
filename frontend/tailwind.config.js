/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          900: '#0B2545',
          700: '#13315C',
          500: '#1E5DB1',
          100: '#E6EEFA',
        },
      },
      fontFamily: {
        sans: [
          'Noto Sans JP',
          'Hiragino Sans',
          'Yu Gothic',
          'Meiryo',
          'system-ui',
          'sans-serif',
        ],
        mono: ['Noto Sans Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
};
