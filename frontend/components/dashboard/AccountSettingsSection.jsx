// AccountSettingsSection component - handles password change, recovery kit, data export, and delete account.
// Extracted from dashboard.jsx to enable component decomposition.
import { useState, useContext } from 'react';
import { useRouter } from 'next/router';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { FormGroup, Input } from '../ui/Form';
import api from '../../api/client';
import { AuthContext } from '../../pages/_app';
import styles from './styles';

function AccountSettingsSection({ profile, onDeleteClick }) {
  const auth = useContext(AuthContext);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showNewKit, setShowNewKit] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [newRecoveryKit, setNewRecoveryKit] = useState('');
  const [kitCopied, setKitCopied] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [exportToken, setExportToken] = useState('');
  const [exportError, setExportError] = useState('');

  const triggerExportDownload = async (token) => {
    const response = await api.downloadAccountExport(token);
    const contentType = response?.headers?.['content-type'] || 'application/json';
    const blob = new Blob([response.data], { type: contentType });

    const disposition = response?.headers?.['content-disposition'] || '';
    const match = disposition.match(/filename\*?=(?:UTF-8''|\\")?([^"\\;]+)/i);
    const fileName = match ? decodeURIComponent(match[1]).replace(/\\"/g, '') : `ahoyvpn-data-${token}.txt`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordError('');
    setPasswordSuccess('');

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('All fields are required');
      setPasswordLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      setPasswordLoading(false);
      return;
    }

    try {
      await api.changePassword(oldPassword, newPassword);
      setPasswordSuccess('Password changed successfully');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
      setTimeout(() => setPasswordSuccess(''), 3000);
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data?.error || 'Failed to change password';
      setPasswordError(message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleGenerateKit = async () => {
    const password = typeof window !== 'undefined'
      ? window.prompt('Enter your current password to generate a new recovery kit:')
      : null;

    if (!password) {
      return;
    }

    try {
      const response = await api.generateRecoveryKit(password);
      const kit = response?.data?.data?.recoveryKit || response?.data?.recoveryKit;
      if (!kit) {
        throw new Error('Recovery kit was not returned.');
      }
      setNewRecoveryKit(kit);
      setShowNewKit(true);
      setKitCopied(false);
    } catch (err) {
      console.error('Failed to generate recovery kit', err);
      if (typeof window !== 'undefined') {
        window.alert(err?.response?.data?.error || err?.message || 'Failed to generate recovery kit');
      }
    }
  };

  const handleCopyKit = () => {
    if (newRecoveryKit) {
      navigator.clipboard.writeText(newRecoveryKit);
      setKitCopied(true);
      setTimeout(() => setKitCopied(false), 2000);
    }
  };

  const handleRequestDataExport = async () => {
    setExportStatus('Generating your export...');
    setExportError('');
    setExportToken('');

    try {
      const response = await api.exportAccountData();
      const token = response?.data?.data?.token || response?.data?.token;

      if (!token) {
        setExportStatus('Export request submitted. Please try again in a moment.');
        return;
      }

      setExportToken(token);
      await triggerExportDownload(token);
      setExportStatus('Export ready. Download started.');
    } catch (err) {
      const existingToken = err?.response?.data?.token;
      const isActiveExport = err?.response?.status === 429 && existingToken;

      if (isActiveExport) {
        try {
          setExportToken(existingToken);
          await triggerExportDownload(existingToken);
          setExportError('');
          setExportStatus('You already had an active export. Download started.');
          return;
        } catch (downloadErr) {
          const fallbackMessage = downloadErr?.response?.data?.message || downloadErr?.response?.data?.error || 'Active export found, but download failed.';
          setExportStatus('');
          setExportError(fallbackMessage);
          return;
        }
      }

      const message = err?.response?.data?.message || err?.response?.data?.error || 'Failed to generate export.';
      setExportStatus('');
      setExportError(message);
    }
  };

  return (
    <Card style={styles.card}>
      <h2>Account Settings</h2>

      <div style={styles.accountInfo}>
        <p><strong>Account Number:</strong> {profile?.account_number || auth.user?.accountNumber || '—'}</p>
        <p><strong>Account Status:</strong> {profile?.is_active || auth.user?.isActive ? 'Active' : 'Pending'}</p>
      </div>

      <div style={styles.settingsButtons}>
        <Button onClick={() => setShowPasswordForm(!showPasswordForm)}>
          Change Password
        </Button>
        <Button onClick={handleGenerateKit}>
          Generate New Recovery Kit
        </Button>
        <Button onClick={handleRequestDataExport}>
          Request Data Export
        </Button>
        <Button onClick={onDeleteClick} style={styles.deleteButton}>
          Delete Account
        </Button>
      </div>

      {exportStatus && <p style={styles.success}>{exportStatus}</p>}
      {exportError && <p style={styles.error}>{exportError}</p>}
      {exportToken && (
        <p style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            onClick={() => triggerExportDownload(exportToken)}
            style={{ background: 'none', border: 'none', color: '#1E90FF', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
          >
            Download your export again
          </button>
        </p>
      )}

      {showPasswordForm && (
        <form onSubmit={handleChangePassword} style={styles.passwordForm}>
          <FormGroup label="Old Password">
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              disabled={passwordLoading}
            />
          </FormGroup>
          <FormGroup label="New Password">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={passwordLoading}
            />
          </FormGroup>
          <FormGroup label="Confirm New Password">
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={passwordLoading}
            />
          </FormGroup>
          {passwordError && <p style={styles.error}>{passwordError}</p>}
          {passwordSuccess && <p style={styles.success}>{passwordSuccess}</p>}
          <Button type="submit" disabled={passwordLoading}>
            {passwordLoading ? 'Changing...' : 'Change Password'}
          </Button>
        </form>
      )}

      {showNewKit && (
        <div style={styles.kitContainer}>
          <p><strong>New Recovery Kit:</strong></p>
          <div style={styles.kitCode}>
            <code style={styles.kitCodeValue}>{newRecoveryKit}</code>
            <Button onClick={handleCopyKit} style={styles.copyButton}>
              {kitCopied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <p style={styles.kitWarning}>
            ⚠️ Save this recovery kit in a secure location. You will need it to recover your account if you forget your password.
          </p>
        </div>
      )}
    </Card>
  );
}

module.exports = AccountSettingsSection;
