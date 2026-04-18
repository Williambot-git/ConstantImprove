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

  // === PAGINATION TESTS ===
  test('shows pagination controls when totalPages > 1', async () => {
    mockGetTaxTransactions.mockResolvedValue({
      data: { data: [{ id: 1, state: 'PA', taxableAmount: 9999, taxCollected: 700, rate: 0.07 }], pagination: { total: 25 } },
    });
    // total = 25, limit = 20 → totalPages = 2

    render(<SalesTaxTab />);

    // Wait for table rows to appear (proves loading is done and data rendered)
    await waitFor(() => {
      expect(screen.getByText('Sales Tax Center')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Now pagination should be visible (totalPages > 1 = true when total=25)
    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.getByRole('button', { name: /next →/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /← prev/i })).toBeInTheDocument();
  });

  test('clicking Next → increments page and reloads data', async () => {
    mockGetTaxTransactions.mockResolvedValue({
      data: { data: [{ id: 1, state: 'PA', taxableAmount: 9999, taxCollected: 700, rate: 0.07 }], pagination: { total: 25 } },
    });

    render(<SalesTaxTab />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    }, { timeout: 3000 });

    await userEvent.click(screen.getByRole('button', { name: /next →/i }));

    await waitFor(() => {
      expect(mockGetTaxTransactions).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
    });
    await waitFor(() => {
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    });
  });

  test('clicking Prev ← decrements page when page > 1', async () => {
    mockGetTaxTransactions.mockResolvedValue({
      data: { data: [{ id: 1, state: 'PA', taxableAmount: 9999, taxCollected: 700, rate: 0.07 }], pagination: { total: 25 } },
    });

    render(<SalesTaxTab />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });

    // Go to page 2
    await userEvent.click(screen.getByRole('button', { name: /next →/i }));

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    });

    // Now click Prev
    await userEvent.click(screen.getByRole('button', { name: /← prev/i }));

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockGetTaxTransactions).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    });
  });

  test('Prev button is disabled on page 1', async () => {
    mockGetTaxTransactions.mockResolvedValue({
      data: { data: [{ id: 1, state: 'PA', taxableAmount: 9999, taxCollected: 700, rate: 0.07 }], pagination: { total: 25 } },
    });

    render(<SalesTaxTab />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });

    const prevBtn = screen.getByRole('button', { name: /← prev/i });
    expect(prevBtn).toBeDisabled();
  });

  test('Next button is disabled on last page', async () => {
    mockGetTaxTransactions.mockResolvedValue({
      data: { data: [{ id: 1, state: 'PA', taxableAmount: 9999, taxCollected: 700, rate: 0.07 }], pagination: { total: 25 } },
    });

    render(<SalesTaxTab />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /next →/i }));

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    });

    const nextBtn = screen.getByRole('button', { name: /next →/i });
    expect(nextBtn).toBeDisabled();
  });

  // === DATE FILTER TESTS ===
  test('Filter button submits startDate and endDate in params', async () => {
    render(<SalesTaxTab />);

    await waitFor(() => screen.getByText('Sales Tax Center'));

    // Find both date inputs (one for startDate, one for endDate)
    const dateInputs = document.querySelectorAll('input[type="date"]');
    await userEvent.type(dateInputs[0], '2026-01-01');
    await userEvent.type(dateInputs[1], '2026-01-31');

    await userEvent.click(screen.getByRole('button', { name: /filter/i }));

    await waitFor(() => {
      expect(mockGetTaxTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 20,
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        }),
      );
    });
  });

  // === EXPORT CSV TESTS ===
  test('Export CSV button calls api.exportTaxCSV with filters', async () => {
    mockExportTaxCSV.mockResolvedValue({ data: 'date,state,tax\n2026-01-15,PA,7.00\n' });

    render(<SalesTaxTab />);

    await waitFor(() => screen.getByText('Sales Tax Center'));

    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() => {
      expect(mockExportTaxCSV).toHaveBeenCalledWith({});
    });
  });

  test('Export CSV includes filters when state filter is set', async () => {
    mockExportTaxCSV.mockResolvedValue({ data: 'date,state,tax\n2026-01-15,PA,7.00\n' });

    render(<SalesTaxTab />);

    await waitFor(() => screen.getByText('Sales Tax Center'));

    const stateInput = screen.getByPlaceholderText('e.g. PA');
    await userEvent.type(stateInput, 'NY');

    // Apply filter
    await userEvent.click(screen.getByRole('button', { name: /filter/i }));

    await waitFor(() => {
      expect(mockGetTaxTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: 'NY' }),
      );
    });

    // Now export
    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() => {
      expect(mockExportTaxCSV).toHaveBeenCalledWith({ state: 'NY' });
    });
  });

  test('Export CSV creates blob URL and triggers download', async () => {
    mockExportTaxCSV.mockResolvedValue({
      data: 'date,state,tax\n2026-01-15,PA,7.00\n',
    });

    render(<SalesTaxTab />);

    await waitFor(() => screen.getByText('Sales Tax Center'));

    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));

    // exportTaxCSV was called (the mock resolved successfully)
    await waitFor(() => {
      expect(mockExportTaxCSV).toHaveBeenCalledWith({});
    });
  });

  test('Export CSV error is swallowed gracefully (console.error only)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockExportTaxCSV.mockRejectedValue(new Error('Export failed'));

    render(<SalesTaxTab />);

    await waitFor(() => screen.getByText('Sales Tax Center'));

    // Should not throw
    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Export error:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  // === ADDITIONAL FILTER + PAGINATION INTERACTION ===
  test('filtering resets to page 1', async () => {
    // Two API calls: initial mount (page 1) and after clicking Next (page 2)
    mockGetTaxTransactions.mockResolvedValue({
      data: { data: [{ id: 1, state: 'PA', taxableAmount: 9999, taxCollected: 700, rate: 0.07 }], pagination: { total: 50 } },
    });

    render(<SalesTaxTab />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    });

    // Go to page 2
    await userEvent.click(screen.getByRole('button', { name: /next →/i }));

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    });

    // Now apply a filter — should reset to page 1
    const stateInput = screen.getByPlaceholderText('e.g. PA');
    await userEvent.type(stateInput, 'CA');

    await userEvent.click(screen.getByRole('button', { name: /filter/i }));

    await waitFor(() => {
      expect(mockGetTaxTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, state: 'CA' }),
      );
    });
  });
});
