/**
 * PayoutTab — unit tests.
 * Tests the payout request form, validation, success and error states.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PayoutTab from './PayoutTab';

jest.mock('../../api/client', () => ({
  requestAffiliatePayout: jest.fn(),
}));

describe('PayoutTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders payout tab with available balance', () => {
    const metrics = { availableToCashOut: 25.00, pendingPayout: 0 };
    render(<PayoutTab metrics={metrics} />);
    expect(screen.getByText(/\$25\.00/)).toBeInTheDocument();
    expect(screen.getByText('Request Payout')).toBeInTheDocument();
  });

  it('shows minimum payout note', () => {
    render(<PayoutTab metrics={{ availableToCashOut: 25.00 }} />);
    expect(screen.getByText(/Minimum: \$10\.00/)).toBeInTheDocument();
  });

  it('calls requestAffiliatePayout with amount on submit', async () => {
    require('../../api/client').requestAffiliatePayout.mockResolvedValue({ data: {} });
    render(<PayoutTab metrics={{ availableToCashOut: 25.00 }} />);
    await userEvent.type(screen.getByPlaceholderText('10.00'), '15.00');
    await userEvent.click(screen.getByRole('button', { name: /Request Payout/i }));
    expect(require('../../api/client').requestAffiliatePayout).toHaveBeenCalledWith(15.00);
  });

  it('displays success message after submitting', async () => {
    require('../../api/client').requestAffiliatePayout.mockResolvedValue({ data: {} });
    render(<PayoutTab metrics={{ availableToCashOut: 25.00 }} />);
    await userEvent.type(screen.getByPlaceholderText('10.00'), '15.00');
    await userEvent.click(screen.getByRole('button', { name: /Request Payout/i }));
    expect(await screen.findByText(/\$15\.00 payout request submitted/i)).toBeInTheDocument();
  });

  it('displays error message on failure', async () => {
    require('../../api/client').requestAffiliatePayout.mockRejectedValue({ response: { data: { error: 'Insufficient balance' } } });
    render(<PayoutTab metrics={{ availableToCashOut: 25.00 }} />);
    await userEvent.type(screen.getByPlaceholderText('10.00'), '15.00');
    await userEvent.click(screen.getByRole('button', { name: /Request Payout/i }));
    expect(await screen.findByText('Insufficient balance')).toBeInTheDocument();
  });

  it('disables button when balance below minimum', () => {
    render(<PayoutTab metrics={{ availableToCashOut: 5.00 }} />);
    expect(screen.getByRole('button', { name: /Request Payout/i })).toBeDisabled();
  });
});
