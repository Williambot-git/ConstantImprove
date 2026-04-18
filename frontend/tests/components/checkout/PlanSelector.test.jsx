/**
 * PlanSelector Unit Tests
 * 
 * Tests the plan selection UI component used in the checkout flow.
 * PlanSelector renders a list of plans as Card components with a Select/Selected button.
 * 
 * Coverage: previously 0%, now fully covered.
 * 
 * NOTE: Uses RTL (@testing-library/react) following the established frontend test pattern.
 * ES6 imports are avoided because frontend jest.config.cjs requires CommonJS transforms.
 */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');

const PlanSelector = require('../../../components/checkout/PlanSelector').default;
const Card = require('../../../components/ui/Card').default;
const Button = require('../../../components/ui/Button').default;

describe('PlanSelector', () => {
  // Two mock plans: one regular monthly, one cryptoOnly annual
  const mockPlans = [
    { id: 'monthly', name: 'Monthly Plan', price: '$5.99', period: '/month' },
    { id: 'annual', name: 'Annual Plan', price: '$59.99', period: '/year', cryptoOnly: true },
  ];

  it('renders a Card for each plan', () => {
    const onSelect = jest.fn();
    render(<PlanSelector plans={mockPlans} selectedPlan={null} onSelect={onSelect} />);
    // Two plans = two Card components rendered
    const cards = document.querySelectorAll('[data-plan-id]');
    expect(cards).toHaveLength(2);
  });

  it('displays plan name, price, and billing period for each plan', () => {
    const onSelect = jest.fn();
    render(<PlanSelector plans={mockPlans} selectedPlan={null} onSelect={onSelect} />);
    // Monthly plan content
    expect(screen.getByText('Monthly Plan')).toBeInTheDocument();
    expect(screen.getByText('$5.99')).toBeInTheDocument();
    expect(screen.getByText('/month')).toBeInTheDocument();
    // Annual plan content
    expect(screen.getByText('Annual Plan')).toBeInTheDocument();
    expect(screen.getByText('$59.99')).toBeInTheDocument();
    expect(screen.getByText('/year')).toBeInTheDocument();
  });

  it('renders "Select" text on non-selected plan buttons', () => {
    const onSelect = jest.fn();
    render(<PlanSelector plans={mockPlans} selectedPlan={null} onSelect={onSelect} />);
    // Both plans are unselected, so both should show "Select"
    const selectButtons = screen.getAllByText('Select');
    expect(selectButtons).toHaveLength(2);
  });

  it('renders "Selected" text on the selected plan button', () => {
    const onSelect = jest.fn();
    // Monthly is selected
    render(<PlanSelector plans={mockPlans} selectedPlan="monthly" onSelect={onSelect} />);
    expect(screen.getByText('Selected')).toBeInTheDocument();
    // Annual is still "Select"
    const selectButtons = screen.getAllByText('Select');
    expect(selectButtons).toHaveLength(1);
  });

  it('calls onSelect with plan id when Select button is clicked', () => {
    const onSelect = jest.fn();
    render(<PlanSelector plans={mockPlans} selectedPlan={null} onSelect={onSelect} />);
    // Click the Annual plan's Select button (has data-plan-id="annual")
    const annualCard = document.querySelector('[data-plan-id="annual"]');
    const selectBtn = annualCard.querySelector('button');
    selectBtn.click();
    expect(onSelect).toHaveBeenCalledWith('annual');
  });

  it('renders crypto-only badge for cryptoOnly plans', () => {
    const onSelect = jest.fn();
    render(<PlanSelector plans={mockPlans} selectedPlan={null} onSelect={onSelect} />);
    // Annual plan has cryptoOnly: true
    expect(screen.getByText('Crypto only')).toBeInTheDocument();
  });

  it('does not render crypto-only badge for regular plans', () => {
    const onSelect = jest.fn();
    render(<PlanSelector plans={[mockPlans[0]]} selectedPlan={null} onSelect={onSelect} />);
    expect(screen.queryByText('Crypto only')).not.toBeInTheDocument();
  });

  it('renders nothing when plans array is empty', () => {
    const onSelect = jest.fn();
    const { container } = render(<PlanSelector plans={[]} selectedPlan={null} onSelect={onSelect} />);
    // No cards rendered
    expect(container.querySelectorAll('[data-plan-id]')).toHaveLength(0);
  });
});
