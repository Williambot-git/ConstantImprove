/**
 * PlanCard Component Unit Tests
 * =============================
 * Tests for the plan display card component used in the subscription section.
 *
 * Each plan card shows: name, price, period, description, features list,
 * and whether it's crypto-only. The selected state is visually distinct.
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

const PlanCard = require('../../../components/dashboard/PlanCard');

describe('PlanCard Component', () => {
  // Minimal plan object for tests
  const basicPlan = {
    name: 'Monthly',
    price: '$9.99',
    period: '/month',
    description: 'Best for flexibility',
    features: ['Feature A', 'Feature B'],
    cryptoOnly: false,
  };

  describe('Rendering plan information', () => {
    it('renders plan name', () => {
      render(<PlanCard plan={basicPlan} onSelect={jest.fn()} />);

      expect(screen.getByText('Monthly')).toBeInTheDocument();
    });

    it('renders plan price', () => {
      render(<PlanCard plan={basicPlan} onSelect={jest.fn()} />);

      expect(screen.getByText('$9.99')).toBeInTheDocument();
    });

    it('renders plan period', () => {
      render(<PlanCard plan={basicPlan} onSelect={jest.fn()} />);

      expect(screen.getByText('/month')).toBeInTheDocument();
    });

    it('renders plan description', () => {
      render(<PlanCard plan={basicPlan} onSelect={jest.fn()} />);

      expect(screen.getByText('Best for flexibility')).toBeInTheDocument();
    });

    it('renders all plan features as list items', () => {
      render(<PlanCard plan={basicPlan} onSelect={jest.fn()} />);

      expect(screen.getByText('Feature A')).toBeInTheDocument();
      expect(screen.getByText('Feature B')).toBeInTheDocument();
    });

    it('renders crypto-only notice when plan is crypto-only', () => {
      const cryptoPlan = { ...basicPlan, cryptoOnly: true };
      render(<PlanCard plan={cryptoPlan} onSelect={jest.fn()} />);

      expect(screen.getByText('Crypto payment only')).toBeInTheDocument();
    });

    it('does not render crypto-only notice when plan is not crypto-only', () => {
      render(<PlanCard plan={basicPlan} onSelect={jest.fn()} />);

      expect(screen.queryByText('Crypto payment only')).not.toBeInTheDocument();
    });
  });

  describe('Select button', () => {
    it('renders Select Plan button', () => {
      render(<PlanCard plan={basicPlan} onSelect={jest.fn()} />);

      expect(screen.getByText('Select Plan')).toBeInTheDocument();
    });

    it('calls onSelect when Select Plan button is clicked', () => {
      const onSelect = jest.fn();
      render(<PlanCard plan={basicPlan} onSelect={onSelect} />);

      fireEvent.click(screen.getByText('Select Plan'));
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Selected state', () => {
    it('renders when selected is false', () => {
      render(<PlanCard plan={basicPlan} onSelect={jest.fn()} selected={false} />);

      expect(screen.getByText('Monthly')).toBeInTheDocument();
    });

    it('renders when selected is true', () => {
      render(<PlanCard plan={basicPlan} onSelect={jest.fn()} selected={true} />);

      expect(screen.getByText('Monthly')).toBeInTheDocument();
    });
  });

  describe('Highlighted state', () => {
    it('renders with highlight when plan.highlight is true', () => {
      const highlightedPlan = { ...basicPlan, highlight: true };
      render(<PlanCard plan={highlightedPlan} onSelect={jest.fn()} />);

      // Should render without error
      expect(screen.getByText('Monthly')).toBeInTheDocument();
    });

    it('renders without highlight when plan.highlight is false', () => {
      render(<PlanCard plan={basicPlan} onSelect={jest.fn()} />);

      expect(screen.getByText('Monthly')).toBeInTheDocument();
    });
  });
});
