import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AffiliatesTab from '../../components/ahoyman-dashboard/AffiliatesTab';

const mockGetAffiliates = jest.fn();
const mockCreateAffiliate = jest.fn();
const mockSuspendAffiliate = jest.fn();
const mockDeleteAffiliate = jest.fn();
const mockArchiveAffiliate = jest.fn();
const mockReactivateAffiliate = jest.fn();
const mockRegenerateAffiliateKit = jest.fn();

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    getAffiliates: (...args) => mockGetAffiliates(...args),
    createAffiliate: (...args) => mockCreateAffiliate(...args),
    suspendAffiliate: (...args) => mockSuspendAffiliate(...args),
    deleteAffiliate: (...args) => mockDeleteAffiliate(...args),
    archiveAffiliate: (...args) => mockArchiveAffiliate(...args),
    reactivateAffiliate: (...args) => mockReactivateAffiliate(...args),
    regenerateAffiliateKit: (...args) => mockRegenerateAffiliateKit(...args),
  },
}));

describe('AffiliatesTab', () => {
  const onAction = jest.fn();

  beforeEach(() => {
    mockGetAffiliates.mockResolvedValue({
      data: {
        data: [
          { id: 1, username: 'alice', status: 'active', totalEarned: 100.50, totalPaid: 80.00, pendingBalance: 20.50, totalReferrals: 5, activeReferrals: 3 },
          { id: 2, username: 'bob', status: 'suspended', totalEarned: 50.00, totalPaid: 0, pendingBalance: 0, totalReferrals: 2, activeReferrals: 0 },
        ],
        pagination: { pages: 1 },
      },
    });
  });

  it('renders loading state then affiliates table', async () => {
    mockGetAffiliates.mockResolvedValue({
      data: {
        data: [
          { id: 1, username: 'alice', status: 'active', totalEarned: 100.50, totalPaid: 80.00, pendingBalance: 20.50, totalReferrals: 5, activeReferrals: 3 },
          { id: 2, username: 'bob', status: 'suspended', totalEarned: 50.00, totalPaid: 0, pendingBalance: 0, totalReferrals: 2, activeReferrals: 0 },
        ],
        pagination: { pages: 1 },
      },
    });
    render(<AffiliatesTab onAction={onAction} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    }, { timeout: 5000 });
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('renders empty state when no affiliates', async () => {
    mockGetAffiliates.mockResolvedValue({ data: { data: [], pagination: {} } });
    render(<AffiliatesTab onAction={onAction} />);
    await waitFor(() => {
      expect(screen.getByText('No affiliates found.')).toBeInTheDocument();
    });
  });

  it('calls loadAffiliates on mount', async () => {
    render(<AffiliatesTab onAction={onAction} />);
    await waitFor(() => expect(mockGetAffiliates).toHaveBeenCalledWith({ page: 1, limit: 20 }));
  });

  it('calls onAction when affiliate is suspended', async () => {
    mockSuspendAffiliate.mockResolvedValue({});
    render(<AffiliatesTab onAction={onAction} />);
    await waitFor(() => screen.getByText('alice'));
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await waitFor(() => expect(mockSuspendAffiliate).toHaveBeenCalledWith(1));
    await waitFor(() => expect(onAction).toHaveBeenCalled());
  });

  it('calls onAction when affiliate is reactivated', async () => {
    mockReactivateAffiliate.mockResolvedValue({});
    render(<AffiliatesTab onAction={onAction} />);
    await waitFor(() => screen.getByText('bob'));
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
    await waitFor(() => expect(mockReactivateAffiliate).toHaveBeenCalledWith(2));
    await waitFor(() => expect(onAction).toHaveBeenCalled());
  });

  it('shows create form when clicking + New Affiliate', async () => {
    render(<AffiliatesTab onAction={onAction} />);
    await waitFor(() => screen.getByText('All Affiliates'));
    fireEvent.click(screen.getByRole('button', { name: '+ New Affiliate' }));
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password (min 8 chars)')).toBeInTheDocument();
  });

  it('calls createAffiliate and onAction when form is submitted', async () => {
    mockCreateAffiliate.mockResolvedValue({
      data: { data: { recoveryCodes: ['code1', 'code2'] } },
    });
    render(<AffiliatesTab onAction={onAction} />);
    await waitFor(() => screen.getByText('All Affiliates'));
    fireEvent.click(screen.getByRole('button', { name: '+ New Affiliate' }));
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByPlaceholderText('Password (min 8 chars)'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(mockCreateAffiliate).toHaveBeenCalledWith('newuser', 'password123');
    });
    await waitFor(() => expect(onAction).toHaveBeenCalled());
  });

  it('displays recovery codes after successful creation', async () => {
    mockCreateAffiliate.mockResolvedValue({
      data: { data: { recoveryCodes: ['CODE1', 'CODE2', 'CODE3'] } },
    });
    render(<AffiliatesTab onAction={onAction} />);
    await waitFor(() => screen.getByText('All Affiliates'));
    fireEvent.click(screen.getByRole('button', { name: '+ New Affiliate' }));
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByPlaceholderText('Password (min 8 chars)'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.getByText(/Recovery codes/)).toBeInTheDocument();
    });
    expect(screen.getByText('CODE1')).toBeInTheDocument();
  });

  it('renders Search button and filters by search term', async () => {
    render(<AffiliatesTab onAction={onAction} />);
    await waitFor(() => screen.getByText('All Affiliates'));
    const searchInput = screen.getByPlaceholderText('Search username...');
    fireEvent.change(searchInput, { target: { value: 'alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(mockGetAffiliates).toHaveBeenCalledWith({ page: 1, limit: 20, search: 'alice' });
    });
  });

  it('shows error message on failed affiliate creation', async () => {
    mockCreateAffiliate.mockRejectedValue({ response: { data: { error: 'Username taken' } } });
    render(<AffiliatesTab onAction={onAction} />);
    await waitFor(() => screen.getByText('All Affiliates'));
    fireEvent.click(screen.getByRole('button', { name: '+ New Affiliate' }));
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'taken' } });
    fireEvent.change(screen.getByPlaceholderText('Password (min 8 chars)'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.getByText('Username taken')).toBeInTheDocument();
    });
  });
});
