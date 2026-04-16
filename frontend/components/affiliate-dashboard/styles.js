/**
 * Shared style constants for affiliate-dashboard sub-components.
 * Extracted from inline style objects in affiliate-dashboard.jsx to DRY up
 * repeated style definitions across tab components.
 *
 * WHY: affiliate-dashboard.jsx (471 lines) has inline styles repeated across
 * its tab sub-sections. Extracting them here allows all tab components to
 * reference the same constants, following the same pattern used in the
 * ahoyman-dashboard decomposition.
 */

export const thStyle = {
  padding: '0.75rem 1rem',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '0.85rem',
};

export const tdStyle = {
  padding: '0.75rem 1rem',
  color: '#B0C4DE',
  fontSize: '0.9rem',
};

export const inputStyle = {
  padding: '0.5rem 0.75rem',
  borderRadius: '6px',
  border: '1px solid #3A3A3A',
  backgroundColor: '#1A1A1A',
  color: '#F0F4F8',
  fontSize: '0.9rem',
  outline: 'none',
};
