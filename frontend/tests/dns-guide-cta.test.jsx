/**
 * DNS Guide CTA Integration Test
 * Tests the real faq.jsx page rendering — specifically the DNS guide CTA card
 * which was previously skipped due to next/link mock complexity.
 */
import '@testing-library/jest-dom';
const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;

// Import the real FAQ page — this exercises the full component including Link
const FAQ = require('../pages/faq.jsx').default;

describe('FAQ Page — DNS Guide CTA (integration test)', () => {
  it('renders the DNS guide CTA card at the bottom', () => {
    render(<FAQ />);
    // The card has a specific heading
    expect(screen.getByText('Want to enhance your privacy further?')).toBeInTheDocument();
  });

  it('renders DNS guide CTA with correct description text', () => {
    render(<FAQ />);
    expect(screen.getByText(/encrypt your DNS traffic/i)).toBeInTheDocument();
  });

  it('renders DNS guide link with correct href', () => {
    render(<FAQ />);
    const link = screen.getByRole('link', { name: /View our DNS Encryption Guide/i });
    expect(link).toHaveAttribute('href', '/dns-guide');
  });

  it('link is clickable without error', async () => {
    render(<FAQ />);
    const user = userEvent.setup();
    const link = screen.getByRole('link', { name: /View our DNS Encryption Guide/i });
    // Should not throw
    await user.click(link);
  });
});
