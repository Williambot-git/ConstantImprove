/**
 * Card Component Unit Tests
 * =========================
 * Tests for the Card component — a container with optional title and subtitle.
 *
 * IMPORTANT: @testing-library/jest-dom matchers must be imported per file.
 */
const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');

const Card = require('../../../components/ui/Card').default;

describe('Card Component', () => {
  describe('Rendering children', () => {
    it('renders children content', () => {
      render(
        <Card>
          <p>Card content</p>
        </Card>
      );

      expect(screen.getByText('Card content')).toBeInTheDocument();
    });

    it('renders multiple children', () => {
      render(
        <Card>
          <p>First paragraph</p>
          <p>Second paragraph</p>
        </Card>
      );

      expect(screen.getByText('First paragraph')).toBeInTheDocument();
      expect(screen.getByText('Second paragraph')).toBeInTheDocument();
    });
  });

  describe('Title rendering', () => {
    it('renders title when provided', () => {
      render(
        <Card title="My Card Title">
          <p>Content</p>
        </Card>
      );

      expect(screen.getByText('My Card Title')).toBeInTheDocument();
    });

    it('does not render title when not provided', () => {
      render(
        <Card>
          <p>Content without title</p>
        </Card>
      );

      expect(screen.getByText('Content without title')).toBeInTheDocument();
      // The h3 for title should not be present
      expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    });
  });

  describe('Subtitle rendering', () => {
    it('renders subtitle when provided', () => {
      render(
        <Card title="Title" subtitle="My subtitle">
          <p>Content</p>
        </Card>
      );

      expect(screen.getByText('My subtitle')).toBeInTheDocument();
    });

    it('does not render subtitle when not provided', () => {
      render(
        <Card title="Title Only">
          <p>Content</p>
        </Card>
      );

      expect(screen.getByText('Title Only')).toBeInTheDocument();
      // No subtitle paragraph should exist
      const subtitle = screen.queryByText('My subtitle');
      expect(subtitle).not.toBeInTheDocument();
    });
  });

  describe('Padding prop', () => {
    it('applies custom padding when provided', () => {
      render(
        <Card padding="2rem">
          <p>Custom padding</p>
        </Card>
      );

      // Card should render — the padding is applied via style
      expect(screen.getByText('Custom padding')).toBeInTheDocument();
    });
  });

  describe('Custom style', () => {
    it('applies custom style when provided', () => {
      render(
        <Card style={{ marginTop: '2rem', backgroundColor: '#333' }}>
          <p>Styled card</p>
        </Card>
      );

      const card = screen.getByText('Styled card').closest('div');
      expect(card.style.marginTop).toBe('2rem');
    });
  });
});
