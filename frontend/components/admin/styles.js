// frontend/components/admin/styles.js
// Shared styles for admin dashboard page and sub-components.
// Extracted from pages/admin.jsx to enable component decomposition
// and avoid style duplication across admin components.
//
// WHY THIS FILE EXISTS:
// Every tab component (KPITab, CustomersTab, AffiliatesTab) needs the same
// base styles as the page. Rather than duplicating style objects or prop-drilling,
// we extract them here so all components import from a single source.
//
// HOW TO UPDATE STYLES:
// Edit this file — all components pick up changes automatically.
// Never inline styles that belong here when working on admin components.

module.exports = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
  },

  title: {
    fontSize: '2.5rem',
    color: '#1E90FF',
    marginBottom: '2rem',
  },

  tabsContainer: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '2rem',
    borderBottom: '1px solid #3A3A3A',
  },

  tab: {
    padding: '1rem 1.5rem',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#B0C4DE',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontWeight: 500,
    fontSize: '1rem',
  },

  tabActive: {
    color: '#1E90FF',
    borderBottomColor: '#1E90FF',
  },

  content: {
    marginBottom: '2rem',
  },

  kpisGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem',
  },

  paymentSplit: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },

  splitItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },

  splitLabel: {
    color: '#F0F4F8',
    fontWeight: 600,
  },

  splitBar: {
    backgroundColor: '#2A2A2A',
    borderRadius: '4px',
    height: '24px',
    overflow: 'hidden',
  },

  splitFill: {
    backgroundColor: '#1E90FF',
    height: '100%',
    transition: 'width 0.3s ease',
  },

  splitPercent: {
    color: '#B0C4DE',
    fontSize: '0.9rem',
    fontWeight: 500,
  },

  notesList: {
    color: '#B0C4DE',
    lineHeight: 1.8,
    paddingLeft: '1.5rem',
  },

  searchForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },

  customerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem',
  },

  label: {
    color: '#A0AEC0',
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    marginBottom: '0.5rem',
  },

  value: {
    fontSize: '1.3rem',
    fontWeight: 'bold',
    color: '#F0F4F8',
  },

  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem',
  },

  affiliatesTable: {
    overflowX: 'auto',
    marginBottom: '1.5rem',
  },

  tableHeader: {
    padding: '0.75rem',
    textAlign: 'left',
    color: '#1E90FF',
    backgroundColor: '#2A2A2A',
    borderBottom: '1px solid #3A3A3A',
  },

  tableCell: {
    padding: '0.75rem',
    color: '#B0C4DE',
    borderBottom: '1px solid #3A3A3A',
  },
};
