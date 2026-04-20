import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PayoutsTab from '../../components/ahoyman-dashboard/PayoutsTab';

// Mock the api module
jest.mock('../../api/client', () => ({
  getPayoutRequests: jest.fn(),
  approvePayout: jest.fn(),
  rejectPayout: jest.fn(),
  logManualPayout: jest.fn(),
}));

import api from '../../api/client';

describe('PayoutsTab', () => {
  const mockOnAction = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    api.getPayoutRequests.mockResolvedValue({
      data: { data: [] },
    });
  });

  it('renders the component without crashing', async () => {
    render(<PayoutsTab onAction={mockOnAction} />);
    expect(screen.getByText('Log Manual Payment')).toBeTruthy();
    expect(screen.getByText('Payout Requests')).toBeTruthy();
  });

  it('loads payout requests on mount', async () => {
    api.getPayoutRequests.mockResolvedValue({
      data: {
        data: [
          { id: 1, affiliate_username: 'user1', amount: 100, status: 'pending', requested_at: '2024-01-01' },
        ],
      },
    });

    render(<PayoutsTab onAction={mockOnAction} />);

    await waitFor(() => {
      expect(api.getPayoutRequests).toHaveBeenCalledWith({});
    });
  });

  it('filters payouts by status', async () => {
    render(<PayoutsTab onAction={mockOnAction} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'pending' } });

    await waitFor(() => {
      expect(api.getPayoutRequests).toHaveBeenCalledWith({ status: 'pending' });
    });
  });

  it('handles manual payout submission', async () => {
    api.logManualPayout.mockResolvedValue({ data: {} });

    render(<PayoutsTab onAction={mockOnAction} />);

    const inputs = screen.getAllByRole('textbox');
    const affiliateInput = inputs[0];
    const amountInput = inputs[1];

    fireEvent.change(affiliateInput, { target: { value: 'testuser' } });
    fireEvent.change(amountInput, { target: { value: '50' } });

    const form = screen.getByText('Log Payment').closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(api.logManualPayout).toHaveBeenCalled();
    });
    expect(api.logManualPayout.mock.calls[0][0]).toBe('testuser');
  });

  it('displays error message on failed manual payout', async () => {
    api.logManualPayout.mockRejectedValue({
      response: { data: { error: 'Invalid affiliate' } },
    });

    render(<PayoutsTab onAction={mockOnAction} />);

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'baduser' } });
    fireEvent.change(inputs[1], { target: { value: '50.00' } });

    const form = screen.getByText('Log Payment').closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Invalid affiliate')).toBeTruthy();
    });
  });

  it('handles approve payout', async () => {
    api.getPayoutRequests.mockResolvedValue({
      data: {
        data: [
          { id: 1, affiliate_username: 'user1', amount: 100, status: 'pending', requested_at: '2024-01-01' },
        ],
      },
    });
    api.approvePayout.mockResolvedValue({ data: {} });

    render(<PayoutsTab onAction={mockOnAction} />);

    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => {
      expect(api.approvePayout).toHaveBeenCalledWith(1);
    });
  });

  it('handles reject payout', async () => {
    global.prompt = jest.fn().mockReturnValue('Test rejection reason');

    api.getPayoutRequests.mockResolvedValue({
      data: {
        data: [
          { id: 1, affiliate_username: 'user1', amount: 100, status: 'pending', requested_at: '2024-01-01' },
        ],
      },
    });
    api.rejectPayout.mockResolvedValue({ data: {} });

    render(<PayoutsTab onAction={mockOnAction} />);

    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Reject'));

    await waitFor(() => {
      expect(api.rejectPayout).toHaveBeenCalledWith(1, 'Test rejection reason');
    });
  });

  it('shows empty state when no payouts', async () => {
    api.getPayoutRequests.mockResolvedValue({ data: { data: [] } });

    render(<PayoutsTab onAction={mockOnAction} />);

    await waitFor(() => {
      expect(screen.getByText('No payout requests.')).toBeTruthy();
    });
  });

  // ── Error path coverage: catch blocks call window.alert instead of setState ──
  it('handleApprove: calls alert on API failure', async () => {
    global.alert = jest.fn();
    api.getPayoutRequests.mockResolvedValue({
      data: { data: [{ id: 1, affiliate_username: 'user1', amount: 100, status: 'pending' }] },
    });
    api.approvePayout.mockRejectedValue(new Error('Network error'));

    render(<PayoutsTab onAction={mockOnAction} />);

    await waitFor(() => { expect(screen.getByText('Approve')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith('Failed to approve.');
    });
    delete global.alert;
  });

  it('handleReject: calls alert on API failure', async () => {
    global.prompt = jest.fn().mockReturnValue('Test reason');
    global.alert = jest.fn();
    api.getPayoutRequests.mockResolvedValue({
      data: { data: [{ id: 1, affiliate_username: 'user1', amount: 100, status: 'pending' }] },
    });
    api.rejectPayout.mockRejectedValue(new Error('Network error'));

    render(<PayoutsTab onAction={mockOnAction} />);

    await waitFor(() => { expect(screen.getByText('Reject')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Reject'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith('Failed to reject.');
    });
    delete global.prompt;
    delete global.alert;
  });
});
