/**
 * Test mock for pages/_app.jsx
 *
 * WHY THIS FILE:
 *   pages/_app.jsx is excluded from Jest's test path (testPathIgnorePatterns: ['/pages/_']).
 *   Any import like `import { AuthContext } from '../pages/_app'` would fail in tests.
 *   This mock in `__mocks__/pages/` is automatically used by Jest whenever
 *   any module imports from 'pages/_app', replacing the real file.
 *
 * IMPORTANT — DISPLAYNAME:
 *   The AuthContext we export here has displayName: 'AuthContext'.
 *   Our tests/mock setup detects AuthContext by checking context.displayName.
 *   Without this displayName, we couldn't distinguish AuthContext from
 *   any other context object.
 *
 * THE ACTUAL CONTEXT VALUE:
 *   This mock provides a minimal context object. The actual "logged-in" value
 *   is provided per-test via <AuthContext.Provider value={...}> wrapper.
 */
const React = require('react');

const AuthContext = React.createContext({
  isLoggedIn: false,
  user: null,
  token: null,
  role: 'public',
  login: () => {},
  logout: () => {},
});

// displayName lets test utilities identify this as the AuthContext
AuthContext.displayName = 'AuthContext';

module.exports = { AuthContext };
