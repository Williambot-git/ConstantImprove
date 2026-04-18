/**
 * CryptoSelector Unit Tests
 * 
 * Tests the cryptocurrency selector dropdown used in the checkout flow.
 * Renders a native <select> element with cryptocurrency options.
 * 
 * Coverage: previously 0%, now fully covered.
 * 
 * NOTE: Uses RTL (@testing-library/react) following the established frontend test pattern.
 */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');

const CryptoSelector = require('../../../components/checkout/CryptoSelector').default;

describe('CryptoSelector', () => {
  const mockOptions = [
    { code: 'BTC', label: 'Bitcoin' },
    { code: 'ETH', label: 'Ethereum' },
    { code: 'USDT', label: 'Tether' },
  ];

  it('renders a single select element', () => {
    const onSelect = jest.fn();
    render(<CryptoSelector options={mockOptions} selected="" onSelect={onSelect} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders all cryptocurrency options plus placeholder', () => {
    const onSelect = jest.fn();
    render(<CryptoSelector options={mockOptions} selected="" onSelect={onSelect} />);
    // 3 crypto options + 1 placeholder = 4 total option elements
    const options = screen.getByRole('combobox').querySelectorAll('option');
    expect(options).toHaveLength(4);
  });

  it('has a disabled placeholder option as first element', () => {
    const onSelect = jest.fn();
    render(<CryptoSelector options={mockOptions} selected="" onSelect={onSelect} />);
    const options = screen.getByRole('combobox').querySelectorAll('option');
    const placeholder = options[0];
    expect(placeholder.disabled).toBe(true);
    expect(placeholder.textContent).toContain('Select Cryptocurrency');
  });

  it('displays label and code in each cryptocurrency option', () => {
    const onSelect = jest.fn();
    render(<CryptoSelector options={mockOptions} selected="" onSelect={onSelect} />);
    const options = screen.getByRole('combobox').querySelectorAll('option');
    // options[1] is Bitcoin
    expect(options[1].textContent).toContain('Bitcoin');
    expect(options[1].textContent).toContain('BTC');
    // options[2] is Ethereum
    expect(options[2].textContent).toContain('Ethereum');
    expect(options[2].textContent).toContain('ETH');
  });

  it('sets the select value to the selected prop', () => {
    const onSelect = jest.fn();
    render(<CryptoSelector options={mockOptions} selected="ETH" onSelect={onSelect} />);
    const select = screen.getByRole('combobox');
    expect(select.value).toBe('ETH');
  });

  it('calls onSelect with option code when user changes selection', () => {
    const onSelect = jest.fn();
    render(<CryptoSelector options={mockOptions} selected="" onSelect={onSelect} />);
    const select = screen.getByRole('combobox');
    select.value = 'USDT';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('USDT');
  });

  it('renders empty placeholder when options array is empty', () => {
    const onSelect = jest.fn();
    render(<CryptoSelector options={[]} selected="" onSelect={onSelect} />);
    const options = screen.getByRole('combobox').querySelectorAll('option');
    // Only the placeholder option
    expect(options).toHaveLength(1);
  });
});
