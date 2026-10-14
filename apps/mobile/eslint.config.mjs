import base from '@finally/config/eslint';

export default [
  ...base({ ignores: ['dist', '.expo', 'babel.config.js', 'metro.config.js', 'tailwind.config.js'] }),
  { rules: { '@typescript-eslint/consistent-type-imports': 'off' } },
];
