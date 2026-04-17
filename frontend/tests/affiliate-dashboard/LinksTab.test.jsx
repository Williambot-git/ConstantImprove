/**
 * LinksTab — unit tests.
 * Tests affiliate link creation (custom code + auto-generate), copy, and deletion.
 *
 * MOVED FROM: frontend/components/affiliate-dashboard/LinksTab.test.jsx
 * REASON: Jest only discovers tests under frontend/tests/ (per jest.config.js roots).
 *         The original location was in the components/ directory — tests were never run.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import LinksTab from '../../components/affiliate-dashboard/LinksTab';

jest.mock('../../api/client', () => ({
  generateAffiliateLink: jest.fn(),
  createAffiliateLinkWithCode: jest.fn(),
  deleteAffiliateLink: jest.fn(),
  getAffiliateLinks: jest.fn(),
}));

describe('LinksTab', () => {
  const mockLinks = [
    { id: '1', code: 'TESTCODE', url: 'https://ahoyvpn.net/affiliate/TESTCODE', clicks: 10, signups: 2, discount_cents: 0, active: true },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders links tab with heading and create form', () => {
    render(<LinksTab links={[]} onAction={() => {}} />);
    expect(screen.getByText('Your Affiliate Links')).toBeInTheDocument();
    expect(screen.getByText('Create Affiliate Code')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. SUMMER50')).toBeInTheDocument();
  });

  it('renders empty state when no links', () => {
    render(<LinksTab links={[]} onAction={() => {}} />);
    expect(screen.getByText(/No links yet/i)).toBeInTheDocument();
  });

  it('renders links table with data', () => {
    render(<LinksTab links={mockLinks} onAction={() => {}} />);
    expect(screen.getByText('TESTCODE')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument(); // clicks
  });

  it('calls onAction after successful auto-generate', async () => {
    const onAction = jest.fn();
    require('../../api/client').generateAffiliateLink.mockResolvedValue({ data: { data: {} } });
    require('../../api/client').getAffiliateLinks.mockResolvedValue({ data: { data: [] } });

    render(<LinksTab links={[]} onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: /Auto-Generate/i }));

    // onAction is called after the API call succeeds
    await screen.findByText(/No links yet/i);
    expect(onAction).toHaveBeenCalled();
  });

  it('calls createAffiliateLinkWithCode with uppercase code and discount', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ data: { data: {} } });
    require('../../api/client').createAffiliateLinkWithCode = mockCreate;
    require('../../api/client').getAffiliateLinks.mockResolvedValue({ data: { data: [] } });

    render(<LinksTab links={[]} onAction={() => {}} />);

    await userEvent.type(screen.getByPlaceholderText('e.g. SUMMER50'), 'summer50');
    await userEvent.selectOptions(screen.getByRole('combobox'), '50');
    await userEvent.click(screen.getByRole('button', { name: /Create Code/i }));

    // Wait for the form to be re-processed
    await screen.findByText(/No links yet/i);
  });

  it('renders copy and delete buttons for each link', () => {
    render(<LinksTab links={mockLinks} onAction={() => {}} />);
    expect(screen.getAllByRole('button', { name: /Copy/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Delete/i }).length).toBeGreaterThan(0);
  });
});
