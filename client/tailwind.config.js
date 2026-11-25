/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Archivo', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        poster: ['Anton', 'Impact', 'sans-serif'],
        serif: ['Anton', 'Impact', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        cyprus: {
          deep: '#00312F',
          DEFAULT: '#004643',
          light: '#0B6B65',
          hover: '#0E7D76',
        },
        sand: {
          DEFAULT: '#F0EDE5',
          dim: '#E4DFD3',
          card: '#E5E0D5',
          hover: '#DBD4C5',
        },
        brand: {
          50: '#eef8f7',
          100: '#d4eeec',
          200: '#a8dcd8',
          300: '#74c3be',
          400: '#40a49d',
          500: '#0E7D76',
          600: '#0B6B65',
          700: '#004643',
          800: '#003835',
          900: '#00312F',
          950: '#002220',
        },
      },
    },
  },
  plugins: [],
};
