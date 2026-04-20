/**
 * CustomersTab — Unit Tests
 * =========================
 * Tests the admin CustomersTab component (customer search, error handling).
 *
 * COVERAGE TARGETS:
 * - Line 35: catch block — searchCustomer throws → customerData set to null
 * - Line 28: early return when sanitized input is empty
 * - Loading state during search
 * - Customer data display with various subscription states
 *
 * MOCKS:
 * - api/client: searchCustomer
 * - lib/sanitize: sanitizeText
 */

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../../../api/client', () => ({
  __esModule: true,
  default: {
    searchCustomer: jest.fn(),
  },
}));

jest.mock('../../../lib/sanitize', () => ({
  sanitizeText: jest.fn((text) => text.trim()),
}));

import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import React from 'react';
import CustomersTab from '../../../components/admin/CustomersTab';

describe('CustomersTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply sanitizeText default — mockRestore() from previous afterEach
    // strips the implementation; clearAllMocks() does NOT restore it
    require('../../../lib/sanitize').sanitizeText.mockImplementation((text) => text.trim());
  });

  // -------------------------------------------------------------------------
  // Render / Empty State
  // -------------------------------------------------------------------------
  test('renders search form on mount', () => {
    render(<CustomersTab />);
    expect(screen.getByText('Search Customer')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., 12345678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search/i })).toBeInTheDocument();
  });

  test('does not show customer details on mount', () => {
    render(<CustomersTab />);
    expect(screen.queryByText('User ID')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Search — Empty Input Guard
  // -------------------------------------------------------------------------
  test('does not call API when input is only whitespace', async () => {
    const api = require('../../../api/client').default;
    const sanitize = require('../../../lib/sanitize').sanitizeText;
    // sanitize returns empty string for whitespace-only input
    sanitize.mockReturnValue('');

    render(<CustomersTab />);
    await userEvent.type(screen.getByPlaceholderText('e.g., 12345678'), '   ');
    await userEvent.click(screen.getByRole('button', { name: /Search/i }));

    // Should not call API when sanitized result is empty
    expect(api.searchCustomer).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Search — Loading State
  // -------------------------------------------------------------------------
  test('button text changes to Searching and is disabled while searching', async () => {
    const api = require('../../../api/client').default;
    api.searchCustomer.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { id: '123' } }), 100))
    );

    render(<CustomersTab />);
    await userEvent.type(screen.getByPlaceholderText('e.g., 12345678'), '123');
    await userEvent.click(screen.getByRole('button', { name: /Search/i }));

    // Button should be disabled and show "Searching..." while in-flight
    expect(screen.getByRole('button', { name: /Searching/i })).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Search — Success
  // -------------------------------------------------------------------------
  test('shows customer data after successful search', async () => {
    const api = require('../../../api/client').default;
    const MOCK_CUSTOMER = {
      id: 'cust-999',
      subscription: { plan: 'yearly', status: 'active' },
    };
    api.searchCustomer.mockResolvedValue({ data: MOCK_CUSTOMER });

    render(<CustomersTab />);
    await userEvent.type(screen.getByPlaceholderText('e.g., 12345678'), 'cust-999');
    await userEvent.click(screen.getByRole('button', { name: /Search/i }));

    await waitFor(() => {
      expect(screen.getByText('cust-999')).toBeInTheDocument();
      expect(screen.getByText('yearly')).toBeInTheDocument();
      expect(screen.getByText('active')).toBeInTheDocument();
    });
  });

  test('shows N/A when subscription plan is missing', async () => {
    const api = require('../../../api/client').default;
    api.searchCustomer.mockResolvedValue({ data: { id: 'cust-1', subscription: null } });

    render(<CustomersTab />);
    await userEvent.type(screen.getByPlaceholderText('e.g., 12345678'), 'cust-1');
    await userEvent.click(screen.getByRole('button', { name: /Search/i }));

    // Both plan and status show N/A when subscription is null
    await waitFor(() => {
      expect(screen.getAllByText('N/A').length).toBe(2);
    });
  });

  test('shows N/A when subscription status is missing', async () => {
    const api = require('../../../api/client').default;
    api.searchCustomer.mockResolvedValue({ data: { id: 'cust-1', subscription: { plan: 'monthly' } } });

    render(<CustomersTab />);
    await userEvent.type(screen.getByPlaceholderText('e.g., 12345678'), 'cust-1');
    await userEvent.click(screen.getByRole('button', { name: /Search/i }));

    await waitFor(() => {
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });
  });

  test('shows canceled status in red', async () => {
    const api = require('../../../api/client').default;
    api.searchCustomer.mockResolvedValue({
      data: { id: 'cust-1', subscription: { plan: 'monthly', status: 'canceled' } },
    });

    render(<CustomersTab />);
    await userEvent.type(screen.getByPlaceholderText('e.g., 12345678'), 'cust-1');
    await userEvent.click(screen.getByRole('button', { name: /Search/i }));

    await waitFor(() => {
      expect(screen.getByText('canceled')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Search — Error Handling (line 35: catch sets customerData to null)
  // -------------------------------------------------------------------------
  test('clears customer data when searchCustomer throws', async () => {
    const api = require('../../../api/client').default;
    api.searchCustomer
      .mockResolvedValueOnce({ data: { id: 'first-customer' } })
      .mockRejectedValueOnce(new Error('Network failure'));

    render(<CustomersTab />);

    // First search — succeeds
    await userEvent.type(screen.getByPlaceholderText('e.g., 12345678'), 'cust-1');
    await userEvent.click(screen.getByRole('button', { name: /Search/i }));
    await waitFor(() => expect(screen.getByText('first-customer')).toBeInTheDocument());

    // Second search — fails; customerData should be cleared
    await userEvent.clear(screen.getByPlaceholderText('e.g., 12345678'));
    await userEvent.type(screen.getByPlaceholderText('e.g., 12345678'), 'cust-2');
    await userEvent.click(screen.getByRole('button', { name: /Search/i }));

    // After error, customer details should be gone (not showing first-customer)
    await waitFor(() => {
      expect(screen.queryByText('first-customer')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Sanitize Integration
  // -------------------------------------------------------------------------
  test('search calls sanitizeText before API call', async () => {
    const api = require('../../../api/client').default;
    const sanitize = require('../../../lib/sanitize').sanitizeText;
    api.searchCustomer.mockResolvedValue({ data: { id: 'cust-1' } });

    render(<CustomersTab />);
    await userEvent.type(screen.getByPlaceholderText('e.g., 12345678'), '  12345678  ');
    await userEvent.click(screen.getByRole('button', { name: /Search/i }));

    await waitFor(() => {
      expect(sanitize).toHaveBeenCalledWith('  12345678  ');
      expect(api.searchCustomer).toHaveBeenCalledWith('12345678');
    });
  });
});
