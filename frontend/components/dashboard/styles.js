// Shared styles for dashboard page and sub-components.
// Extracted from dashboard.jsx to enable component decomposition
// and avoid style duplication across dashboard components.

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem',
  },
  title: {
    marginBottom: '2rem',
  },
  card: {
    marginBottom: '2rem',
    padding: '2rem',
  },
  plansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1.5rem',
    marginTop: '1.5rem',
  },
  planCard: {
    padding: '1.5rem',
    textAlign: 'center',
    transition: 'transform 0.2s',
  },
  planCardSelected: {
    border: '2px solid #4CAF50',
  },
  planCardHighlighted: {
    border: '1px solid #38BDF8',
    boxShadow: '0 0 0 1px rgba(56, 189, 248, 0.35)',
    background: 'rgba(15, 23, 42, 0.9)',
  },
  planPrice: {
    margin: '1rem 0',
  },
  priceAmount: {
    fontSize: '2rem',
    fontWeight: 'bold',
  },
  pricePeriod: {
    fontSize: '0.9rem',
    opacity: 0.8,
  },
  planDescription: {
    marginBottom: '1rem',
    opacity: 0.8,
  },
  planFeatures: {
    textAlign: 'left',
    marginBottom: '1rem',
    paddingLeft: '1.5rem',
  },
  cryptoOnly: {
    fontSize: '0.8rem',
    color: '#666',
    marginBottom: '1rem',
  },
  selectButton: {
    width: '100%',
  },
  paymentMethod: {
    display: 'flex',
    gap: '2rem',
    marginTop: '1.5rem',
    justifyContent: 'center',
  },
  accountInfo: {
    marginBottom: '1rem',
  },
  vpnCredsBox: {
    marginBottom: '1rem',
    padding: '1rem',
    borderRadius: '8px',
    background: 'rgba(30, 144, 255, 0.08)',
    border: '1px solid rgba(30, 144, 255, 0.25)',
    lineHeight: 1.8,
  },
  settingsButtons: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  passwordForm: {
    marginTop: '1.5rem',
    padding: '1.5rem',
    borderRadius: '10px',
    border: '1px solid #334155',
    background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.92) 0%, rgba(15, 23, 42, 0.78) 100%)',
    boxShadow: 'inset 0 1px 0 rgba(148, 163, 184, 0.14)',
  },
  kitContainer: {
    marginTop: '1.5rem',
    padding: '1rem',
    borderRadius: '10px',
    border: '1px solid rgba(245, 158, 11, 0.45)',
    background: 'linear-gradient(180deg, rgba(120, 53, 15, 0.24) 0%, rgba(69, 26, 3, 0.3) 100%)',
  },
  kitCode: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
    marginTop: '0.5rem',
  },
  kitCodeValue: {
    flex: 1,
    display: 'block',
    padding: '0.75rem',
    borderRadius: '8px',
    background: '#0B1220',
    border: '1px solid #1F2937',
    color: '#67E8F9',
    fontSize: '0.85rem',
    lineHeight: 1.4,
    wordBreak: 'break-all',
  },
  copyButton: {
    padding: '0.5rem 1rem',
    flexShrink: 0,
  },
  kitWarning: {
    marginTop: '1rem',
    fontSize: '0.9rem',
    color: '#FCD34D',
  },
  cancelButton: {
    marginTop: '1rem',
    background: '#dc3545',
  },
  deleteButton: {
    background: '#dc3545',
  },
  error: {
    color: '#dc3545',
    marginBottom: '1rem',
  },
  success: {
    color: '#28a745',
    marginBottom: '1rem',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    maxWidth: '400px',
    padding: '2rem',
  },
  modalButtons: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1.5rem',
  },
};

module.exports = styles;
