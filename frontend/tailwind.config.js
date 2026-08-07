/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Marca RevelaCash — identidade definitiva (mockup do logo, 08/08/2026):
        // roxo + verde extraídos do wordmark oficial. Mais escuro/denso que
        // `pct` (#7c3aed) para não colidir visualmente com o indicador de
        // percentual. Valores devem ficar idênticos aos de
        // src/styles/tokens.css e src/styles/tokens.js.
        brand: {
          50: '#f4effa',
          100: '#e5dcf4',
          200: '#cbb9ea',
          300: '#a98adb',
          400: '#875bcd',
          500: '#6736b4',
          600: '#512b8d',
          700: '#3f216e',
          800: '#2f1952',
          900: '#22123b',
          DEFAULT: '#512b8d',
          dark: '#3f216e',
          light: '#e5dcf4',
        },
        // Segunda cor da marca — o verde do "Cash" no wordmark e da metade
        // direita do ícone. Uso decorativo/marca (nav, wordmark, marca
        // d'água, destaques de layout) — não usar como sinônimo de
        // `income`, que é o verde semântico dos gráficos financeiros.
        accent: {
          50: '#effbf5',
          100: '#daf6e9',
          200: '#b5edd2',
          300: '#83e2b5',
          400: '#52d697',
          500: '#2dbe79',
          600: '#23945f',
          700: '#1b734a',
          800: '#155737',
          900: '#0f3e27',
          DEFAULT: '#2dbe79',
          dark: '#1b734a',
          light: '#daf6e9',
        },
        bg: '#f9f8f6',
        ink: '#1c1916',
        muted: '#6e6a63',
        faint: '#a39f98',
        surface: {
          DEFAULT: '#ffffff',
          alt: '#fafaf8',
        },
        border: {
          DEFAULT: '#ebe8e2',
          strong: '#d8d3cb',
        },
        income: {
          light: '#d1f5f0',
          DEFAULT: '#0d9488',
          dark: '#0f766e',
        },
        expense: {
          light: '#fee2e2',
          DEFAULT: '#dc2626',
          dark: '#b91c1c',
        },
        balance: {
          light: '#dbeafe',
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
        },
        pct: {
          light: '#ede9fe',
          DEFAULT: '#7c3aed',
          dark: '#6d28d9',
        },
        warn: {
          light: '#fef3c7',
          DEFAULT: '#d97706',
          dark: '#b45309',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'monospace'],
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.03)',
        'card-hover': '0 4px 20px rgba(0,0,0,.08)',
        modal: '0 8px 32px rgba(28,25,22,.16), 0 2px 8px rgba(28,25,22,.08)',
      },
      keyframes: {
        fadein: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        dialogin: {
          from: { opacity: '0', transform: 'translate(-50%, -48%) scale(0.97)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        dropdownin: {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        curtain: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-100%)' },
        },
        revealcontent: {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        fadein: 'fadein 0.15s ease-out',
        dialogin: 'dialogin 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
        dropdownin: 'dropdownin 0.14s cubic-bezier(0.22, 1, 0.36, 1)',
        curtain: 'curtain 0.7s cubic-bezier(0.65, 0, 0.35, 1) forwards',
        revealcontent: 'revealcontent 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both',
      },
    },
  },
  plugins: [],
};
