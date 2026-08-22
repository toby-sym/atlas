module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FAF6E9',
        parchment: '#F3ECE0',
        grass: '#76C893',
        grassDeep: '#52B788',
        wood: '#5D4037',
        woodLight: '#7F5539',
        peach: '#FFE89C',
        yellow: '#FFB703',
        mint: '#C9F7D8',
        teal: '#7BD8C6',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        villager: '0 8px 0 #5D4037',
        'villager-soft': '0 6px 0 #5D4037',
      },
      fontFamily: {
        display: ['Fredoka', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
