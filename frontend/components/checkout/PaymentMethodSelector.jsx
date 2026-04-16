import React from 'react';

const PaymentMethodSelector = ({ methods, selected, onSelect }) => {
  return (
    <div style={containerStyle}>
      {methods.map((method) => (
        <button
          key={method.id}
          onClick={() => onSelect(method.id)}
          style={{
            ...buttonStyle,
            ...(selected === method.id ? buttonStyleSelected : {}),
          }}
          aria-pressed={selected === method.id}
        >
          <span style={nameStyle}>{method.name}</span>
          <span style={providerStyle}>via {method.provider}</span>
        </button>
      ))}
    </div>
  );
};

const containerStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '1rem',
  marginBottom: '2rem',
};

const buttonStyle = {
  backgroundColor: '#252525',
  border: '2px solid #3A3A3A',
  borderRadius: '8px',
  padding: '1.5rem',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.25rem',
  color: '#FFFFFF',
};

const buttonStyleSelected = {
  backgroundColor: '#1E90FF',
  borderColor: '#1E90FF',
  color: '#FFFFFF',
};

const nameStyle = {
  fontSize: '1rem',
  fontWeight: 'bold',
};

const providerStyle = {
  fontSize: '0.85rem',
  opacity: 0.8,
};

export default PaymentMethodSelector;
