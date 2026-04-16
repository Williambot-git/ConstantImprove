/**
 * Modal Component Unit Tests
 * ==========================
 * Tests for the Modal component — a dialog overlay with open/close states,
 * keyboard support (Escape to close), and optional footer.
 *
 * IMPORTANT: @testing-library/jest-dom matchers must be imported per file.
 */
const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');

const Modal = require('../../../components/ui/Modal').default;

describe('Modal Component', () => {
  describe('Open/closed states', () => {
    it('renders modal when isOpen is true', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()}>
          <p>Modal content</p>
        </Modal>
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('does not render modal when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={jest.fn()}>
          <p>Hidden content</p>
        </Modal>
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
    });

    it('renders overlay when isOpen is true and overlay is true', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} overlay={true}>
          <p>Content</p>
        </Modal>
      );

      // Overlay is a div with role="presentation"
      expect(screen.getByRole('presentation')).toBeInTheDocument();
    });

    it('does not render overlay when overlay is false', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} overlay={false}>
          <p>Content</p>
        </Modal>
      );

      // Should only have the dialog, no presentation overlay
      expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    });
  });

  describe('Title rendering', () => {
    it('renders title when provided', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="My Modal">
          <p>Content</p>
        </Modal>
      );

      expect(screen.getByText('My Modal')).toBeInTheDocument();
      // Title is in an h2
      expect(screen.getByRole('heading', { name: 'My Modal' })).toBeInTheDocument();
    });

    it('does not render title when not provided', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()}>
          <p>No title</p>
        </Modal>
      );

      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
      expect(screen.getByText('No title')).toBeInTheDocument();
    });
  });

  describe('Close button', () => {
    it('renders close button', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()}>
          <p>Content</p>
        </Modal>
      );

      expect(screen.getByRole('button', { name: /close modal/i })).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
      const onClose = jest.fn();
      render(
        <Modal isOpen={true} onClose={onClose}>
          <p>Content</p>
        </Modal>
      );

      fireEvent.click(screen.getByRole('button', { name: /close modal/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Footer rendering', () => {
    it('renders footer when provided', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} footer={<button>Confirm</button>}>
          <p>Content</p>
        </Modal>
      );

      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    });

    it('does not render footer when not provided', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()}>
          <p>Content</p>
        </Modal>
      );

      expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
    });
  });

  describe('Keyboard: Escape to close', () => {
    it('calls onClose when Escape key is pressed', () => {
      const onClose = jest.fn();
      render(
        <Modal isOpen={true} onClose={onClose}>
          <p>Press Escape</p>
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose on other keys', () => {
      const onClose = jest.fn();
      render(
        <Modal isOpen={true} onClose={onClose}>
          <p>Press other key</p>
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Enter' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Size variants', () => {
    it('renders with default size (md)', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()}>
          <p>Medium modal</p>
        </Modal>
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders with size="sm"', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} size="sm">
          <p>Small modal</p>
        </Modal>
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders with size="lg"', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} size="lg">
          <p>Large modal</p>
        </Modal>
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
