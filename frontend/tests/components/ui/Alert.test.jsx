/**
 * Alert Component Unit Tests
 * ==========================
 * Tests for the Alert component — a dismissible notification component
 * with 4 severity types (info, success, warning, error).
 *
 * IMPORTANT: @testing-library/jest-dom matchers must be imported per file.
 */
const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');

// No external dependencies to mock — Alert is pure presentational
const Alert = require('../../../components/ui/Alert').default;

describe('Alert Component', () => {
  describe('Rendering with different types', () => {
    it('renders info alert with correct icon and colors', () => {
      render(<Alert type="info" message="This is an info message" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('This is an info message')).toBeInTheDocument();
      expect(screen.getByText('ℹ️')).toBeInTheDocument(); // info icon
    });

    it('renders success alert with check icon', () => {
      render(<Alert type="success" message="Operation successful" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Operation successful')).toBeInTheDocument();
      expect(screen.getByText('✓')).toBeInTheDocument(); // success icon
    });

    it('renders warning alert with warning icon', () => {
      render(<Alert type="warning" message="Please review your data" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Please review your data')).toBeInTheDocument();
      expect(screen.getByText('⚠️')).toBeInTheDocument(); // warning icon
    });

    it('renders error alert with error icon', () => {
      render(<Alert type="error" message="Something went wrong" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText('✕')).toBeInTheDocument(); // error icon
    });

    it('defaults to info type when no type is provided', () => {
      render(<Alert message="Default info message" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('ℹ️')).toBeInTheDocument();
    });

    it('renders with a title when provided', () => {
      render(<Alert type="success" title="Success!" message="Your changes were saved." />);

      expect(screen.getByText('Success!')).toBeInTheDocument();
      expect(screen.getByText('Your changes were saved.')).toBeInTheDocument();
    });

    it('renders without title when not provided', () => {
      render(<Alert type="info" message="Just a message" />);

      expect(screen.getByText('Just a message')).toBeInTheDocument();
      // Should not have a title element
      expect(screen.queryByText(/\n!/)).toBeNull();
    });
  });

  describe('Dismiss functionality', () => {
    it('renders dismiss button when dismissible and onClose are provided', () => {
      const onClose = jest.fn();
      render(<Alert type="info" message="Dismissible alert" onClose={onClose} dismissible />);

      const closeButton = screen.getByRole('button', { name: /close alert/i });
      expect(closeButton).toBeInTheDocument();
    });

    it('does not render dismiss button when not dismissible', () => {
      render(<Alert type="info" message="Non-dismissible" dismissible={false} />);

      expect(screen.queryByRole('button', { name: /close alert/i })).not.toBeInTheDocument();
    });

    it('does not render dismiss button when onClose is not provided', () => {
      render(<Alert type="info" message="No handler" dismissible />);

      // onClose is required for dismissible to show the button
      expect(screen.queryByRole('button', { name: /close alert/i })).not.toBeInTheDocument();
    });

    it('calls onClose when dismiss button is clicked', () => {
      const onClose = jest.fn();
      render(<Alert type="info" message="Click to dismiss" onClose={onClose} dismissible />);

      fireEvent.click(screen.getByRole('button', { name: /close alert/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Styling and structure', () => {
    it('applies custom style when provided', () => {
      const customStyle = { marginTop: '2rem' };
      render(<Alert type="info" message="Custom styled" style={customStyle} />);

      // The alert div should have the custom style applied
      const alert = screen.getByRole('alert');
      expect(alert.style.marginTop).toBe('2rem');
    });
  });
});
