// frontend/tests/components/checkout/CryptoSelector.test.jsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import CryptoSelector from '../../../components/checkout/CryptoSelector';

const TEST_OPTIONS = [
  { code: 'BTC', label: 'Bitcoin' },
  { code: 'ETH', label: 'Ethereum' },
  { code: 'USDT', label: 'Tether' },
];

describe('CryptoSelector', () => {
  it('renders all crypto options', () => {
    render(<CryptoSelector options={TEST_OPTIONS} selected="BTC" onSelect={() => {}} />);
    expect(screen.getByText('Bitcoin (BTC)')).toBeInTheDocument();
    expect(screen.getByText('Ethereum (ETH)')).toBeInTheDocument();
    expect(screen.getByText('Tether (USDT)')).toBeInTheDocument();
  });

  it('shows currently selected crypto', () => {
    render(<CryptoSelector options={TEST_OPTIONS} selected="ETH" onSelect={() => {}} />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('ETH');
  });

  it('calls onSelect when crypto changes', async () => {
    const onSelect = jest.fn();
    render(<CryptoSelector options={TEST_OPTIONS} selected="BTC" onSelect={onSelect} />);
    const user = userEvent.setup();
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'ETH');
    expect(onSelect).toHaveBeenCalledWith('ETH');
  });
});
