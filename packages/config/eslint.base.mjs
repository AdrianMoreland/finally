import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Shared flat config. `any` is banned everywhere. */
export default function base({ browser = false, ignores = [] } = {}) {
  return tseslint.config(
    { ignores: ['dist', '.turbo', 'coverage', 'src/generated', '.expo', 'dev-dist', ...ignores] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: { globals: browser ? globals.browser : globals.node },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        '@typescript-eslint/consistent-type-imports': 'error',
      },
    },
  );
}
