/** @type {import('tailwindcss').Config} */
export default {
  content: ['./entrypoints/**/*.{ts,vue,html}', './components/*.{ts,vue,html}'],
  theme: {
    extend: {
      width: {
        '22': '5.5rem'
      },
      height: {
        '22': '5.5rem'
      },
      minWidth: {
        '120': '30rem'
      }
    },
  },
  plugins: [],
};
