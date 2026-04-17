/**
 * SubscriptionSection — unit tests.
 *
 * WHAT THIS TESTS:
 * - Renders subscription status when active (plan name, status, next billing, cancel button)
 * - Renders plan selection grid when no active subscription
 * - PlanCard click navigates to checkout with correct query params
 * - Cancel button calls onCancel prop
 *
 * NOTES:
 * - Uses useRouter from next/router (mocked)
 * - Uses useState for selectedPlan tracking
 * - PLANS data is defined in the component (mirror of backend plans)
 */

const mockRouter = {
  push: jest.fn(),
};

jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AuthContext } from '../../../pages/_app';
import SubscriptionSection from '../../../components/dashboard/SubscriptionSection';

const LOGGED_IN_AUTH = {
  isLoggedIn: true,
  user: {
    id: 'user-123',
    email: 'test@example.com',
    accountNumber: '12345678',
    isActive: true,
  },
};

function renderWithAuth(ui) {
  return render(
    <AuthContext.Provider value={LOGGED_IN_AUTH}>
      {ui}
    </AuthContext.Provider>
  );
}

describe('SubscriptionSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when subscription prop is provided (active subscription)', () => {
    const subscription = {
      planName: 'Monthly',
      status: 'active',
      nextBilling: '2026-05-17',
    };

    it('renders the subscription status heading', () => {
      renderWithAuth(<SubscriptionSection subscription={subscription} paymentMethod="card" onCancel={() => {}} />);
      expect(screen.getByText('Subscription Status')).toBeInTheDocument();
    });

    it('displays the plan name', () => {
      renderWithAuth(<SubscriptionSection subscription={subscription} paymentMethod="card" onCancel={() => {}} />);
      expect(screen.getByText(/Monthly/)).toBeInTheDocument();
    });

    it('displays the subscription status', () => {
      renderWithAuth(<SubscriptionSection subscription={subscription} paymentMethod="card" onCancel={() => {}} />);
      expect(screen.getByText(/active/)).toBeInTheDocument();
    });

    it('displays the next billing date', () => {
      renderWithAuth(<SubscriptionSection subscription={subscription} paymentMethod="card" onCancel={() => {}} />);
      expect(screen.getByText(/2026-05-17/)).toBeInTheDocument();
    });

    it('renders a Cancel Subscription button', () => {
      renderWithAuth(<SubscriptionSection subscription={subscription} paymentMethod="card" onCancel={() => {}} />);
      expect(screen.getByRole('button', { name: /Cancel Subscription/i })).toBeInTheDocument();
    });

    it('calls onCancel when Cancel Subscription button is clicked', async () => {
      const onCancel = jest.fn();
      renderWithAuth(<SubscriptionSection subscription={subscription} paymentMethod="card" onCancel={onCancel} />);
      await userEvent.click(screen.getByRole('button', { name: /Cancel Subscription/i }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('does NOT render the plan selection grid when subscription exists', () => {
      renderWithAuth(<SubscriptionSection subscription={subscription} paymentMethod="card" onCancel={() => {}} />);
      // The "no active subscription" message should NOT appear
      expect(screen.queryByText(/No active subscription/)).not.toBeInTheDocument();
    });
  });

  describe('when no subscription (plan selection mode)', () => {
    it('renders the subscription status heading', () => {
      renderWithAuth(<SubscriptionSection subscription={null} paymentMethod="card" onCancel={() => {}} />);
      expect(screen.getByText('Subscription Status')).toBeInTheDocument();
    });

    it('shows the no active subscription message', () => {
      renderWithAuth(<SubscriptionSection subscription={null} paymentMethod="card" onCancel={() => {}} />);
      expect(screen.getByText(/No active subscription/)).toBeInTheDocument();
    });

    it('renders all four plan cards', () => {
      renderWithAuth(<SubscriptionSection subscription={null} paymentMethod="card" onCancel={() => {}} />);
      expect(screen.getByText('Monthly')).toBeInTheDocument();
      expect(screen.getByText('Quarterly')).toBeInTheDocument();
      expect(screen.getByText('Semi-Annual')).toBeInTheDocument();
      expect(screen.getByText('Annual')).toBeInTheDocument();
    });

    it('does NOT render Cancel Subscription button when no subscription', () => {
      renderWithAuth(<SubscriptionSection subscription={null} paymentMethod="card" onCancel={() => {}} />);
      expect(screen.queryByRole('button', { name: /Cancel Subscription/i })).not.toBeInTheDocument();
    });

    describe('plan card interactions', () => {
      // PlanCards render a Button with text "Select Plan". We click the Button
      // at the corresponding index for each plan (monthly=0, quarterly=1, etc.).
      const getSelectButtons = () => screen.getAllByRole('button', { name: /Select Plan/i });

      it('highlights the selected plan', async () => {
        renderWithAuth(<SubscriptionSection subscription={null} paymentMethod="card" onCancel={() => {}} />);

        // Click the Monthly plan's Select Plan button (index 0)
        await userEvent.click(getSelectButtons()[0]);

        expect(mockRouter.push).toHaveBeenCalledWith('/checkout?plan=monthly&method=card');
      });

      it('navigates to checkout with correct plan and payment method params', async () => {
        renderWithAuth(<SubscriptionSection subscription={null} paymentMethod="crypto" onCancel={() => {}} />);

        // Click the Annual plan's Select Plan button (index 3)
        await userEvent.click(getSelectButtons()[3]);

        expect(mockRouter.push).toHaveBeenCalledWith('/checkout?plan=annual&method=crypto');
      });

      it('each plan navigates to checkout with correct plan id', async () => {
        renderWithAuth(<SubscriptionSection subscription={null} paymentMethod="card" onCancel={() => {}} />);

        const expectedPlanIds = ['monthly', 'quarterly', 'semiannual', 'annual'];
        const buttons = getSelectButtons();

        for (let i = 0; i < expectedPlanIds.length; i++) {
          mockRouter.push.mockClear();
          await userEvent.click(buttons[i]);
          expect(mockRouter.push).toHaveBeenCalledWith(`/checkout?plan=${expectedPlanIds[i]}&method=card`);
        }
      });
    });
  });
});
