/**
 * AffiliatesTab — Unit Tests
 * ===========================
 * Tests the admin AffiliatesTab component (affiliate table, disable, adjust, CSV export).
 *
 * COVERAGE TARGETS (from parent coverage report):
 * - Line 30: confirm returns false → early return (disable cancelled)
 * - Line 35: catch block in handleDisableAffiliate (disable throws)
 * - Line 50-51: isNaN check → alert and early return
 * - Line 59: catch block in handleAdjustEarnings (adjust throws)
 *
 * MOCKS:
 * - api/client: disableAffiliate, adjustAffiliateEarnings
 */

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../../../api/client', () => ({
  __esModule: true,
  default: {
    disableAffiliate: jest.fn(),
    adjustAffiliateEarnings: jest.fn(),
  },
}));

import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import React from 'react';
import AffiliatesTab from '../../../components/admin/AffiliatesTab';

const MOCK_AFFILIATES = [
  {
    id: 'aff-1',
    account_number: 'ACC001',
    code: 'WILLIAM10',
    active_referrals: 42,
    total_commission_cents: 150000,
    pending_payout_cents: 25000,
    is_active: true,
  },
  {
    id: 'aff-2',
    account_number: 'ACC002',
    code: 'ALEX20',
    active_referrals: 0,
    total_commission_cents: 0,
    pending_payout_cents: 0,
    is_active: false,
  },
];

describe('AffiliatesTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  test('renders affiliate table with data', async () => {
    render(<AffiliatesTab affiliates={MOCK_AFFILIATES} onRefresh={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('ACC001')).toBeInTheDocument();
      expect(screen.getByText('ACC002')).toBeInTheDocument();
    });
  });

  test('renders empty state when no affiliates', async () => {
    render(<AffiliatesTab affiliates={[]} onRefresh={jest.fn()} />);
    expect(screen.getByText('No affiliates found.')).toBeInTheDocument();
  });

  test('renders Export CSV and Refresh buttons', async () => {
    render(<AffiliatesTab affiliates={MOCK_AFFILIATES} onRefresh={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });

  test('shows Active/Disabled status with correct colors', async () => {
    render(<AffiliatesTab affiliates={MOCK_AFFILIATES} onRefresh={jest.fn()} />);

    await waitFor(() => {
      // First affiliate is_active=true → green text "Active"
      // Second affiliate is_active=false → red text "Disabled"
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Disable Affiliate — Line 30: confirm returns false
  // -------------------------------------------------------------------------
  test('handleDisableAffiliate returns early when confirm is cancelled', async () => {
    const api = require('../../../api/client').default;
    const onRefresh = jest.fn();
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => false); // user clicks Cancel

    render(<AffiliatesTab affiliates={MOCK_AFFILIATES} onRefresh={onRefresh} />);
    await waitFor(() => screen.getByText('ACC001'));

    const disableBtn = screen.getAllByRole('button', { name: /Disable/i })[0];
    await userEvent.click(disableBtn);

    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to disable this affiliate? They will no longer earn commissions.'
    );
    expect(api.disableAffiliate).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();

    window.confirm = originalConfirm;
  });

  // -------------------------------------------------------------------------
  // Disable Affiliate — Line 35: catch block
  // -------------------------------------------------------------------------
  test('handleDisableAffiliate calls onRefresh after successful disable', async () => {
    const api = require('../../../api/client').default;
    const onRefresh = jest.fn();
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);
    api.disableAffiliate.mockResolvedValue({ data: { success: true } });

    render(<AffiliatesTab affiliates={MOCK_AFFILIATES} onRefresh={onRefresh} />);
    await waitFor(() => screen.getByText('ACC001'));

    const disableBtn = screen.getAllByRole('button', { name: /Disable/i })[0];
    await userEvent.click(disableBtn);

    await waitFor(() => {
      expect(api.disableAffiliate).toHaveBeenCalledWith('aff-1');
      expect(onRefresh).toHaveBeenCalled();
    });

    window.confirm = originalConfirm;
  });

  // -------------------------------------------------------------------------
  // Adjust Earnings — Line 50-51: isNaN check
  // -------------------------------------------------------------------------
  test('handleAdjustEarnings shows alert and returns early when amount is not a number', async () => {
    const originalPrompt = window.prompt;
    const originalAlert = window.alert;
    window.prompt = jest.fn()
      .mockReturnValueOnce('not-a-number')  // amount prompt returns non-numeric
      .mockReturnValueOnce('Test reason');  // reason prompt (not reached due to early return)
    window.alert = jest.fn();

    render(<AffiliatesTab affiliates={MOCK_AFFILIATES} onRefresh={jest.fn()} />);
    await waitFor(() => screen.getByText('ACC001'));

    const adjustBtn = screen.getAllByRole('button', { name: /Adjust/i })[0];
    await userEvent.click(adjustBtn);

    expect(window.alert).toHaveBeenCalledWith('Invalid amount');
    expect(window.prompt).toHaveBeenCalledTimes(1); // only amount prompt called, then early return

    window.prompt = originalPrompt;
    window.alert = originalAlert;
  });

  test('handleAdjustEarnings proceeds when amount is a valid number', async () => {
    const api = require('../../../api/client').default;
    const originalPrompt = window.prompt;
    window.prompt = jest.fn()
      .mockReturnValueOnce('5000')  // amount
      .mockReturnValueOnce('Bonus'); // reason
    api.adjustAffiliateEarnings.mockResolvedValue({ data: { success: true } });

    render(<AffiliatesTab affiliates={MOCK_AFFILIATES} onRefresh={jest.fn()} />);
    await waitFor(() => screen.getByText('ACC001'));

    const adjustBtn = screen.getAllByRole('button', { name: /Adjust/i })[0];
    await userEvent.click(adjustBtn);

    await waitFor(() => {
      expect(api.adjustAffiliateEarnings).toHaveBeenCalledWith('aff-1', 5000, 'Bonus');
    });

    window.prompt = originalPrompt;
  });

  // -------------------------------------------------------------------------
  // Adjust Earnings — Line 59: catch block
  // -------------------------------------------------------------------------
  test('handleAdjustEarnings does not call onRefresh when API throws', async () => {
    const api = require('../../../api/client').default;
    const onRefresh = jest.fn();
    const originalPrompt = window.prompt;
    const originalAlert = window.alert;
    window.prompt = jest.fn()
      .mockReturnValueOnce('100')
      .mockReturnValueOnce('Deduction');
    window.alert = jest.fn();
    api.adjustAffiliateEarnings.mockRejectedValue(new Error('Server error'));

    render(<AffiliatesTab affiliates={MOCK_AFFILIATES} onRefresh={onRefresh} />);
    await waitFor(() => screen.getByText('ACC001'));

    const adjustBtn = screen.getAllByRole('button', { name: /Adjust/i })[0];
    await userEvent.click(adjustBtn);

    await waitFor(() => {
      expect(api.adjustAffiliateEarnings).toHaveBeenCalled();
      expect(onRefresh).not.toHaveBeenCalled();
    });

    window.prompt = originalPrompt;
    window.alert = originalAlert;
  });

  // -------------------------------------------------------------------------
  // CSV Export
  // -------------------------------------------------------------------------
  test('Export CSV creates a Blob and triggers download', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    let capturedBlob = null;
    URL.createObjectURL = jest.fn((blob) => {
      capturedBlob = blob;
      return 'blob:http://localhost/test-id';
    });
    URL.revokeObjectURL = jest.fn();

    render(<AffiliatesTab affiliates={MOCK_AFFILIATES} onRefresh={jest.fn()} />);
    await waitFor(() => screen.getByText('ACC001'));

    const exportBtn = screen.getByRole('button', { name: /Export CSV/i });
    await userEvent.click(exportBtn);

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(capturedBlob).toBeInstanceOf(Blob);
    expect(capturedBlob.type).toBe('text/csv');

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  // -------------------------------------------------------------------------
  // Refresh Button
  // -------------------------------------------------------------------------
  test('Refresh button calls onRefresh', async () => {
    const onRefresh = jest.fn();
    render(<AffiliatesTab affiliates={MOCK_AFFILIATES} onRefresh={onRefresh} />);
    await waitFor(() => screen.getByText('ACC001'));

    await userEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    expect(onRefresh).toHaveBeenCalled();
  });
});
