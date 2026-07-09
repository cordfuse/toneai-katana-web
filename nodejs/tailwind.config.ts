import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:          'var(--bg)',
        surface:     'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        primary:     'var(--primary)',
        'on-primary':'var(--on-primary)',
        fg:          'var(--fg)',
        'fg-2':      'var(--fg-2)',
        'fg-3':      'var(--fg-3)',
        'fg-4':      'var(--fg-4)',
      },
      animation: {
        'fade-in':       'fadeIn 0.2s ease-out',
        'slide-up':      'slideUp 0.25s ease-out',
        'scale-up':      'scaleUp 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'slide-in-right': 'slideInRight 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'slide-out-right':'slideOutRight 0.26s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
        'slide-in-bottom':'slideInBottom 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
      keyframes: {
        fadeIn:         { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:        { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleUp:        { from: { opacity: '0', transform: 'scale(0.82)' }, to: { opacity: '1', transform: 'scale(1)' } },
        slideInRight:   { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        slideOutRight:  { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(100%)' } },
        slideInBottom:  { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}

export default config
