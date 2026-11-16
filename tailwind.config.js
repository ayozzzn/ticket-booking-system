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
        // payment screens
        stamp: {
          '0%': { opacity: '0', transform: 'scale(2) rotate(-14deg)' },
          '60%': { opacity: '1', transform: 'scale(0.94) rotate(-8deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(-8deg)' },
        },
        scan: {
          '0%, 100%': { transform: 'translateY(0)', opacity: '0' },
          '10%, 90%': { opacity: '1' },
          '50%': { transform: 'translateY(calc(100% - 3px))' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
        'draw-check': { to: { 'stroke-dashoffset': '0' } },
        'pop-ring': {
          '0%': { opacity: '0.7', transform: 'scale(0.6)' },
          '100%': { opacity: '0', transform: 'scale(1.9)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'confetti-fall': {
          '0%': { opacity: '1', transform: 'translateY(-10px) rotate(0deg)' },
          '100%': { opacity: '0', transform: 'translateY(190px) rotate(540deg)' },
        },
        'sheen': {
          '0%': { transform: 'translateX(-120%) skewX(-18deg)' },
          '100%': { transform: 'translateX(320%) skewX(-18deg)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'modal-in': 'modal-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        stamp: 'stamp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both',
        scan: 'scan 2.6s ease-in-out infinite',
        shake: 'shake 0.4s ease-in-out',
        'draw-check': 'draw-check 0.6s ease-out 0.25s forwards',
        'pop-ring': 'pop-ring 0.9s ease-out both',
        'slide-in-right': 'slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'confetti-fall': 'confetti-fall 1.6s ease-in both',
        sheen: 'sheen 3.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
