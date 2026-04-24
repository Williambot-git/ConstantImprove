// CancelModal component - confirms subscription cancellation.
// Extracted from dashboard.jsx to enable component decomposition.
import Card from '../ui/Card';
import Button from '../ui/Button';
import styles from './styles.js';

function CancelModal({ onCancel, onConfirm, loading }) {
  return (
    <div style={styles.modalOverlay}>
      <Card style={styles.modal}>
        <h3>Cancel Subscription</h3>
        <p>Are you sure you want to cancel your subscription?</p>
        <div style={styles.modalButtons}>
          <Button onClick={onCancel}>
            Keep Subscription
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? 'Cancelling...' : 'Cancel Subscription'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default CancelModal;
