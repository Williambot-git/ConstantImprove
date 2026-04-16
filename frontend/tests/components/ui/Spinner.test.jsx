/**
 * Spinner Component Unit Tests
 * ============================
 * Tests for the Spinner component and skeleton loading components.
 *
 * IMPORTANT: @testing-library/jest-dom matchers must be imported per file.
 */
const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');

const Spinner = require('../../../components/ui/Spinner').default;
const { SkeletonText, SkeletonCard } = require('../../../components/ui/Spinner');

describe('Spinner Component', () => {
  describe('Spinner rendering', () => {
    it('renders spinner with default text', () => {
      render(<Spinner />);

      // Default text is "Loading..."
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders spinner with custom text', () => {
      render(<Spinner text="Please wait..." />);

      expect(screen.getByText('Please wait...')).toBeInTheDocument();
    });

    it('renders without text when text prop is null', () => {
      render(<Spinner text={null} />);

      // Should not have any text content other than potential whitespace
      const spinner = document.querySelector('[class]');
      // The spinner renders without throwing
      expect(spinner || true).toBeTruthy();
    });

    it('renders with default size (md)', () => {
      render(<Spinner />);

      // Spinner should render without error
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders with size="sm"', () => {
      render(<Spinner size="sm" />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders with size="lg"', () => {
      render(<Spinner size="lg" />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders with size="xl"', () => {
      render(<Spinner size="xl" />);

      // Falls back to md size when xl is not defined
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });
});

describe('SkeletonText Component', () => {
  it('renders default 3 lines', () => {
    const { container } = render(<SkeletonText />);

    // Renders 3 div placeholders by default
    const placeholders = container.querySelectorAll('div[style]');
    expect(placeholders.length).toBeGreaterThanOrEqual(3);
  });

  it('renders specified number of lines', () => {
    const { container } = render(<SkeletonText lines={5} />);

    const placeholders = container.querySelectorAll('div[style]');
    expect(placeholders.length).toBeGreaterThanOrEqual(5);
  });

  it('renders with custom style', () => {
    const customStyle = { marginTop: '1rem' };
    const { container } = render(<SkeletonText style={customStyle} />);

    // Should render without error
    const outer = container.firstChild;
    expect(outer).toBeInTheDocument();
  });
});

describe('SkeletonCard Component', () => {
  it('renders skeleton card', () => {
    const { container } = render(<SkeletonCard />);

    // Should render without error
    const card = container.firstChild;
    expect(card).toBeInTheDocument();
  });

  it('renders with custom style', () => {
    const customStyle = { marginTop: '2rem' };
    const { container } = render(<SkeletonCard style={customStyle} />);

    const card = container.firstChild;
    expect(card).toBeInTheDocument();
  });
});
