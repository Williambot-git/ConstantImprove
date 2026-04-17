// frontend/jest.config.js
/**
 * AhoyVPN Frontend — Jest Configuration
 * =====================================
 * Jest is configured for Next.js with React Testing Library.
 * 
 * WHY THIS APPROACH:
 * - Next.js 16 + React 19 require a bit of extra Jest config to handle JSX
 * - We use babel-jest to transpile JSX before Jest processes it
 * - react-test-renderer is NOT used — we prefer @testing-library/react for
 *   accessible, practical tests that match how users interact with components
 * 
 * KEY SETTINGS:
 * - testEnvironment: 'jsdom' — needed by @testing-library/react to simulate browser APIs
 * - testPathIgnorePatterns — skips pages/ and _app.jsx (integration tests only for these)
 * - moduleNameMapper — aliases @/ imports if used, plus CSS/statics (no real styles in tests)
 * - setupFilesAfterEnv — runs test setup before any test files
 * - transformIgnorePatterns — next/dist/* modules need transpiling for Jest
 */
module.exports = {
  // jsdom gives us window/document/etc. for React Testing Library
  testEnvironment: 'jsdom',

  // Reasonable timeout for async operations (API calls mocked in tests)
  testTimeout: 10000,

  // Pattern to find test files
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.test.jsx'],

  // Ignore Next.js-specific files that aren't unit-testable in isolation
  // (pages/_app.jsx and pages/_document.jsx are tested via page-level tests)
  testPathIgnorePatterns: [
    '/node_modules/',
    '/pages/_',
    '/pages/api/',
  ],

  // Runs after Jest's environment is set up, before any tests load
  // This lets us set up mocks and global test environment variables
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Transpile JSX with babel-jest (configured in babel.config.cjs)
  transform: {
    '^.+\\.(js|jsx)$': ['babel-jest', { configFile: './babel.config.cjs' }],
  },

  // next/dist and next/src are CommonJS modules that use ES features
  // Jest can't parse them by default — we need to transform them too
  transformIgnorePatterns: [
    '/node_modules/(?!next/dist|@testing-library)',
  ],

  // Map import aliases to their real paths so Jest can resolve modules
  moduleNameMapper: {
    // If @/ alias is used, map it to the pages directory root
    // Components and pages use relative imports so this is mostly unused
    '^@/(.*)$': '<rootDir>/$1',
    // CSS Modules — mock as empty objects (styles are not tested)
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js',
    // Static images — mock as empty strings (test snapshots don't need real images)
    '\\.(png|jpg|jpeg|gif|svg)$': '<rootDir>/tests/__mocks__/fileMock.js',
  },

  // Collect coverage from components and lib (not pages — those are integration)
  collectCoverageFrom: [
    'components/**/*.js',
    'components/**/*.jsx',
    'lib/**/*.js',
    'api/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
  ],

  // Coverage thresholds — aspirational; tests must pass before raising these
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },

  // Verbose output for individual test descriptions
  verbose: true,
};
