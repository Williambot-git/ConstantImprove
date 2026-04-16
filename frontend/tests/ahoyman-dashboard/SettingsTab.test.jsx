import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import SettingsTab from '../../components/ahoyman-dashboard/SettingsTab';
import api from '../../api/client';

const mockSettings = {
  minimumPayout: '25.00',
  commissionRateMonthly: '0.30',
  commissionRateQuarterly: '0.35',
  commissionRateSemiannual: '0.40',
  commissionRateAnnual: '0.50',
  holdPeriodDays: '7',
};

describe('SettingsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Use mockImplementation on the actual api methods so we're controlling
    // the exact same mock functions that the component calls.
    // NOTE: We cannot use top-level jest.mock factory variables here because
    // the factory creates its own internal jest.fn() closures that are
    // disconnected from these outer variables.
    api.getSettings = jest.fn().mockResolvedValue({ data: { data: mockSettings } });
    api.updateSettings = jest.fn().mockResolvedValue({ data: { data: mockSettings } });
  });

  test('renders System Settings heading after load', async () => {
    render(<SettingsTab />);

    await waitFor(() => {
      expect(screen.getByText('System Settings')).toBeInTheDocument();
    });
  });

  test('loads settings on mount and pre-populates form', async () => {
    render(<SettingsTab />);

    await waitFor(() => {
      expect(api.getSettings).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('25.00')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('0.30')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7')).toBeInTheDocument();
  });

  test('displays all six settings fields', async () => {
    render(<SettingsTab />);

    await waitFor(() => screen.getByText('System Settings'));

    expect(screen.getByText('Minimum Payout ($)')).toBeInTheDocument();
    expect(screen.getByText('Commission — Monthly')).toBeInTheDocument();
    expect(screen.getByText('Commission — Quarterly')).toBeInTheDocument();
    expect(screen.getByText('Commission — Semi-Annual')).toBeInTheDocument();
    expect(screen.getByText('Commission — Annual')).toBeInTheDocument();
    expect(screen.getByText('Hold Period (days)')).toBeInTheDocument();
  });

  test('updates a settings field value', async () => {
    render(<SettingsTab />);

    await waitFor(() => screen.getByText('System Settings'));

    // Use fireEvent instead of userEvent for number inputs in jsdom.
    // userEvent.clear + type can miss React onChange events for type="number"
    // in the jsdom environment. fireEvent.change reliably triggers onChange.
    const minPayoutInput = screen.getByDisplayValue('25.00');
    fireEvent.change(minPayoutInput, { target: { value: '50.00' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('50.00')).toBeInTheDocument();
    });
  });

  test('submits all settings when Save is clicked', async () => {
    render(<SettingsTab />);

    await waitFor(() => screen.getByText('System Settings'));

    // Change minimum payout — use fireEvent for number inputs in jsdom
    const minPayoutInput = screen.getByDisplayValue('25.00');
    fireEvent.change(minPayoutInput, { target: { value: '50.00' } });

    const saveBtn = screen.getByRole('button', { name: /save settings/i });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({
        minimumPayout: 50.00,
        commissionRateMonthly: 0.30,
        commissionRateQuarterly: 0.35,
        commissionRateSemiannual: 0.40,
        commissionRateAnnual: 0.50,
        holdPeriodDays: 7,
      });
    });
  });

  test('shows success message after save', async () => {
    render(<SettingsTab />);

    await waitFor(() => screen.getByText('System Settings'));

    const saveBtn = screen.getByRole('button', { name: /save settings/i });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/settings saved successfully/i)).toBeInTheDocument();
    });
  });

  test('shows error message when save fails', async () => {
    api.updateSettings = jest.fn().mockRejectedValue(new Error('Server error'));

    render(<SettingsTab />);

    await waitFor(() => screen.getByText('System Settings'));

    const saveBtn = screen.getByRole('button', { name: /save settings/i });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/failed to save settings/i)).toBeInTheDocument();
    });
  });

  test('disables save button while saving (async)', async () => {
    // Uses a Promise that stays pending until we explicitly resolve it.
    // This lets us observe the button in the saving state before the promise settles.
    let resolveUpdate;
    const pendingUpdate = new Promise(r => (resolveUpdate = r));
    api.updateSettings = jest.fn().mockImplementation(() => pendingUpdate);

    render(<SettingsTab />);
    await waitFor(() => screen.getByText('System Settings'));

    // Click save — the button should enter "Saving..." state immediately
    const saveBtn = screen.getByRole('button', { name: /save settings/i });
    await userEvent.click(saveBtn);

    // Button should show saving text and be disabled while the async call is in flight
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving\.\.\./i })).toBeInTheDocument();
    });
    const savingBtn = screen.getByRole('button', { name: /saving\.\.\./i });
    expect(savingBtn).toBeDisabled();

    // Resolve the pending update — button should return to normal
    resolveUpdate();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save settings/i })).toBeInTheDocument();
    });
  });

  test('handles API error on load gracefully', async () => {
    api.getSettings = jest.fn().mockRejectedValue(new Error('Network error'));

    render(<SettingsTab />);

    await waitFor(() => {
      expect(screen.getByText('System Settings')).toBeInTheDocument();
    });
  });
});
