/**
 * CancelModal Component Unit Tests
 * =================================
 * Tests for the subscription cancellation confirmation modal.
 *
 * CANCELLATION IS PERMANENT — these tests verify the user is prompted
 * to confirm before the destructive action is taken.
 */
const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');

// Mock AuthContext
jest.mock('../../../pages/_app', () => {
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

const CancelModal = require('../../../components/dashboard/CancelModal');

describe('CancelModal Component', () => {
  it('renders the modal heading', () => {
    render(<CancelModal onCancel={jest.fn()} onConfirm={jest.fn()} />);

    // h3 heading "Cancel Subscription"
    expect(screen.getByRole('heading', { name: 'Cancel Subscription' })).toBeInTheDocument();
  });

  it('renders confirmation message', () => {
    render(<CancelModal onCancel={jest.fn()} onConfirm={jest.fn()} />);

    expect(screen.getByText('Are you sure you want to cancel your subscription?')).toBeInTheDocument();
  });

  it('renders Keep Subscription button that calls onCancel', () => {
    const onCancel = jest.fn();
    render(<CancelModal onCancel={onCancel} onConfirm={jest.fn()} />);

    fireEvent.click(screen.getByText('Keep Subscription'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders Cancel Subscription button that calls onConfirm', () => {
    const onConfirm = jest.fn();
    render(<CancelModal onCancel={jest.fn()} onConfirm={onConfirm} />);

    // Get all buttons and find the one with "Cancel Subscription" text
    // (not the h3 heading which also says "Cancel Subscription")
    const buttons = screen.getAllByRole('button');
    const confirmBtn = buttons.find(b => b.textContent === 'Cancel Subscription');
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables confirm button when loading is true', () => {
    render(<CancelModal onCancel={jest.fn()} onConfirm={jest.fn()} loading={true} />);

    // When loading, the button shows "Cancelling..." text
    const loadingButton = screen.getByText('Cancelling...');
    expect(loadingButton).toBeInTheDocument();
    expect(loadingButton).toBeDisabled();
  });

  it('shows normal button text when not loading', () => {
    render(<CancelModal onCancel={jest.fn()} onConfirm={jest.fn()} loading={false} />);

    // All buttons rendered: "Keep Subscription" and "Cancel Subscription"
    const buttons = screen.getAllByRole('button');
    const texts = buttons.map(b => b.textContent);
    expect(texts).toContain('Keep Subscription');
    expect(texts).toContain('Cancel Subscription');
  });
});
