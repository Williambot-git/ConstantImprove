export default function Form({ children, onSubmit, style = {}, ...props }) {
  const handleSubmit = (e) => { e.preventDefault(); if (onSubmit) onSubmit(e); };
  return <form onSubmit={handleSubmit} style={{ width: '100%', ...style }} {...props}>{children}</form>;
}
export function FormGroup({ label, error, children, style = {} }) {
  return (
    <div style={{ marginBottom: '1.25rem', ...style }}>
      {label && <label style={{ color: '#F5F5F0', fontWeight: 500, display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem' }}>{label}</label>}
      {children}
      {error && <p style={{ color: '#EF4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{error}</p>}
    </div>
  );
}
export function Input({ type = 'text', placeholder, value, onChange, disabled = false, error = false, style = {}, ...props }) {
  return (
    <input type={type} placeholder={placeholder} value={value} onChange={onChange} disabled={disabled}
      style={{ width: '100%', padding: '0.625rem 0.875rem', backgroundColor: '#1A1A1A', color: '#F5F5F0', border: error ? '1px solid #EF4444' : '1px solid #2E2E2E', borderRadius: '6px', fontSize: '0.9rem', fontFamily: 'inherit', transition: 'border-color 0.2s ease, box-shadow 0.2s ease', outline: 'none', ...style }}
      onFocus={(e) => { if (!error) { e.target.style.borderColor = '#3B82F6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)'; }}}
      onBlur={(e) => { e.target.style.borderColor = error ? '#EF4444' : '#2E2E2E'; e.target.style.boxShadow = 'none'; }}
      {...props}
    />
  );
}
export function Select({ value, onChange, children, error = false, style = {}, ...props }) {
  return (
    <select value={value} onChange={onChange}
      style={{ width: '100%', padding: '0.625rem 0.875rem', backgroundColor: '#1A1A1A', color: '#F5F5F0', border: error ? '1px solid #EF4444' : '1px solid #2E2E2E', borderRadius: '6px', fontSize: '0.9rem', fontFamily: 'inherit', transition: 'border-color 0.2s ease', outline: 'none', cursor: 'pointer', ...style }}
      onFocus={(e) => { if (!error) { e.target.style.borderColor = '#3B82F6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)'; }}}
      onBlur={(e) => { e.target.style.borderColor = error ? '#EF4444' : '#2E2E2E'; e.target.style.boxShadow = 'none'; }}
      {...props}
    >
      {children}
    </select>
  );
}
