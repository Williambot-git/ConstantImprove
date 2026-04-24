// DeleteModal component - confirms account deletion.
// Extracted from dashboard.jsx to enable component decomposition.
import Card from '../ui/Card';
import Button from '../ui/Button';
import styles from './styles.js';

function DeleteModal({ onCancel, onConfirm, loading }) {
  return (
    <div style={styles.modalOverlay}>
      <Card style={styles.modal}>
        <h3>Delete Account</h3>
        <p>Are you sure you want to delete your account? This action cannot be undone.</p>
        <div style={styles.modalButtons}>
          <Button onClick={onCancel}>
            Keep Account
          </Button>
          <Button onClick={onConfirm} disabled={loading} style={styles.deleteButton}>
            {loading ? 'Deleting...' : 'Delete Account'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default DeleteModal;
