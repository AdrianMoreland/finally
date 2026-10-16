/** Dual ESM+CJS build for workspace packages (Nest consumes CJS, Vite/Metro consume ESM). */
export const tsupBase = {
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Not cleaned: a running dev server must never see dist half-built (a watch rebuild would otherwise delete the .d.ts first).
  clean: false,
  target: 'es2023',
  outDir: 'dist',
};
