import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import SalesTaxTab from '../../components/ahoyman-dashboard/SalesTaxTab';

const mockGetTaxTransactions = jest.fn();
const mockGetTaxSummary = jest.fn();
const mockExportTaxCSV = jest.fn();

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    getTaxTransactions: (...args) => mockGetTaxTransactions(...args),
    getTaxSummary: (...args) => mockGetTaxSummary(...args),
    exportTaxCSV: (...args) => mockExportTaxCSV(...args),
  },
}));

describe('SalesTaxTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTaxTransactions.mockResolvedValue({
      data: {
        data: [
          {
            id: 1,
            state: 'PA',
            taxableAmount: 9999,
            taxCollected: 700,
            rate: 0.07,
            created_at: '2026-01-15T10:00:00Z',
          },
          {
            id: 2,
            state: 'CA',
            taxableAmount: 14999,
            taxCollected: 1275,
            rate: 0.085,
            created_at: '2026-01-20T14:30:00Z',
          },
        ],
        pagination: { total: 2 },
      },
    });
    mockGetTaxSummary.mockResolvedValue({
      data: {
        data: {
          totalTaxCents: 1975,
          totalTransactions: 2,
          averageRate: 0.0775,
          byState: [],
        },
      },
    });
  });

  test('renders Sales Tax Center heading after load', async () => {
    render(<SalesTaxTab />);

    await waitFor(() => {
      expect(screen.getByText('Sales Tax Center')).toBeInTheDocument();
    });
  });

  test('loads tax transactions and summary on mount', async () => {
    render(<SalesTaxTab />);

    await waitFor(() => {
      expect(mockGetTaxTransactions).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });
    expect(mockGetTaxSummary).toHaveBeenCalled();
  });

  test('displays summary cards with tax data', async () => {
    render(<SalesTaxTab />);

    await waitFor(() => {
      // Total Tax Collected = $19.75 (1975 cents / 100)
      expect(screen.getByText(/\$19\.75/)).toBeInTheDocument();
    });

    // Transactions count — look for the label text "Transactions" not the raw digit
    // (digit "2" also appears in date "01/02/2026" and rate "0.07")
    expect(screen.getByText('Transactions')).toBeInTheDocument();
  });

  test('displays state breakdown when byState is present', async () => {
    mockGetTaxSummary.mockResolvedValue({
      data: {
        data: {
          totalTaxCents: 1975,
          totalTransactions: 2,
          averageRate: 0.0775,
          byState: [
            { state: 'PA', total_tax_cents: 700 },
            { state: 'CA', total_tax_cents: 1275 },
          ],
        },
      },
    });

    render(<SalesTaxTab />);

    await waitFor(() => {
      expect(screen.getByText('Tax by State')).toBeInTheDocument();
    });
    // Tax by state shows state abbreviation and amount
    const paLabel = screen.getAllByText('PA');
    expect(paLabel.length).toBeGreaterThan(0);
  });

  test('calls loadTaxData with filter when Filter button is clicked', async () => {
    render(<SalesTaxTab />);

    await waitFor(() => screen.getByText('Sales Tax Center'));

    const stateInput = screen.getByPlaceholderText('e.g. PA');
    await userEvent.type(stateInput, 'NY');

    const filterBtn = screen.getByRole('button', { name: /filter/i });
    await userEvent.click(filterBtn);

    await waitFor(() => {
      expect(mockGetTaxTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'NY', page: 1 }),
      );
    });
  });

  test('shows empty state when no transactions', async () => {
    mockGetTaxTransactions.mockResolvedValue({ data: { data: [], pagination: { total: 0 } } });
    mockGetTaxSummary.mockResolvedValue({
      data: { data: { totalTaxCents: 0, totalTransactions: 0, averageRate: 0, byState: [] } },
    });

    render(<SalesTaxTab />);

    await waitFor(() => {
      expect(screen.getByText(/no tax transactions/i)).toBeInTheDocument();
    });
  });

  test('handles API error gracefully without crashing', async () => {
    mockGetTaxTransactions.mockRejectedValue(new Error('Network error'));
    mockGetTaxSummary.mockRejectedValue(new Error('Network error'));

    render(<SalesTaxTab />);

    await waitFor(() => {
      // Component renders even after error
      expect(screen.getByText('Sales Tax Center')).toBeInTheDocument();
    });
  });
});
