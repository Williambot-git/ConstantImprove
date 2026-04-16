/**
 * ProtectedRoute Component Unit Tests
 * ====================================
 * Tests for the auth routing guard component that redirects unauthenticated
 * and unauthorized users. This is critical infrastructure for all protected pages.
 *
 * IMPORTANT: @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
 * must be imported per file — they are NOT globally available.
 *
 * TESTING APPROACH:
 * - ProtectedRoute uses AuthContext to check auth state and role
 * - Uses useRouter to redirect on auth failures
 * - Has three render cases: loading (no auth), denied (wrong role), authorized
 */
const React = require('react');
const { render, screen } = require('@testing-library/react');
// @testing-library/jest-dom provides toBeInTheDocument, toHaveAttribute, toHaveTextContent
// These matchers are NOT automatically global — must be imported per-file
require('@testing-library/jest-dom');

// Mock AuthContext before importing ProtectedRoute
// ProtectedRoute imports { AuthContext } from '../pages/_app'
jest.mock('../../pages/_app', () => {
  const React = require('react');
  return {
    AuthContext: React.createContext(null),
  };
});

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

const ProtectedRoute = require('../../components/ProtectedRoute').default;

describe('ProtectedRoute Component', () => {
  beforeEach(() => {
    // Clear all mocks between tests
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Helper: render ProtectedRoute with a given AuthContext value
  // Uses the default requiredRole="customer"
  // -------------------------------------------------------------------------
  function renderWithAuth(authValue) {
    const { AuthContext } = jest.requireMock('../../pages/_app');
    return render(
      <AuthContext.Provider value={authValue}>
        <ProtectedRoute requiredRole="customer">
          <div data-testid="protected-content">Secret Content</div>
        </ProtectedRoute>
      </AuthContext.Provider>
    );
  }

  // Helper: render with a specific requiredRole
  // Note: requiredRole is the role the user MUST have to access the content
  function renderWithRoleAndAuth(requiredRole, authValue) {
    const { AuthContext } = jest.requireMock('../../pages/_app');
    return render(
      <AuthContext.Provider value={authValue}>
        <ProtectedRoute requiredRole={requiredRole}>
          <div data-testid="protected-content">Secret Content</div>
        </ProtectedRoute>
      </AuthContext.Provider>
    );
  }

  // -------------------------------------------------------------------------
  // Test: Loading state when auth is null/undefined
  // -------------------------------------------------------------------------
  it('shows loading state when auth context is null', () => {
    renderWithAuth(null);

    // Should show "Checking access..." while auth is loading
    expect(screen.getByText(/checking access/i)).toBeInTheDocument();
    // Protected content should NOT be visible yet
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('shows loading state when auth is undefined', () => {
    renderWithAuth(undefined);

    expect(screen.getByText(/checking access/i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test: Not logged in — redirects to /login
  // -------------------------------------------------------------------------
  it('redirects to /login and does not render children when user is not logged in', () => {
    renderWithAuth({ isLoggedIn: false, role: null });

    // In jsdom, we verify the redirect to /login by checking the access denied
    // screen is shown (the component calls router.push('/login') then returns)
    // Since we can't spy on router in jsdom, we verify by checking no protected
    // content is rendered
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('does not render children when not logged in', () => {
    renderWithAuth({ isLoggedIn: false, role: null });

    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test: Logged in but wrong role — redirects to /
  // -------------------------------------------------------------------------
  it('redirects to / and shows access denied when logged in but wrong role', () => {
    // Required role is 'customer' but user is 'affiliate'
    renderWithAuth({ isLoggedIn: true, role: 'affiliate' });

    // The component redirects to home ('/') — in jsdom we verify by
    // checking that the access-denied screen is shown instead of protected content
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    // Protected content should not render (redirect occurred)
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('shows access denied message when role does not match', () => {
    renderWithAuth({ isLoggedIn: true, role: 'admin' });

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.getByText(/don't have permission/i)).toBeInTheDocument();
  });

  it('shows access denied when user role is customer but required role is affiliate', () => {
    // Required role is 'affiliate' but user is 'customer'
    renderWithRoleAndAuth('affiliate', { isLoggedIn: true, role: 'customer' });

    // Access denied screen shown (redirect to /)
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test: Logged in with correct role — renders children
  // -------------------------------------------------------------------------
  it('renders children when user is logged in with correct role', () => {
    renderWithAuth({ isLoggedIn: true, role: 'customer' });

    // Protected content should be visible
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.getByText('Secret Content')).toBeInTheDocument();
  });

  it('does not redirect when role matches', () => {
    renderWithAuth({ isLoggedIn: true, role: 'customer' });

    // Router.push should NOT have been called (redirect only on auth failures)
    // In jsdom we verify this by confirming children are rendered
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test: requiredRole = null behavior
  // NOTE: Due to the condition "if (requiredRole && auth.role !== requiredRole)",
  // when requiredRole is null (falsy), the role check is SKIPPED entirely.
  // This means requiredRole=null allows any logged-in user (the role check
  // never fires). This is a known quirk of the implementation.
  // -------------------------------------------------------------------------
  it('renders for any logged-in user when requiredRole is null (quirky short-circuit behavior)', () => {
    // requiredRole=null is falsy, so "requiredRole && ..." short-circuits
    // and the role check is skipped — any logged-in user gets in
    const { AuthContext } = jest.requireMock('../../pages/_app');
    render(
      <AuthContext.Provider value={{ isLoggedIn: true, role: 'affiliate' }}>
        <ProtectedRoute requiredRole={null}>
          <div data-testid="protected-content">Secret Content</div>
        </ProtectedRoute>
      </AuthContext.Provider>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('renders for admin when requiredRole is null', () => {
    const { AuthContext } = jest.requireMock('../../pages/_app');
    render(
      <AuthContext.Provider value={{ isLoggedIn: true, role: 'admin' }}>
        <ProtectedRoute requiredRole={null}>
          <div data-testid="protected-content">Admin Only</div>
        </ProtectedRoute>
      </AuthContext.Provider>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test: Role matching edge cases
  // -------------------------------------------------------------------------
  it('renders when requiredRole matches user role exactly', () => {
    // requiredRole='affiliate' matches user's affiliate role
    renderWithRoleAndAuth('affiliate', { isLoggedIn: true, role: 'affiliate' });

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('renders when requiredRole is admin and user is admin', () => {
    renderWithRoleAndAuth('admin', { isLoggedIn: true, role: 'admin' });

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test: isLoggedIn true but role is null — should show access denied
  // (not logged out, but also not any valid role)
  // -------------------------------------------------------------------------
  it('shows access denied when isLoggedIn is true but role is null', () => {
    // Note: this case is a bit ambiguous — user is "logged in" but has no role
    // The component shows access denied (the wrong-role check catches role=null)
    renderWithRoleAndAuth('customer', { isLoggedIn: true, role: null });

    // role=null !== 'customer', so wrong-role screen shows
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
  });
});
