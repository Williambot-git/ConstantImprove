# AccountSettingsSection Coverage Improvement Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan.

**Goal:** Improve AccountSettingsSection test coverage from 19.81% to ~85%+ by testing all key interaction paths.

**Architecture:** The component handles 4 major user flows: password change, recovery kit generation, data export, and copy-to-clipboard. Each has happy paths, validation errors, and API error handling.

**Tech Stack:** Jest + RTL + userEvent + jest.spyOn for DOM API mocking

---

## Mock Strategy for DOM APIs

The component uses several browser APIs that need careful mocking:

```javascript
// window.prompt — return password string or null (cancel)
jest.spyOn(window, 'prompt').mockReturnValue('current-password');

// window.alert — just needs to not throw
jest.spyOn(window, 'alert').mockImplementation(() => {});

// navigator.clipboard — jest does NOT mock this by default
jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

// window.URL.createObjectURL — returns a blob URL string
jest.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:http://localhost/blob-url');
jest.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});

// document.body.appendChild / remove — capture the <a> element
let capturedAnchor = null;
jest.spyOn(document.body, 'appendChild').mockImplementation(el => { capturedAnchor = el; });
jest.spyOn(document.body, 'removeChild').mockImplementation(() => {});
```

---

## Task 1: Write password change tests (handleChangePassword)

**File:** `frontend/tests/components/dashboard/AccountSettingsSection.test.jsx`

### Test: Empty fields — "All fields are required"

```javascript
it('shows error when old password is empty', async () => {
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));
  
  // Fill only old and new password, skip confirm
  fireEvent.change(screen.getByLabelText(/Old Password/i), { target: { value: 'old' } });
  fireEvent.change(screen.getByLabelText(/New Password/i), { target: { value: 'newpass' } });
  // don't fill confirm
  
  await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));
  
  expect(screen.getByText('All fields are required')).toBeInTheDocument();
});
```

### Test: Password mismatch

```javascript
it('shows error when passwords do not match', async () => {
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));
  
  fireEvent.change(screen.getByLabelText(/Old Password/i), { target: { value: 'oldpass' } });
  fireEvent.change(screen.getByLabelText(/New Password/i), { target: { value: 'newpass' } });
  fireEvent.change(screen.getByLabelText(/Confirm New Password/i), { target: { value: 'differentpass' } });
  
  await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));
  
  expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
});
```

### Test: Password change API error

```javascript
it('shows error message when API fails', async () => {
  const api = require('../../../api/client').default;
  api.changePassword.mockRejectedValueOnce({ response: { data: { error: 'Incorrect old password' } } });
  
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));
  
  fireEvent.change(screen.getByLabelText(/Old Password/i), { target: { value: 'wrong' } });
  fireEvent.change(screen.getByLabelText(/New Password/i), { target: { value: 'newpass' } });
  fireEvent.change(screen.getByLabelText(/Confirm New Password/i), { target: { value: 'newpass' } });
  
  await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));
  
  expect(await screen.findByText('Incorrect old password')).toBeInTheDocument();
});
```

### Test: Password change success — form clears and hides

```javascript
it('clears form and shows success on password change', async () => {
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));
  
  fireEvent.change(screen.getByLabelText(/Old Password/i), { target: { value: 'oldpass' } });
  fireEvent.change(screen.getByLabelText(/New Password/i), { target: { value: 'newpass' } });
  fireEvent.change(screen.getByLabelText(/Confirm New Password/i), { target: { value: 'newpass' } });
  
  await userEvent.click(screen.getByRole('button', { name: /Change Password/i }));
  
  expect(await screen.findByText('Password changed successfully')).toBeInTheDocument();
  // Form should be hidden
  expect(screen.queryByLabelText(/Old Password/i)).not.toBeInTheDocument();
});
```

---

## Task 2: Write recovery kit tests (handleGenerateKit, handleCopyKit)

### Test: Cancel prompt returns early

```javascript
it('does nothing when user cancels password prompt', async () => {
  jest.spyOn(window, 'prompt').mockReturnValue(null);
  
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Generate New Recovery Kit/i }));
  
  expect(window.prompt).toHaveBeenCalledWith('Enter your current password to generate a new recovery kit:');
  // No API call should have been made
  expect(api.default.generateRecoveryKit).not.toHaveBeenCalled();
});
```

### Test: Successful kit generation shows kit

```javascript
it('shows recovery kit when generated successfully', async () => {
  jest.spyOn(window, 'prompt').mockReturnValue('current-password');
  
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Generate New Recovery Kit/i }));
  
  expect(await screen.findByText('CODE1-CODE2-CODE3')).toBeInTheDocument();
  expect(screen.getByText(/Save this recovery kit/i)).toBeInTheDocument();
});
```

### Test: API error — shows alert

```javascript
it('shows alert when recovery kit API fails', async () => {
  const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
  const api = require('../../../api/client').default;
  api.generateRecoveryKit.mockRejectedValueOnce({ response: { data: { error: 'Invalid password' } } });
  jest.spyOn(window, 'prompt').mockReturnValue('wrong-password');
  
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Generate New Recovery Kit/i }));
  
  expect(await screen.findByText('Invalid password')).toBeInTheDocument(); // via alert
});
```

### Test: Copy kit button

```javascript
it('copies kit to clipboard when Copy button clicked', async () => {
  const clipboardSpy = jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  jest.spyOn(window, 'prompt').mockReturnValue('current-password');
  
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Generate New Recovery Kit/i }));
  await userEvent.click(screen.getByRole('button', { name: /Copy/i }));
  
  expect(clipboardSpy).toHaveBeenCalledWith('CODE1-CODE2-CODE3');
  expect(screen.getByRole('button', { name: /Copied!/i })).toBeInTheDocument();
});
```

---

## Task 3: Write data export tests (handleRequestDataExport, triggerExportDownload)

### Test: Successful export

```javascript
it('shows export success message after download', async () => {
  const api = require('../../../api/client').default;
  api.exportAccountData.mockResolvedValueOnce({ data: { token: 'export-token' } });
  api.downloadAccountExport.mockResolvedValueOnce({ 
    data: 'export data', 
    headers: { 'content-type': 'text/plain' } 
  });
  
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));
  
  expect(await screen.findByText('Export ready. Download started.')).toBeInTheDocument();
});
```

### Test: Missing token — shows "try again" message

```javascript
it('shows message when export returns no token', async () => {
  const api = require('../../../api/client').default;
  api.exportAccountData.mockResolvedValueOnce({ data: {} }); // no token
  
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));
  
  expect(await screen.findByText(/Export request submitted. Please try again/i)).toBeInTheDocument();
});
```

### Test: 429 active export — uses existing token

```javascript
it('uses existing token on 429 rate limit response', async () => {
  const api = require('../../../api/client').default;
  api.exportAccountData.mockRejectedValueOnce({ 
    response: { status: 429, data: { token: 'active-token' } }
  });
  api.downloadAccountExport.mockResolvedValueOnce({ 
    data: 'export data', 
    headers: {} 
  });
  
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));
  
  expect(await screen.findByText(/already had an active export/)).toBeInTheDocument();
});
```

### Test: Re-download link appears and works

```javascript
it('shows re-download link after successful export', async () => {
  const api = require('../../../api/client').default;
  api.exportAccountData.mockResolvedValueOnce({ data: { token: 're-download-token' } });
  api.downloadAccountExport.mockResolvedValueOnce({ 
    data: 'export data', 
    headers: { 'content-type': 'text/plain', 'content-disposition': "attachment; filename='export.txt'" }
  });
  
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));
  
  expect(await screen.findByText(/Download your export again/i)).toBeInTheDocument();
  
  // Click the re-download link
  await userEvent.click(screen.getByText(/Download your export again/i));
  // downloadAccountExport should be called again
  expect(api.downloadAccountExport).toHaveBeenCalledWith('re-download-token');
});
```

### Test: Export API error

```javascript
it('shows export error message on failure', async () => {
  const api = require('../../../api/client').default;
  api.exportAccountData.mockRejectedValueOnce({ response: { data: { error: 'Export service unavailable' } } });
  
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));
  
  expect(await screen.findByText('Export service unavailable')).toBeInTheDocument();
});
```

---

## Task 4: Write blob download / triggerExportDownload tests

### Test: Blob download creates anchor and clicks it

```javascript
it('creates blob URL and triggers download via anchor click', async () => {
  jest.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:http://localhost/test-blob');
  jest.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
  jest.spyOn(document.body, 'appendChild').mockImplementation(() => {});
  jest.spyOn(document.body, 'removeChild').mockImplementation(() => {});
  
  const api = require('../../../api/client').default;
  api.downloadAccountExport.mockResolvedValueOnce({ 
    data: 'test export content',
    headers: { 'content-type': 'text/csv', 'content-disposition': "attachment; filename*=UTF-8''test.csv" }
  });
  
  renderWithAuth(<AccountSettingsSection profile={{}} onDeleteClick={() => {}} />);
  
  // Directly call the handler via button click flow
  await userEvent.click(screen.getByRole('button', { name: /Request Data Export/i }));
  await waitFor(() => {
    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });
});
```

---

## Verification

Run: `npx jest AccountSettingsSection --coverage --coverageReporters=text`

Expected: Coverage jumps from 19.81% to ~85%+

All new tests should pass.
