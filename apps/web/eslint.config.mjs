import base from '@finally/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...base({ browser: true, ignores: ['src/routeTree.gen.ts'] }),
  {
    // Vendored shadcn/ui components follow their upstream style.
    files: ['src/components/ui/**'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
];
