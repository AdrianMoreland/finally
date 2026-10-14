import base from '@finally/config/eslint';

export default [
  ...base(),
  {
    // Nest dependency injection needs value imports for types that appear in decorated signatures.
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
];
