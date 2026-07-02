/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta tecnológica da landing (ajuste aqui se tiver as cores oficiais da marca)
        night: {
          950: '#07070d',
          900: '#0b0b14',
          800: '#12121f',
          700: '#1a1a2b',
        },
        neon: {
          purple: '#8b5cf6',
          violet: '#a78bfa',
          blue: '#38bdf8',
          cyan: '#22d3ee',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'neon-purple': '0 0 24px -4px rgba(139, 92, 246, 0.55)',
        'neon-blue': '0 0 24px -4px rgba(56, 189, 248, 0.5)',
        glass: '0 8px 32px rgba(0, 0, 0, 0.45)',
      },
      backgroundImage: {
        'grid-tech':
          'linear-gradient(rgba(139,92,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.06) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
}
