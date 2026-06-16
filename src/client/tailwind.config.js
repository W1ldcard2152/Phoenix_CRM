/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // CV Repair brand: warm brown anchored on #4c2622 (logo background)
        primary: {
          50: '#faf6f4',
          100: '#f3e9e6',
          200: '#e4cdc7',
          300: '#d0a9a0',
          400: '#b07a6e',
          500: '#8a5448', // mid brown
          600: '#6e4035',
          700: '#5a3329',
          800: '#4c2622', // brand base
          900: '#3a1d1a',
        },
        // Warm terracotta/tan accent (active nav highlights, etc.)
        accent: {
          50: '#fbf3ea',
          100: '#f6e4d2',
          200: '#edc7a6',
          300: '#e0b089',
          400: '#d1956a',
          500: '#c2855b',
          600: '#a96c43',
          700: '#8a5536',
          800: '#6e442d',
          900: '#5a3826',
        },
        // Off-white parchment app background
        parchment: '#f5f0e8',
        secondary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
    },
  },
  plugins: [],
}
