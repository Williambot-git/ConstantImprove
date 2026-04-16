import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CodesTab from '../../components/ahoyman-dashboard/CodesTab';

// Mock the api module
jest.mock('../../api/client', () => ({
  getAffiliateCodes: jest.fn(),
  getAffiliates: jest.fn(),
  createAffiliateCode: jest.fn(),
  updateAffiliateCodeDiscount: jest.fn(),
}));

import api from '../../api/client';

describe('CodesTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getAffiliateCodes.mockResolvedValue({ data: { data: [] } });
    api.getAffiliates.mockResolvedValue({ data: { data: [] } });
  });

  it('renders the component without crashing', async () => {
    render(<CodesTab />);
    expect(screen.getByText('Affiliate Codes')).toBeTruthy();
    expect(screen.getByText('Create New Code')).toBeTruthy();
  });

  it('loads codes and affiliates on mount', async () => {
    api.getAffiliateCodes.mockResolvedValue({
      data: { data: [{ id: 1, code: 'SUMMER50', affiliate_username: 'user1', clicks: 10, discount_cents: 500, active: true, created_at: '2024-01-01' }] },
    });
    api.getAffiliates.mockResolvedValue({
      data: { data: [{ id: 1, username: 'user1' }] },
    });

    render(<CodesTab />);

    await waitFor(() => {
      expect(api.getAffiliateCodes).toHaveBeenCalled();
      expect(api.getAffiliates).toHaveBeenCalled();
    });
  });

  it('shows empty state when no codes exist', async () => {
    api.getAffiliateCodes.mockResolvedValue({ data: { data: [] } });

    render(<CodesTab />);

    await waitFor(() => {
      expect(screen.getByText('No codes yet')).toBeTruthy();
    });
  });

  it('displays codes in table', async () => {
    api.getAffiliateCodes.mockResolvedValue({
      data: {
        data: [
          { id: 1, code: 'SUMMER50', affiliate_username: 'user1', clicks: 10, discount_cents: 500, active: true, created_at: '2024-01-01' },
        ],
      },
    });

    render(<CodesTab />);

    await waitFor(() => {
      expect(screen.getByText('SUMMER50')).toBeTruthy();
      expect(screen.getByText('user1')).toBeTruthy();
    });
  });

  it('validates form before submission', async () => {
    render(<CodesTab />);

    const submitButton = screen.getByRole('button', { name: /create code/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Affiliate and code are required')).toBeTruthy();
    });
  });

  it('handles code creation', async () => {
    api.getAffiliates.mockResolvedValue({ data: { data: [{ id: 1, username: 'user1' }] } });
    api.createAffiliateCode.mockResolvedValue({ data: {} });
    api.getAffiliateCodes.mockResolvedValue({ data: { data: [] } });

    render(<CodesTab />);

    await waitFor(() => {
      expect(screen.getByText('Select affiliate...')).toBeTruthy();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });

    const codeInput = screen.getByPlaceholderText('e.g. SUMMER50');
    fireEvent.change(codeInput, { target: { value: 'summer50' } });

    const submitButton = screen.getByRole('button', { name: /create code/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.createAffiliateCode).toHaveBeenCalledWith('1', 'SUMMER50', 0);
    });
  });

  it('shows success message after code creation', async () => {
    api.getAffiliates.mockResolvedValue({ data: { data: [{ id: 1, username: 'user1' }] } });
    api.createAffiliateCode.mockResolvedValue({ data: {} });
    api.getAffiliateCodes.mockResolvedValue({ data: { data: [] } });

    render(<CodesTab />);

    await waitFor(() => {
      expect(screen.getByText('Select affiliate...')).toBeTruthy();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });

    const codeInput = screen.getByPlaceholderText('e.g. SUMMER50');
    fireEvent.change(codeInput, { target: { value: 'testcode' } });

    const submitButton = screen.getByRole('button', { name: /create code/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.createAffiliateCode).toHaveBeenCalled();
    });
  });

  it('shows error message on creation failure', async () => {
    api.getAffiliates.mockResolvedValue({ data: { data: [{ id: 1, username: 'user1' }] } });
    api.createAffiliateCode.mockRejectedValue({ response: { data: { error: 'Code already exists' } } });

    render(<CodesTab />);

    await waitFor(() => {
      expect(screen.getByText('Select affiliate...')).toBeTruthy();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });

    const codeInput = screen.getByPlaceholderText('e.g. SUMMER50');
    fireEvent.change(codeInput, { target: { value: 'duplicate' } });

    const submitButton = screen.getByRole('button', { name: /create code/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.createAffiliateCode).toHaveBeenCalled();
    });
  });

  it('enables edit discount mode', async () => {
    api.getAffiliateCodes.mockResolvedValue({
      data: {
        data: [
          { id: 1, code: 'SUMMER50', affiliate_username: 'user1', clicks: 10, discount_cents: 500, active: true, created_at: '2024-01-01' },
        ],
      },
    });

    render(<CodesTab />);

    await waitFor(() => {
      expect(screen.getByText('SUMMER50')).toBeTruthy();
    });

    const editButton = screen.getByRole('button', { name: /edit discount/i });
    fireEvent.click(editButton);

    expect(screen.getByDisplayValue(500)).toBeTruthy();
  });

  it('handles discount update', async () => {
    api.getAffiliateCodes.mockResolvedValue({
      data: {
        data: [
          { id: 1, code: 'SUMMER50', affiliate_username: 'user1', clicks: 10, discount_cents: 500, active: true, created_at: '2024-01-01' },
        ],
      },
    });
    api.updateAffiliateCodeDiscount.mockResolvedValue({ data: {} });

    render(<CodesTab />);

    await waitFor(() => {
      expect(screen.getByText('SUMMER50')).toBeTruthy();
    });

    const editButton = screen.getByRole('button', { name: /edit discount/i });
    fireEvent.click(editButton);

    const input = screen.getByDisplayValue(500);
    fireEvent.change(input, { target: { value: '1000' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateAffiliateCodeDiscount).toHaveBeenCalledWith(1, 1000);
    });
  });
});
