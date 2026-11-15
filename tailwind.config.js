/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        wine: {
          950: '#1a0407',
          900: '#2b0709',
          800: '#4a0d14',
        },
        crimson: {
          DEFAULT: '#9b1c2c',
          bright: '#c42a3c',
        },
        cream: {
          DEFAULT: '#f4e8df',
          dim: '#d9c6ba',
        },
        gold: '#d8a48f',
        // Old "teal" classes now render as crimson, so pages not yet redesigned turn red too
        teal: {
          50: '#fbeeee',
          100: '#f7dcdf',
          600: '#c42a3c',
          700: '#b32335',
          800: '#9b1c2c',
          900: '#6e1220',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'modal-in': {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'modal-in': 'modal-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};