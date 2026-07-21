/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        green: {
          dark:  '#1a3a2a',
          main:  '#1e4d2b',
          nav:   '#245c33',
          act:   '#2e7d45',
          btn:   '#2d7a3e',
          lite:  '#3a9e55',
          tag:   '#e8f5ec',
          text:  '#2d7a3e',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}