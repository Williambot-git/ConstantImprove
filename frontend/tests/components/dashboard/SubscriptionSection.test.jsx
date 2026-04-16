import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubscriptionSection from '../../../components/dashboard/SubscriptionSection';

// Mock useRouter
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('SubscriptionSection', () => {
  it('renders active subscription details when subscription provided', () => {
    const sub = { planName: 'Monthly', status: 'active', nextBilling: '2026-05-16' };
    render(<SubscriptionSection subscription={sub} paymentMethod="crypto" onCancel={jest.fn()} />);
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('renders plan selection when no subscription', () => {
    render(<SubscriptionSection subscription={null} paymentMethod="crypto" onCancel={jest.fn()} />);
    expect(screen.getByText(/No active subscription/)).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('$5.99')).toBeInTheDocument();
  });

  it('navigates to checkout on plan select', async () => {
    const push = jest.fn();
    jest.spyOn(require('next/router'), 'useRouter').mockReturnValue({ push });
    render(<SubscriptionSection subscription={null} paymentMethod="crypto" onCancel={jest.fn()} />);
    await userEvent.click(screen.getAllByText('Select Plan')[0]);
    expect(push).toHaveBeenCalledWith(expect.stringContaining('/checkout?plan='));
  });
});
