/**
 * OverviewTab — unit tests.
 * Tests the recovery kit state machine (step 0 = idle, 1 = confirming, 2 = showing codes).
 *
 * MOVED FROM: frontend/components/affiliate-dashboard/OverviewTab.test.jsx
 * REASON: Jest only discovers tests under frontend/tests/ (per jest.config.js roots).
 *         The original location was in the components/ directory — tests were never run.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import OverviewTab from '../../components/affiliate-dashboard/OverviewTab';

jest.mock('../../api/client', () => ({
  affiliateRegenerateKit: jest.fn(),
}));

describe('OverviewTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders attribution rules and recovery kit heading', async () => {
    render(<OverviewTab />);
    expect(screen.getByText(/30-day attribution/i)).toBeInTheDocument();
    expect(screen.getByText('Recovery Kit')).toBeInTheDocument();
  });

  it('shows generate form by default', async () => {
    render(<OverviewTab />);
    expect(screen.getByPlaceholderText('Your current password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Recovery Kit/i })).toBeInTheDocument();
  });

  it('calls affiliateRegenerateKit with password on submit', async () => {
    const mockAffiliateRegenerateKit = require('../../api/client').affiliateRegenerateKit;
    mockAffiliateRegenerateKit.mockResolvedValue({ data: { recoveryCodes: ['CODE1', 'CODE2'] } });

    render(<OverviewTab />);
    await userEvent.type(screen.getByPlaceholderText('Your current password'), 'testpassword123');
    await userEvent.click(screen.getByRole('button', { name: /Generate Recovery Kit/i }));

    expect(mockAffiliateRegenerateKit).toHaveBeenCalledWith('testpassword123');
  });

  it('displays recovery codes after successful generation', async () => {
    const mockAffiliateRegenerateKit = require('../../api/client').affiliateRegenerateKit;
    mockAffiliateRegenerateKit.mockResolvedValue({ data: { recoveryCodes: ['ALPHA1', 'BETA2'] } });

    render(<OverviewTab />);
    await userEvent.type(screen.getByPlaceholderText('Your current password'), 'testpassword123');
    await userEvent.click(screen.getByRole('button', { name: /Generate Recovery Kit/i }));

    expect(await screen.findByText('ALPHA1')).toBeInTheDocument();
    expect(screen.getByText('BETA2')).toBeInTheDocument();
    expect(screen.getByText(/Save these codes now/i)).toBeInTheDocument();
  });

  it('shows error message on failed generation', async () => {
    const mockAffiliateRegenerateKit = require('../../api/client').affiliateRegenerateKit;
    mockAffiliateRegenerateKit.mockRejectedValue({ response: { data: { error: 'Invalid password' } } });

    render(<OverviewTab />);
    await userEvent.type(screen.getByPlaceholderText('Your current password'), 'wrongpassword');
    await userEvent.click(screen.getByRole('button', { name: /Generate Recovery Kit/i }));

    expect(await screen.findByText('Invalid password')).toBeInTheDocument();
  });
});
