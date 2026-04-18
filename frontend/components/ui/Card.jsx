export default function Card({ children, title, subtitle, style = {}, padding = '1.5rem', ...props }) {
  return (
    <div style={{
      backgroundColor: '#1A1A1A',
      border: '1px solid #2E2E2E',
      borderRadius: '10px',
      padding,
      transition: 'border-color 0.2s ease',
      ...style,
    }} {...props}>
      {title && <h3 style={{ color: '#F5F5F0', fontWeight: 600, fontSize: '1rem', marginBottom: subtitle ? '0.25rem' : 0 }}>{title}</h3>}
      {subtitle && <p style={{ color: '#8A8A8A', fontSize: '0.875rem', marginBottom: '1rem' }}>{subtitle}</p>}
      {children}
    </div>
  );
}
