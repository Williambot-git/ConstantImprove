module.exports = {
  testEnvironment: 'node',
  testTimeout: 10000,
  forceExit: true,
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
