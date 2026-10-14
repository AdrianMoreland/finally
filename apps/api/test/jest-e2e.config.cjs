module.exports = {
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', diagnostics: false }] },
  testEnvironment: 'node',
  testTimeout: 180000,
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  moduleNameMapper: {
    '^pg-boss$': '<rootDir>/test/pg-boss.stub.ts',
    '^jose$': '<rootDir>/test/jose.stub.ts',
  },
};
