module.exports = {
  testEnvironment: 'node',
  testTimeout: 10000,
  forceExit: true,
  // Runs after the test environment is set up, before tests execute.
  // tests/setup.js suppresses console.error during tests and sets test env vars.
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  collectCoverageFrom: [
    'src/services/**/*.js',
    'src/controllers/**/*.js',
    'src/middleware/**/*.js',
    'src/utils/**/*.js',
    '!**/node_modules/**',
  ],
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    'test_',
    'test-',
    'reset_',
  ],
};
