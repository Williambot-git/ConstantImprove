/**
 * DeleteModal Component Unit Tests
 * ================================
 * Tests for the account deletion confirmation modal.
 *
 * DELETION IS PERMANENT AND IRREVERSIBLE — these tests verify the user
 * is prompted to confirm before the most destructive action in the app.
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

const DeleteModal = require('../../../components/dashboard/DeleteModal');

describe('DeleteModal Component', () => {
  it('renders the modal heading', () => {
    render(<DeleteModal onCancel={jest.fn()} onConfirm={jest.fn()} />);

    expect(screen.getByRole('heading', { name: 'Delete Account' })).toBeInTheDocument();
  });

  it('renders the irreversible warning message', () => {
    render(<DeleteModal onCancel={jest.fn()} onConfirm={jest.fn()} />);

    expect(screen.getByText('Are you sure you want to delete your account? This action cannot be undone.')).toBeInTheDocument();
  });

  it('renders Keep Account button that calls onCancel', () => {
    const onCancel = jest.fn();
    render(<DeleteModal onCancel={onCancel} onConfirm={jest.fn()} />);

    fireEvent.click(screen.getByText('Keep Account'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders Delete Account button that calls onConfirm', () => {
    const onConfirm = jest.fn();
    render(<DeleteModal onCancel={jest.fn()} onConfirm={onConfirm} />);

    // Find the delete button (the confirm button)
    const buttons = screen.getAllByRole('button');
    const deleteBtn = buttons.find(b => b.textContent === 'Delete Account');
    fireEvent.click(deleteBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables confirm button when loading is true', () => {
    render(<DeleteModal onCancel={jest.fn()} onConfirm={jest.fn()} loading={true} />);

    // When loading, the button shows "Deleting..." text
    const loadingButton = screen.getByText('Deleting...');
    expect(loadingButton).toBeInTheDocument();
    expect(loadingButton).toBeDisabled();
  });

  it('shows normal button text when not loading', () => {
    render(<DeleteModal onCancel={jest.fn()} onConfirm={jest.fn()} loading={false} />);

    const buttons = screen.getAllByRole('button');
    const texts = buttons.map(b => b.textContent);
    expect(texts).toContain('Keep Account');
    expect(texts).toContain('Delete Account');
  });
});
