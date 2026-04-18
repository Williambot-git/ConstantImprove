export default function Button({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'md',
  type = 'button',
  style = {},
  className = '',
  ...props
}) {
  const variants = {
    primary: { backgroundColor: '#3B82F6', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600 },
    secondary: { backgroundColor: 'transparent', color: '#3B82F6', border: '1px solid #3B82F6', borderRadius: '6px', fontWeight: 600 },
    ghost: { backgroundColor: 'transparent', color: '#8A8A8A', border: '1px solid #2E2E2E', borderRadius: '6px', fontWeight: 500 },
    danger: { backgroundColor: '#EF4444', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600 },
  };
  const sizes = {
    sm: { padding: '0.35rem 0.75rem', fontSize: '0.8rem' },
    md: { padding: '0.55rem 1.1rem', fontSize: '0.875rem' },
    lg: { padding: '0.75rem 1.5rem', fontSize: '0.95rem' },
  };
  const baseStyle = {
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background-color 0.2s ease, border-color 0.2s ease',
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    whiteSpace: 'nowrap',
    ...variants[variant],
    ...sizes[size],
    ...style,
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={(e) => {
        if (!disabled) {
          if (variant === 'primary') e.target.style.backgroundColor = '#2563EB';
          else if (variant === 'secondary') e.target.style.borderColor = '#2563EB';
          else if (variant === 'ghost') { e.target.style.borderColor = '#3B82F6'; e.target.style.color = '#3B82F6'; }
        }
      }}
      onMouseLeave={(e) => {
        if (variant === 'primary') e.target.style.backgroundColor = '#3B82F6';
        else if (variant === 'secondary') e.target.style.borderColor = '#3B82F6';
        else if (variant === 'ghost') { e.target.style.borderColor = '#2E2E2E'; e.target.style.color = '#8A8A8A'; }
      }}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}
