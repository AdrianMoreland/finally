/** Dual ESM+CJS build for workspace packages (Nest consumes CJS, Vite/Metro consume ESM). */
export const tsupBase = {
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2023',
  outDir: 'dist',
};
