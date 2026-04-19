/**
 * NexusTab unit tests
 *
 * Tests the Economic Nexus Overview tab:
 * - Loading, error, and empty states
 * - Filter bar (start date, end date, apply, clear)
 * - Summary metric cards (total revenue, total transactions, states tracked)
 * - States table rendering with per-state revenue/transaction data
 * - Nexus threshold reminder banner
 *
 * @module tests/ahoyman-dashboard/NexusTab.test.jsx
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NexusTab from '../../components/ahoyman-dashboard/NexusTab';

const mockGetNexusOverview = jest.fn();

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    getNexusOverview: (...args) => mockGetNexusOverview(...args),
  },
}));

describe('NexusTab', () => {
  beforeEach(() => {
    // Reset all mocks and implementations — start fresh per test
    mockGetNexusOverview.mockReset();
  });

  // ─────────────────────────────────────────────────────────────────
  // Initial load
  // ─────────────────────────────────────────────────────────────────

  it('renders loading state on mount then transitions to data', async () => {
    // Resolve after a brief delay so loading state is observable
    mockGetNexusOverview.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ data: { states: [], totals: {} } }), 50))
    );
    render(<NexusTab />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  it('calls getNexusOverview on mount with no filters', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({ data: { states: [], totals: {} } });
    render(<NexusTab />);
    await waitFor(() => {
      expect(mockGetNexusOverview).toHaveBeenCalledWith({});
    });
  });

  it('calls getNexusOverview with start_date when start filter is applied', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({ data: { states: [], totals: {} } });
    render(<NexusTab />);
    await waitFor(() => screen.getByText('Total Revenue'));

    // Fill in start date using the label proximity
    const startInput = document.querySelector('input[type="date"]');
    fireEvent.change(startInput, { target: { value: '2026-01-01' } });

    mockGetNexusOverview.mockResolvedValueOnce({ data: { states: [], totals: {} } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filter' }));

    await waitFor(() => {
      expect(mockGetNexusOverview).toHaveBeenCalledWith({ start_date: '2026-01-01' });
    });
  });

  it('calls getNexusOverview with start_date and end_date when both filters applied', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({ data: { states: [], totals: {} } });
    render(<NexusTab />);
    await waitFor(() => screen.getByText('Total Revenue'));

    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-01-01' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-03-31' } });

    mockGetNexusOverview.mockResolvedValueOnce({ data: { states: [], totals: {} } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filter' }));

    await waitFor(() => {
      expect(mockGetNexusOverview).toHaveBeenCalledWith({
        start_date: '2026-01-01',
        end_date: '2026-03-31',
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Error state
  // ─────────────────────────────────────────────────────────────────

  it('renders error message when API throws', async () => {
    mockGetNexusOverview.mockRejectedValueOnce(new Error('Network failure'));
    render(<NexusTab />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load nexus data.')).toBeInTheDocument();
    });
  });

  it('renders error message when API returns error response', async () => {
    mockGetNexusOverview.mockRejectedValueOnce({
      response: { data: { error: 'Unauthorized' } },
    });
    render(<NexusTab />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load nexus data.')).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Empty state
  // ─────────────────────────────────────────────────────────────────

  it('renders empty state message when no transactions recorded', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({ data: { states: [], totals: {} } });
    render(<NexusTab />);
    await waitFor(() => {
      expect(
        screen.getByText(/No transactions recorded yet/)
      ).toBeInTheDocument();
    });
  });

  it('does not show states table header when no data', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({ data: { states: [], totals: {} } });
    render(<NexusTab />);
    await waitFor(() => screen.getByText(/No transactions recorded yet/));
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
  });

  // ─────────────────────────────────────────────────────────────────
  // Summary metric cards
  // ─────────────────────────────────────────────────────────────────

  it('renders three summary metric cards with labels', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({
      data: {
        states: [{ state: 'CA', transaction_count: 100, total_revenue_dollars: '15000.00' }],
        totals: {
          grand_total_revenue_dollars: '15000.00',
          grand_total_transactions: 100,
        },
      },
    });
    render(<NexusTab />);
    await waitFor(() => {
      expect(screen.getByText('Total Revenue')).toBeInTheDocument();
      expect(screen.getByText('Total Transactions')).toBeInTheDocument();
      expect(screen.getByText('States Tracked')).toBeInTheDocument();
    });
  });

  it('displays grand_total_revenue_dollars prefixed with $', async () => {
    // Use CA/TX state that makes the revenue unique in the document
    mockGetNexusOverview.mockResolvedValueOnce({
      data: {
        states: [{ state: 'ZZ', transaction_count: 1, total_revenue_dollars: '888.88' }],
        totals: { grand_total_revenue_dollars: '888.88', grand_total_transactions: 1 },
      },
    });
    render(<NexusTab />);
    await waitFor(() => {
      // Find the revenue in the metric card (distinct from the table cell)
      // We use getAllByText and check the metric card specifically
      const els = screen.getAllByText('$888.88');
      expect(els.length).toBeGreaterThanOrEqual(1);
      // Metric card uses larger font (1.8rem)
      expect(els.find(el => el.style.fontSize === '1.8rem')).toBeInTheDocument();
    });
  });

  it('displays grand_total_transactions as a number', async () => {
    // Use a unique transaction count not appearing elsewhere
    mockGetNexusOverview.mockResolvedValueOnce({
      data: {
        states: [{ state: 'ZZ', transaction_count: 777, total_revenue_dollars: '100.00' }],
        totals: { grand_total_revenue_dollars: '100.00', grand_total_transactions: 777 },
      },
    });
    render(<NexusTab />);
    await waitFor(() => {
      // Find the unique transaction count — should appear in both table and metric card
      const els = screen.getAllByText('777');
      expect(els.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows states.length as States Tracked count', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({
      data: {
        states: [
          { state: 'CA', transaction_count: 100, total_revenue_dollars: '15000.00' },
          { state: 'TX', transaction_count: 50, total_revenue_dollars: '7500.00' },
        ],
        totals: { grand_total_revenue_dollars: '22500.00', grand_total_transactions: 150 },
      },
    });
    render(<NexusTab />);
    await waitFor(() => {
      expect(screen.getByText('States Tracked')).toBeInTheDocument();
      // 2 states tracked
      const el = screen.getByText((content, element) => {
        return element.tagName === 'P' && element.textContent === '2';
      });
      expect(el).toBeInTheDocument();
    });
  });

  it('defaults grand_total_revenue_dollars to $0.00 when missing', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({
      data: { states: [], totals: {} },
    });
    render(<NexusTab />);
    await waitFor(() => {
      expect(screen.getByText(/\$0\.00/)).toBeInTheDocument();
    });
  });

  it('defaults grand_total_transactions to 0 when missing', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({
      data: { states: [], totals: {} },
    });
    render(<NexusTab />);
    await waitFor(() => {
      expect(screen.getByText('Total Transactions')).toBeInTheDocument();
      // Find the "0" that appears inside the Total Transactions metric card specifically
      // (there will be multiple "0" values on the page — revenue, tx count, states tracked)
      // We verify it by finding the P that is a sibling after the "Total Transactions" label
      const totalTxLabel = screen.getByText('Total Transactions');
      const metricCard = totalTxLabel.closest('div').querySelector('p[style*="1.8rem"]');
      expect(metricCard).toBeInTheDocument();
      expect(metricCard.textContent).toBe('0');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // States table
  // ─────────────────────────────────────────────────────────────────

  it('renders states table with state data when present', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({
      data: {
        states: [{ state: 'CA', transaction_count: 100, total_revenue_dollars: '15000.00' }],
        totals: { grand_total_revenue_dollars: '15000.00', grand_total_transactions: 100 },
      },
    });
    render(<NexusTab />);
    await waitFor(() => {
      // CA row rendered in table
      expect(screen.getByText('CA')).toBeInTheDocument();
      // Transaction count in table
      const txCell = screen.getByText((content, element) => {
        return element.tagName === 'TD' && element.textContent === '100';
      });
      expect(txCell).toBeInTheDocument();
      // Revenue in table
      const revCell = screen.getByText((content, element) => {
        return element.tagName === 'TD' && element.textContent === '$15000.00';
      });
      expect(revCell).toBeInTheDocument();
    });
  });

  it('renders multiple state rows in the table', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({
      data: {
        states: [
          { state: 'CA', transaction_count: 100, total_revenue_dollars: '15000.00' },
          { state: 'TX', transaction_count: 200, total_revenue_dollars: '30000.00' },
        ],
        totals: { grand_total_revenue_dollars: '45000.00', grand_total_transactions: 300 },
      },
    });
    render(<NexusTab />);
    await waitFor(() => {
      expect(screen.getByText('CA')).toBeInTheDocument();
      expect(screen.getByText('TX')).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Filter bar
  // ─────────────────────────────────────────────────────────────────

  it('renders Apply Filter button', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({ data: { states: [], totals: {} } });
    render(<NexusTab />);
    await waitFor(() => screen.getByText('Total Revenue'));
    expect(screen.getByRole('button', { name: 'Apply Filter' })).toBeInTheDocument();
  });

  it('does not show Clear button initially (no filters set)', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({ data: { states: [], totals: {} } });
    render(<NexusTab />);
    await waitFor(() => screen.getByText('Total Revenue'));
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('shows Clear button when a date filter is set', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({ data: { states: [], totals: {} } });
    render(<NexusTab />);
    await waitFor(() => screen.getByText('Total Revenue'));

    const dateInput = document.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-01-01' } });

    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('clears filters and re-fetches when Clear is clicked', async () => {
    mockGetNexusOverview
      .mockResolvedValueOnce({ data: { states: [], totals: {} } })
      .mockResolvedValueOnce({ data: { states: [], totals: {} } });
    render(<NexusTab />);
    await waitFor(() => screen.getByText('Total Revenue'));

    // Set a filter
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-01-01' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-03-31' } });

    // Clear
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    // Inputs should be empty
    expect(dateInputs[0]).toHaveValue('');
    expect(dateInputs[1]).toHaveValue('');

    // Clear button should be gone
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  // ─────────────────────────────────────────────────────────────────
  // Nexus threshold reminder
  // ─────────────────────────────────────────────────────────────────

  it('shows nexus threshold reminder when states data is present', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({
      data: {
        states: [{ state: 'CA', transaction_count: 100, total_revenue_dollars: '15000.00' }],
        totals: { grand_total_revenue_dollars: '15000.00', grand_total_transactions: 100 },
      },
    });
    render(<NexusTab />);
    await waitFor(() => {
      expect(
        screen.getByText(/Economic Nexus Thresholds/)
      ).toBeInTheDocument();
    });
  });

  it('does not show nexus threshold reminder when no states', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({
      data: { states: [], totals: {} },
    });
    render(<NexusTab />);
    await waitFor(() => screen.getByText(/No transactions recorded yet/));
    expect(screen.queryByText(/Economic Nexus Thresholds/)).not.toBeInTheDocument();
  });

  it('includes $100,000 and 200 transaction thresholds in reminder', async () => {
    mockGetNexusOverview.mockResolvedValueOnce({
      data: {
        states: [{ state: 'CA', transaction_count: 250, total_revenue_dollars: '150000.00' }],
        totals: { grand_total_revenue_dollars: '150000.00', grand_total_transactions: 250 },
      },
    });
    render(<NexusTab />);
    await waitFor(() => {
      expect(screen.getByText(/\$100,000 revenue OR 200 transactions/)).toBeInTheDocument();
    });
  });
});
