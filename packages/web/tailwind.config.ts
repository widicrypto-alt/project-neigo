/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      // ── Spacing, radius, text, duration mapped to tokens.css CSS custom
      //    properties so tokens.css stays the single source of truth. Adding
      //    to `extend` preserves the default Tailwind scales for utilities
      //    we haven't standardised yet.
      spacing: {
        's1': 'var(--space-1)',
        's2': 'var(--space-2)',
        's3': 'var(--space-3)',
        's4': 'var(--space-4)',
        's5': 'var(--space-5)',
        's6': 'var(--space-6)',
        's7': 'var(--space-7)',
        's8': 'var(--space-8)',
        'tap': 'var(--tap-min)',
      },
      borderRadius: {
        'token-sm': 'var(--radius-sm)',
        'token-md': 'var(--radius-md)',
        'token-lg': 'var(--radius-lg)',
        'token-xl': 'var(--radius-xl)',
      },
      fontSize: {
        'token-xs': 'var(--text-xs)',
        'token-sm': 'var(--text-sm)',
        'token-base': 'var(--text-base)',
        'token-lg': 'var(--text-lg)',
        'token-xl': 'var(--text-xl)',
        'token-2xl': 'var(--text-2xl)',
        'token-3xl': 'var(--text-3xl)',
      },
      transitionDuration: {
        'fast': 'var(--duration-fast)',
        'base': 'var(--duration-base)',
        'slow': 'var(--duration-slow)',
      },
      transitionTimingFunction: {
        'standard': 'var(--easing-standard)',
        'enter': 'var(--easing-enter)',
        'exit': 'var(--easing-exit)',
      },
      zIndex: {
        'header': 'var(--z-header)',
        'drawer': 'var(--z-drawer)',
        'sheet': 'var(--z-sheet)',
        'toast': 'var(--z-toast)',
        'modal': 'var(--z-modal)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display-modern)', 'Be Vietnam Pro', 'system-ui', 'sans-serif'],
        serif: ['var(--font-display)', 'Fraunces', 'Georgia', 'serif'],
        novel: ['var(--font-novel)', 'Crimson Text', 'serif'],
        chat: ['var(--font-chat)', 'Manrope', 'sans-serif'],
        jp: ['var(--font-jp)', '"Noto Serif JP"', 'serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          // Keep existing accent palette for compatibility
          50: '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
          800: '#9d174d',
          900: '#831843',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0b0d17',
          950: '#07080f',
        },
        warmth: {
          300: '#fcd9b6',
          400: '#f5b981',
          500: '#e89a5c',
        },
        iris: {
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
        // REDESIGNv2 — "Perpustakaan Malam" dark palette.
        night: {
          canvas: '#0B0B14',
          surface: '#14141E',
          surface2: '#1C1C2A',
          line: '#262638',
        },
        violet: {
          accent: '#8B5CF6',
          hot: '#A78BFA',
          cool: '#60A5FA',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(236, 72, 153, 0.18), 0 10px 40px -10px rgba(236, 72, 153, 0.35)',
        'glow-soft': '0 10px 40px -20px rgba(236, 72, 153, 0.4)',
        lift: '0 20px 50px -20px rgba(0, 0, 0, 0.6)',
      },
      animation: {
        'fade-up': 'fadeUp 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'fade-in': 'fadeIn 500ms ease-out both',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'slide-up-sheet': 'slideUpSheet 360ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'spin-slow': 'spin 1s linear infinite',
        // D6: aurora shimmer — moving gradient for skeleton loaders
        'aurora-shimmer': 'auroraShimmer 1.8s ease-in-out infinite',
        // D6: gentle pulse for nav chevrons
        'chevron-pulse': 'chevronPulse 2.4s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseSoft: {
          '0%,100%': { opacity: '0.65' },
          '50%': { opacity: '1' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        slideUpSheet: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        // D6: aurora shimmer — 200% wide gradient slides left-to-right
        auroraShimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        // D6: gentle opacity bounce for the rail arrow
        chevronPulse: {
          '0%,100%': { opacity: '0.5', transform: 'translateX(0)' },
          '50%': { opacity: '1', transform: 'translateX(3px)' },
        },
      },
    },
  },
  plugins: [],
};
