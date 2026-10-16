/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset'), require('@finally/tokens/tailwind-preset')],
  // The phone keeps its own radii: cards 14, buttons and inputs 12, pills fully round.
  theme: { extend: { borderRadius: { card: '14px', control: '12px', chip: '999px', field: '12px', sheet: '22px' } } },
  plugins: [],
};
