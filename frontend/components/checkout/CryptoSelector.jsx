import React from 'react';

const CryptoSelector = ({ options, selected, onSelect }) => {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <label style={{ display: 'block', color: '#B0C4DE', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
        Crypto Currency
      </label>
      <select
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        role="combobox"
        style={{
          width: '100%',
          padding: '0.5rem',
          backgroundColor: '#1a1a2e',
          color: '#fff',
          border: '1px solid #2d2d4a',
          borderRadius: '4px',
          fontSize: '1rem',
        }}
      >
        <option value="" disabled>
          Select Cryptocurrency
        </option>
        {options.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.label} ({opt.code})
          </option>
        ))}
      </select>
    </div>
  );
};

export default CryptoSelector;
