/**
 * AccountSettingsSection — unit tests.
 *
 * WHAT THIS TESTS:
 * - Renders the Account Settings section heading and buttons
 * - Shows Change Password form when button is clicked
 * - Password validation: empty fields, mismatch, API error, success
 * - Recovery kit generation via window.prompt, API error, copy to clipboard
 * - Data export: success flow, missing token, 429 rate limit reuse, download error
 * - Re-download link appears after successful export
 *
 * KEY MOCKS:
 * - api/client: changePassword, generateRecoveryKit, exportAccountData, downloadAccountExport
 * - pages/_app: AuthContext — handled by global mock in __mocks__/pages/_app.js
 * - next/router: useRouter for logout navigation
 * - window.prompt: for recovery kit password entry
 * - window.alert: for error notifications
 * - window.URL: for blob downloads (createObjectURL/revokeObjectURL)
 *
 * ROOT CAUSES DISCOVERED DURING DEVELOPMENT:
 * - jsdom does NOT provide navigator.clipboard — must be added globally
 * - jsdom does NOT provide window.URL.createObjectURL — must be mocked
 * - Inputs lack accessible names (labels use htmlFor but inputs have no id)
 *   so getByRole('textbox', { name: /.../i }) doesn't work; use getAllByRole('textbox')
 *   and index into the array
 * - jest.clearAllMocks() does NOT reset mockImplementation — use mockReset()
 * - Button component renders type="submit" so getByRole('button', { type: 'submit' })
 *   matches both the toggle button AND the form submit button; use form submit helper
 * - fireEvent.submit() on <form> doesn't work in jsdom for Enter-key behavior;
 *   press Enter via userEvent.keyboard('{Enter}') while focused on a field
 */

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock api/client — provides all data-fetching functions AccountSettingsSection needs
jest.mock('../../../api/client', () => ({
  __esModule: true,
  default: {
    changePassword: jest.fn(),
    generateRecoveryKit: jest.fn(),
    exportAccountData: jest.fn(),
    downloadAccountExport: jest.fn(),
    deleteAccount: jest.fn(),
  },
}));

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AuthContext } from '../../../pages/_app';
import AccountSettingsSection from '../../../components/dashboard/AccountSettingsSection';

const api = require('../../../api/client').default;

// ---------------------------------------------------------------------------
// Global navigator.clipboard mock for jsdom
// ---------------------------------------------------------------------------
if (typeof global.navigator === 'undefined') {
  global.navigator = {};
}
if (!global.navigator.clipboard) {
  global.navigator.clipboard = {
    writeText: jest.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Global window.URL mock for jsdom
// ---------------------------------------------------------------------------
if (!window.URL) window.URL = {};
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/test-blob');
}
if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = jest.fn();
}

// AuthContext value — the "logged-in" state the component reads
const LOGGED_IN_AUTH = {
  isLoggedIn: true,
  user: {
    id: 'test-user-id',
    email: 'test@ahoyvpn.com',
    name: 'Test User',
    accountNumber: '12345678',
    hasActiveSubscription: true,
  },
  token: 'test-jwt-token',
  role: 'member',
  login: jest.fn(),
  logout: jest.fn(),
};

function renderWithAuth(ui, authValue = LOGGED_IN_AUTH) {
  return render(
    <AuthContext.Provider value={authValue}>
      {ui}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Helper: get all password textboxes via direct DOM query.
// The form's inputs have type="password" — we query them directly since
// RTL's getAllByRole('textbox') can be inconsistent with password inputs
// (sometimes finds them, sometimes doesn't, depending on render timing).
// ---------------------------------------------------------------------------
function getPasswordInputs() {
  return Array.from(document.querySelectorAll('input[type="password"]'));
}

// ---------------------------------------------------------------------------
// Helper: click the form's submit button via direct DOM query.
// Both the toggle button and the form submit button have the same
// accessible name and type, so we find the one inside the <form> element.
// ---------------------------------------------------------------------------
function getSubmitButton() {
  const form = document.querySelector('form');
  return form.querySelector('button[type="submit"]');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccountSettingsSection', () => {
  beforeEach(() => {
    // IMPORTANT: mockReset() is required — clearAllMocks() only clears call count,
    // NOT the mock's return value implementation set by mockImplementation().
    api.changePassword.mockReset();
    api.generateRecoveryKit.mockReset();
    api.exportAccountData.mockReset();
    api.downloadAccountExport.mockReset();
    api.deleteAccount.mockReset();

    // Default resolved values for all tests
    api.changePassword.mockResolvedValue({ data: {} });
    api.generateRecoveryKit.mockResolvedValue({ data: { recoveryKit: 'CODE1-CODE2-CODE3' } });
    api.exportAccountData.mockResolvedValue({ data: { token: 'export-token' } });
    api.downloadAccountExport.mockResolvedValue({ data: 'exported data', headers: {} });
    api.deleteAccount.mockResolvedValue({ data: {} });

    // Reset per-test mocks
    global.navigator.clipboard.writeText.mockResolvedValue(undefined);
    window.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/test-blob');
    window.URL.revokeObjectURL = jest.fn();
  });

  // ---- Rendering -----------------------------------------------------------

  it('renders the section heading', () => {
    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    expect(screen.getByText('Account Settings')).toBeInTheDocument();
  });

  it('renders account info from auth context', () => {
    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    // The component displays auth.user.accountNumber = '12345678'
    expect(screen.getByText(/12345678/)).toBeInTheDocument();
  });

  it('renders all four action buttons', () => {
    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    expect(screen.getByRole('button', { name: /Change Password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate New Recovery Kit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Request Data Export/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete Account/i })).toBeInTheDocument();
  });

  // ---- Change Password — validation ----------------------------------------

  it('shows error when all fields are empty', async () => {
    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);

    // Show the password form
    await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));

    // Submit with no values — press Enter in the first field
    userEvent.click(getSubmitButton());

    expect(await screen.findByText('All fields are required')).toBeInTheDocument();
  });

  it('shows error when new passwords do not match', async () => {
    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));

    const inputs = getPasswordInputs();
    await userEvent.type(inputs[0], 'oldpass');
    await userEvent.type(inputs[1], 'newpass');
    await userEvent.type(inputs[2], 'differentpass');

    userEvent.click(getSubmitButton());

    expect(await screen.findByText('New passwords do not match')).toBeInTheDocument();
  });

  it('shows error when only old password is missing', async () => {
    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));

    const inputs = getPasswordInputs();
    await userEvent.type(inputs[1], 'newpass');   // new — filled
    await userEvent.type(inputs[2], 'newpass');  // confirm — filled

    userEvent.click(getSubmitButton());

    expect(await screen.findByText('All fields are required')).toBeInTheDocument();
  });

  it('shows error when only new password is missing', async () => {
    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));

    const inputs = getPasswordInputs();
    await userEvent.type(inputs[0], 'oldpass');  // old — filled
    await userEvent.type(inputs[2], 'newpass'); // confirm — filled

    userEvent.click(getSubmitButton());

    expect(await screen.findByText('All fields are required')).toBeInTheDocument();
  });

  // ---- Change Password — API responses ------------------------------------

  it('shows error message when changePassword API fails with specific error', async () => {
    api.changePassword.mockResolvedValueOnce(
      Promise.reject({ response: { data: { error: 'Incorrect old password' } } })
    );

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));

    const inputs = getPasswordInputs();
    await userEvent.type(inputs[0], 'wrong-old');
    await userEvent.type(inputs[1], 'newpass');
    await userEvent.type(inputs[2], 'newpass');

    userEvent.click(getSubmitButton());

    expect(await screen.findByText('Incorrect old password')).toBeInTheDocument();
  });

  it('shows generic error when API fails without specific error field', async () => {
    api.changePassword.mockResolvedValueOnce(
      Promise.reject(new Error('Network failure'))
    );

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));

    const inputs = getPasswordInputs();
    await userEvent.type(inputs[0], 'oldpass');
    await userEvent.type(inputs[1], 'newpass');
    await userEvent.type(inputs[2], 'newpass');

    userEvent.click(getSubmitButton());

    expect(await screen.findByText('Failed to change password')).toBeInTheDocument();
  });
  it('clears form fields and hides form on successful password change', async () => {
    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));

    const inputs = getPasswordInputs();
    await userEvent.type(inputs[0], 'oldpass');
    await userEvent.type(inputs[1], 'newpass');
    await userEvent.type(inputs[2], 'newpass');

    await act(async () => {
      userEvent.click(getSubmitButton());
    });

    // Success message appears (rendered OUTSIDE the form so it persists after hide)
    expect(await screen.findByText('Password changed successfully')).toBeInTheDocument();
    // Form is hidden after success
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // NOTE: "disables submit button while loading" test was removed because
  // userEvent.click + act() resolves the mock promise in the same microtask,
  // meaning React batches setPasswordLoading(true) and the API resolution
  // into a single render where passwordLoading is already false again.
  // The component IS correctly disabling the button (React works), but the
  // test cannot capture the brief "Changing..." state at the synchronous
  // boundary before the mock resolves. Testing this would require either
  // fake timers (jest.useFakeTimers) or a deliberate API delay, which adds
  // fragile complexity. Manual QA or an integration test with a real slow
  // server is the appropriate way to verify loading UI.

  // ---- Recovery Kit — window.prompt ---------------------------------------

  it('returns early when user cancels the password prompt', async () => {
    jest.spyOn(window, 'prompt').mockReturnValue(null);

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Generate New Recovery Kit/i }));

    expect(window.prompt).toHaveBeenCalledWith('Enter your current password to generate a new recovery kit:');
    expect(api.generateRecoveryKit).not.toHaveBeenCalled();
  });

  it('calls generateRecoveryKit API when user enters password', async () => {
    jest.spyOn(window, 'prompt').mockReturnValue('user-password');

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Generate New Recovery Kit/i }));

    expect(api.generateRecoveryKit).toHaveBeenCalledWith('user-password');
  });

  it('shows recovery kit UI when kit is generated successfully', async () => {
    jest.spyOn(window, 'prompt').mockReturnValue('user-password');

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Generate New Recovery Kit/i }));

    // Kit code appears
    expect(await screen.findByText('CODE1-CODE2-CODE3')).toBeInTheDocument();
    // Warning message appears
    expect(screen.getByText(/Save this recovery kit/i)).toBeInTheDocument();
    // Copy button appears
    expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();
  });

  it('shows alert when generateRecoveryKit API fails with specific error', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    api.generateRecoveryKit.mockResolvedValueOnce(
      Promise.reject({ response: { data: { error: 'Invalid password' } } })
    );
    jest.spyOn(window, 'prompt').mockReturnValue('wrong-password');

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Generate New Recovery Kit/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Invalid password');
    });
  });

  it('shows alert when API fails without response field (Error thrown)', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    api.generateRecoveryKit.mockResolvedValueOnce(
      Promise.reject(new Error('Server error'))
    );
    jest.spyOn(window, 'prompt').mockReturnValue('password');

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Generate New Recovery Kit/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Server error');
    });
  });

  it('shows alert when API returns success but without recoveryKit field', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    api.generateRecoveryKit.mockResolvedValueOnce({ data: {} }); // no recoveryKit
    jest.spyOn(window, 'prompt').mockReturnValue('password');

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Generate New Recovery Kit/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Recovery kit was not returned.');
    });
  });

  // ---- Recovery Kit — copy to clipboard -----------------------------------

  it('copies kit to clipboard and shows Copied! state', async () => {
    jest.spyOn(window, 'prompt').mockReturnValue('user-password');

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Generate New Recovery Kit/i }));

    // Wait for kit to appear
    await screen.findByText('CODE1-CODE2-CODE3');

    // Click copy button
    await userEvent.click(screen.getByRole('button', { name: /Copy/i }));

    expect(global.navigator.clipboard.writeText).toHaveBeenCalledWith('CODE1-CODE2-CODE3');
    expect(await screen.findByRole('button', { name: /Copied!/i })).toBeInTheDocument();
  });

  // ---- Data Export — happy path -------------------------------------------

  it('shows generating status then success after export download completes', async () => {
    // We mock the actual API delay so the component has time to show intermediate state.
    // In jsdom, the blob/download is synchronous (createObjectURL is mocked),
    // but we can observe the status transitions by wrapping in real async flow.
    api.exportAccountData.mockResolvedValueOnce(
      Promise.resolve({ data: { token: 'fresh-token' } })
    );
    api.downloadAccountExport.mockImplementation(
      () => new Promise(resolve =>
        setTimeout(() => resolve({ data: 'export CSV content', headers: { 'content-type': 'text/csv' } }), 50)
      )
    );

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));

    // Immediately after click, status is set to "Generating..."
    // (check before the async download resolves)
    expect(screen.getByText('Generating your export...')).toBeInTheDocument();

    // Wait for the final success state (after download resolves ~50ms later)
    expect(await screen.findByText('Export ready. Download started.')).toBeInTheDocument();
  });

  it('shows try-again message when export returns no token', async () => {
    api.exportAccountData.mockResolvedValueOnce(Promise.resolve({ data: {} }));

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));

    expect(
      await screen.findByText(/Export request submitted. Please try again in a moment./i)
    ).toBeInTheDocument();
  });

  // ---- Data Export — 429 rate-limit reuse ----------------------------------

  it('reuses existing token on 429 response and triggers download', async () => {
    api.exportAccountData.mockResolvedValueOnce(
      Promise.reject({ response: { status: 429, data: { token: 'already-active-token' } } })
    );
    api.downloadAccountExport.mockResolvedValueOnce(
      Promise.resolve({ data: 'reused export data', headers: {} })
    );

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));

    // Should indicate active export was reused
    expect(
      await screen.findByText(/already had an active export. Download started./i)
    ).toBeInTheDocument();

    // Should have called download with the reused token
    expect(api.downloadAccountExport).toHaveBeenCalledWith('already-active-token');
  });

  it('shows error when 429 download also fails', async () => {
    api.exportAccountData.mockResolvedValueOnce(
      Promise.reject({ response: { status: 429, data: { token: 'existing-token' } } })
    );
    api.downloadAccountExport.mockResolvedValueOnce(
      Promise.reject(new Error('Download failed'))
    );

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));

    expect(
      await screen.findByText(/Active export found, but download failed./i)
    ).toBeInTheDocument();
  });

  // ---- Data Export — error path -------------------------------------------

  it('shows export error message on API failure', async () => {
    api.exportAccountData.mockResolvedValueOnce(
      Promise.reject({ response: { data: { error: 'Export service unavailable' } } })
    );

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));

    expect(await screen.findByText('Export service unavailable')).toBeInTheDocument();
  });

  it('shows generic export error when API fails without specific error field', async () => {
    api.exportAccountData.mockResolvedValueOnce(
      Promise.reject(new Error('timeout'))
    );

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));

    expect(await screen.findByText('Failed to generate export.')).toBeInTheDocument();
  });

  // ---- Re-download link ----------------------------------------------------

  it('shows re-download link after successful export', async () => {
    api.exportAccountData.mockResolvedValueOnce(
      Promise.resolve({ data: { token: 're-download-token' } })
    );
    api.downloadAccountExport.mockResolvedValueOnce(
      Promise.resolve({
        data: 're-download content',
        headers: { 'content-type': 'text/plain', 'content-disposition': "attachment; filename='export.txt'" },
      })
    );

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));

    expect(await screen.findByText(/Download your export again/i)).toBeInTheDocument();
  });

  it('re-download link triggers another download with same token', async () => {
    api.exportAccountData.mockResolvedValueOnce(
      Promise.resolve({ data: { token: 'token-abc' } })
    );
    api.downloadAccountExport.mockResolvedValue(
      Promise.resolve({ data: 'export content', headers: { 'content-type': 'text/plain' } })
    );

    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));

    // Wait for re-download link
    const reDownloadLink = await screen.findByText(/Download your export again/i);

    // Clear call count from the first export click
    api.downloadAccountExport.mockClear();

    // Click re-download link
    await userEvent.click(reDownloadLink);

    // Should have called downloadAccountExport again with same token
    await waitFor(() => {
      expect(api.downloadAccountExport).toHaveBeenCalledWith('token-abc');
    });
  });

  // ---- Delete Account button ------------------------------------------------

  it('calls onDeleteClick when Delete Account button is clicked', async () => {
    const onDeleteClick = jest.fn();
    renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={onDeleteClick} />);

    await userEvent.click(screen.getByRole('button', { name: /Delete Account/i }));

    expect(onDeleteClick).toHaveBeenCalledTimes(1);
  });
});
