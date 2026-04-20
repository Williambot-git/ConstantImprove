// frontend/components/admin/KPICard.jsx
// Reusable KPI metric card — displays a label and formatted value.
// Used exclusively within the admin dashboard KPI tab.
//
// WHY THIS EXISTS:
// Avoids duplicating the card markup (dark bg, centered label, large blue value)
// across all 3 KPI metric cards. One component, multiple uses.
//
// NOTE: This component does NOT use the shared styles object because its
// internal styling (kpiLabel/kpiValue) is local to this component.
// If you need to reuse these specific styles elsewhere, extract them to styles.js.

const styles = {
  card: {
    textAlign: 'center',
  },
  label: {
    color: '#A0AEC0',
    fontSize: '0.9rem',
    marginBottom: '0.5rem',
  },
  value: {
    fontSize: '2.5rem',
    fontWeight: 'bold',
    color: '#1E90FF',
  },
};

export default function KPICard({ label, value }) {
  return (
    <div style={styles.card}>
      <p style={styles.label}>{label}</p>
      <p style={styles.value}>{value}</p>
    </div>
  );
}

