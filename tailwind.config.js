const colors = require('tailwindcss/colors')

module.exports = {
  content: ['./public/**/*.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: colors.red
      },
    },
  },
  variants: {
    scrollbar: ["rounded"],
  },
  plugins: [
    require('tailwind-scrollbar')
  ],
}
