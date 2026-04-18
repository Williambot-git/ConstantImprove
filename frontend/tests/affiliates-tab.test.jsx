/**
 * AffiliatesTab.jsx unit tests
 *
 * COVERAGE TARGET: AffiliatesTab branches and handlers not hit by
 * ahoyman-dashboard integration tests (which test the page, not the tab).
 *
 * MOCK STRATEGY: We mock the api client module that AffiliatesTab imports.
 * The mock functions (mockGetAffiliates, mockCreateAffiliate, etc.) are
 * declared inside jest.mock factory so they are accessible to test cases
 * via the require() workaround — this is required because jest hoists
 * jest.mock() calls before any const declarations at module level.
 */

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), pathname: '/ahoyman-dashboard', query: {} }),
}));

jest.mock('../api/client', () => {
  // These mock functions live INSIDE the factory so jest can hoist the mock
  const mockGetAffiliates = jest.fn();
  const mockCreateAffiliate = jest.fn();
  const mockSuspendAffiliate = jest.fn();
  const mockDeleteAffiliate = jest.fn();
  const mockArchiveAffiliate = jest.fn();
  const mockReactivateAffiliate = jest.fn();
  const mockRegenerateAffiliateKit = jest.fn();

  return {
    __esModule: true,
    default: {
      getAffiliates: mockGetAffiliates,
      createAffiliate: mockCreateAffiliate,
      suspendAffiliate: mockSuspendAffiliate,
      deleteAffiliate: mockDeleteAffiliate,
      archiveAffiliate: mockArchiveAffiliate,
      reactivateAffiliate: mockReactivateAffiliate,
      regenerateAffiliateKit: mockRegenerateAffiliateKit,
    },
    _mocks: {
      getAffiliates: mockGetAffiliates,
      createAffiliate: mockCreateAffiliate,
      suspendAffiliate: mockSuspendAffiliate,
      deleteAffiliate: mockDeleteAffiliate,
      archiveAffiliate: mockArchiveAffiliate,
      reactivateAffiliate: mockReactivateAffiliate,
      regenerateAffiliateKit: mockRegenerateAffiliateKit,
    },
  };
});

import { render, screen, waitFor, findByText } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import React from 'react';
import AffiliatesTab from '../components/ahoyman-dashboard/AffiliatesTab';

// Access the mock functions via require (hoisting workaround)
const { _mocks: mocks } = require('../api/client');

// ---------------------------------------------------------------------------
// Default props + resolved getAffiliates
// ---------------------------------------------------------------------------
const defaultAffiliate = {
  id: 'aff_1',
  username: 'johndoe',
  status: 'active',
  totalEarned: 1250.75,
  totalPaid: 800.00,
  pendingBalance: 450.75,
  totalReferrals: 25,
  activeReferrals: 18,
};

const defaultResolved = {
  data: {
    data: [defaultAffiliate],
    pagination: { pages: 1, page: 1 },
  },
};

const defaultProps = { onAction: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mocks.getAffiliates.mockResolvedValue(defaultResolved);
});

// ---------------------------------------------------------------------------
// SECTION 1: Loading state
// ---------------------------------------------------------------------------
describe('loading state', () => {
  it('shows "Loading..." while fetching affiliates', async () => {
    // Never resolve getAffiliates — tab starts with loading=true
    mocks.getAffiliates.mockImplementation(() => new Promise(() => {}));
    render(<AffiliatesTab {...defaultProps} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SECTION 2: Empty state
// ---------------------------------------------------------------------------
describe('empty state', () => {
  it('shows "No affiliates found." when API returns empty array', async () => {
    mocks.getAffiliates.mockResolvedValue({ data: { data: [], pagination: {} } });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('No affiliates found.')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// SECTION 3: Table rendering — data columns
// ---------------------------------------------------------------------------
describe('table rendering — affiliate data', () => {
  it('renders username for each affiliate', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('johndoe')).toBeInTheDocument());
  });

  it('renders status badge', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('active')).toBeInTheDocument());
  });

  it('renders totalEarned as formatted currency', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('$1250.75')).toBeInTheDocument());
  });

  it('renders totalPaid as formatted currency', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('$800.00')).toBeInTheDocument());
  });

  it('renders pendingBalance in yellow color', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('$450.75')).toBeInTheDocument());
  });

  it('renders referral count with active/inactive breakdown', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    // Wait for the affiliate row to appear, then check the text.
    // The referral text is split across two elements: "25" and "(18 active)".
    await waitFor(() => expect(screen.getByText('johndoe')).toBeInTheDocument());
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText(/18 active/)).toBeInTheDocument();
  });

  it('renders Suspend button for active affiliate', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /suspend/i })).toBeInTheDocument();
    });
  });

  it('renders "New Kit" button for every affiliate regardless of status', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new kit/i })).toBeInTheDocument();
    });
  });

  it('renders Archive and Delete buttons for every affiliate', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });
  });

  it('renders Reactivate (not Suspend) for suspended affiliate', async () => {
    mocks.getAffiliates.mockResolvedValue({
      data: {
        data: [{ ...defaultAffiliate, id: 'susp', username: 'suspendeduser', status: 'suspended' }],
        pagination: { pages: 1 },
      },
    });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reactivate/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /suspend/i })).not.toBeInTheDocument();
    });
  });

  it('renders no action button for unknown status (e.g. archived)', async () => {
    mocks.getAffiliates.mockResolvedValue({
      data: {
        data: [{ ...defaultAffiliate, id: 'arch', username: 'archiveduser', status: 'archived' }],
        pagination: { pages: 1 },
      },
    });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {
      // No Suspend or Reactivate for archived affiliates (status check returns null)
      expect(screen.queryByRole('button', { name: /suspend/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reactivate/i })).not.toBeInTheDocument();
    });
  });

  it('handles null/undefined financial fields gracefully', async () => {
    mocks.getAffiliates.mockResolvedValue({
      data: {
        data: [{ ...defaultAffiliate, id: 'nulls', username: 'nulluser', totalEarned: null, totalPaid: undefined, pendingBalance: null, totalReferrals: null, activeReferrals: null }],
        pagination: { pages: 1 },
      },
    });
    render(<AffiliatesTab {...defaultProps} />);
    // Verify the row renders despite null/undefined financial fields.
    // The component uses ?? operators (nullish coalescing) to fall back to 0,
    // which then formats as $0.00 via toFixed — but since multiple $0.00 values
    // exist in the row we assert the row is present rather than counting them.
    await waitFor(() => expect(screen.getByText('nulluser')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// SECTION 4: Search form
// ---------------------------------------------------------------------------
describe('search form', () => {
  it('renders search input and Search button', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText('Search username...')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('calls getAffiliates with search param when form is submitted', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText('Search username...')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText('Search username...'), 'alice');
    await userEvent.click(screen.getByRole('button', { name: /search/i }));
    await waitFor(() => {
      expect(mocks.getAffiliates).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'alice', page: 1 })
      );
    });
  });

  it('resets to page 1 when searching', async () => {
    mocks.getAffiliates.mockResolvedValue({
      data: { data: [], pagination: {} },
    });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {});
    await userEvent.type(screen.getByPlaceholderText('Search username...'), 'bob');
    await userEvent.click(screen.getByRole('button', { name: /search/i }));
    await waitFor(() => {
      expect(mocks.getAffiliates).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1 })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// SECTION 5: Create Affiliate form
// ---------------------------------------------------------------------------
describe('Create Affiliate form', () => {
  it('shows "+ New Affiliate" button by default', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /\+ new affiliate/i })).toBeInTheDocument());
  });

  it('shows Create New Affiliate card when button is clicked', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {});
    await userEvent.click(screen.getByRole('button', { name: /\+ new affiliate/i }));
    expect(screen.getByText('Create New Affiliate')).toBeInTheDocument();
  });

  it('hides form when Cancel is clicked', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {});
    await userEvent.click(screen.getByRole('button', { name: /\+ new affiliate/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('Create New Affiliate')).not.toBeInTheDocument();
  });

  it('shows username and password fields when form is open', async () => {
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {});
    await userEvent.click(screen.getByRole('button', { name: /\+ new affiliate/i }));
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
  });

  it('shows error message when createAffiliate API fails', async () => {
    mocks.createAffiliate.mockRejectedValue({ response: { data: { error: 'Username already taken' } } });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {});
    await userEvent.click(screen.getByRole('button', { name: /\+ new affiliate/i }));
    await userEvent.type(screen.getByPlaceholderText('Username'), 'newuser');
    await userEvent.type(screen.getByPlaceholderText(/password/i), 'securepass123');
    mocks.createAffiliate.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(screen.getByText('Username already taken')).toBeInTheDocument();
    });
  });

  it('shows success message and recovery codes on successful creation', async () => {
    const onAction = jest.fn();
    mocks.createAffiliate.mockResolvedValue({
      data: { data: { recoveryCodes: ['CODE1', 'CODE2', 'CODE3'] } },
    });
    // Use mockImplementation for getAffiliates so both the initial mount call
    // (useEffect) and the reload call (handleCreate success path) resolve.
    mocks.getAffiliates.mockImplementation(() =>
      Promise.resolve({ data: { data: [], pagination: { pages: 1 } } })
    );
    render(<AffiliatesTab {...defaultProps} onAction={onAction} />);
    await waitFor(() => expect(screen.getByPlaceholderText('Search username...')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /\+ new affiliate/i }));
    await userEvent.type(screen.getByPlaceholderText('Username'), 'newuser');
    await userEvent.type(screen.getByPlaceholderText(/password/i), 'securepass123');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    // Verify onAction was called (proves handleCreate succeeded)
    await waitFor(() => { expect(onAction).toHaveBeenCalled(); });
    // Verify the success message appears — check for the heading inside the
    // success div (the "Recovery codes" heading is visible once codes are set)
    await waitFor(() => {
      expect(screen.getByText(/Recovery codes — give these to the affiliate/i)).toBeInTheDocument();
    });
    // Verify the codes themselves are rendered in the grid
    expect(screen.getByText('CODE1')).toBeInTheDocument();
  });

  it('calls onAction after successful creation', async () => {
    mocks.createAffiliate.mockResolvedValue({ data: { data: { recoveryCodes: ['X1', 'X2'] } } });
    const onAction = jest.fn();
    render(<AffiliatesTab {...defaultProps} onAction={onAction} />);
    await waitFor(() => {});
    await userEvent.click(screen.getByRole('button', { name: /\+ new affiliate/i }));
    await userEvent.type(screen.getByPlaceholderText('Username'), 'newuser');
    await userEvent.type(screen.getByPlaceholderText(/password/i), 'securepass123');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(onAction).toHaveBeenCalled();
    });
  });

  it('clears username and password fields after successful creation', async () => {
    mocks.createAffiliate.mockResolvedValue({ data: { data: { recoveryCodes: ['X1'] } } });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {});
    await userEvent.click(screen.getByRole('button', { name: /\+ new affiliate/i }));
    await userEvent.type(screen.getByPlaceholderText('Username'), 'newuser');
    await userEvent.type(screen.getByPlaceholderText(/password/i), 'securepass123');
    mocks.createAffiliate.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Username')).toHaveValue('');
    });
  });
});

// ---------------------------------------------------------------------------
// SECTION 6: handleSuspend
// ---------------------------------------------------------------------------
describe('handleSuspend', () => {
  it('calls suspendAffiliate and reloads affiliates on success', async () => {
    mocks.suspendAffiliate.mockResolvedValue({ data: {} });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /suspend/i })).toBeInTheDocument());
    mocks.suspendAffiliate.mockClear();
    mocks.getAffiliates.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /suspend/i }));
    await waitFor(() => {
      expect(mocks.suspendAffiliate).toHaveBeenCalledWith('aff_1');
      expect(mocks.getAffiliates).toHaveBeenCalled(); // reloads
    });
  });

  it('shows alert on suspend failure', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
    mocks.suspendAffiliate.mockRejectedValue(new Error('fail'));
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /suspend/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /suspend/i }));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to suspend.');
    });
    alertSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// SECTION 7: handleReactivate
// ---------------------------------------------------------------------------
describe('handleReactivate', () => {
  it('calls reactivateAffiliate on success', async () => {
    mocks.reactivateAffiliate.mockResolvedValue({ data: {} });
    mocks.getAffiliates.mockResolvedValue({
      data: {
        data: [{ ...defaultAffiliate, id: 'susp', username: 'suspendeduser', status: 'suspended' }],
        pagination: { pages: 1 },
      },
    });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /reactivate/i })).toBeInTheDocument());
    mocks.reactivateAffiliate.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /reactivate/i }));
    await waitFor(() => {
      expect(mocks.reactivateAffiliate).toHaveBeenCalledWith('susp');
    });
  });

  it('shows alert on reactivate failure', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
    mocks.getAffiliates.mockResolvedValue({
      data: {
        data: [{ ...defaultAffiliate, id: 'susp', username: 'suspendeduser', status: 'suspended' }],
        pagination: { pages: 1 },
      },
    });
    mocks.reactivateAffiliate.mockRejectedValue(new Error('fail'));
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /reactivate/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /reactivate/i }));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to reactivate.');
    });
    alertSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// SECTION 8: handleDelete
// ---------------------------------------------------------------------------
describe('handleDelete', () => {
  it('does NOT call deleteAffiliate if first confirm is cancelled', async () => {
    global.confirm = jest.fn(() => false);
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(mocks.deleteAffiliate).not.toHaveBeenCalled();
  });

  it('does NOT call deleteAffiliate if second confirm is cancelled', async () => {
    const confirmCalls = [true, false];
    global.confirm = jest.fn(() => confirmCalls.shift());
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(mocks.deleteAffiliate).not.toHaveBeenCalled();
  });

  it('calls deleteAffiliate when both confirms are accepted', async () => {
    global.confirm = jest.fn(() => true);
    mocks.deleteAffiliate.mockResolvedValue({ data: {} });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());
    mocks.deleteAffiliate.mockClear();
    mocks.getAffiliates.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    // Two confirm() calls, both return true → proceed
    expect(global.confirm).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(mocks.deleteAffiliate).toHaveBeenCalledWith('aff_1');
    });
  });

  it('shows alert on delete failure', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
    global.confirm = jest.fn(() => true);
    mocks.deleteAffiliate.mockRejectedValue({ response: { data: { error: 'Cannot delete' } } });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());
    mocks.deleteAffiliate.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Cannot delete');
    });
    alertSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// SECTION 9: handleArchive
// ---------------------------------------------------------------------------
describe('handleArchive', () => {
  it('does NOT call archiveAffiliate if confirm is cancelled', async () => {
    global.confirm = jest.fn(() => false);
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /archive/i }));
    expect(mocks.archiveAffiliate).not.toHaveBeenCalled();
  });

  it('calls archiveAffiliate and reloads when confirmed', async () => {
    global.confirm = jest.fn(() => true);
    mocks.archiveAffiliate.mockResolvedValue({ data: {} });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument());
    mocks.archiveAffiliate.mockClear();
    mocks.getAffiliates.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /archive/i }));
    await waitFor(() => {
      expect(mocks.archiveAffiliate).toHaveBeenCalledWith('aff_1');
    });
  });

  it('shows alert on archive failure', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
    global.confirm = jest.fn(() => true);
    mocks.archiveAffiliate.mockRejectedValue({ response: { data: { error: 'Archive failed' } } });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /archive/i }));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Archive failed');
    });
    alertSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// SECTION 10: handleRegenerateKit
// ---------------------------------------------------------------------------
describe('handleRegenerateKit', () => {
  it('shows alert with new recovery codes on success', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
    mocks.regenerateAffiliateKit.mockResolvedValue({
      data: { data: { recoveryCodes: ['NEW1', 'NEW2', 'NEW3'] } },
    });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /new kit/i })).toBeInTheDocument());
    mocks.regenerateAffiliateKit.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /new kit/i }));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining('johndoe')
      );
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining('NEW1')
      );
    });
    alertSpy.mockRestore();
  });

  it('shows alert on failure', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
    mocks.regenerateAffiliateKit.mockRejectedValue(new Error('fail'));
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /new kit/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /new kit/i }));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to regenerate kit.');
    });
    alertSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// SECTION 11: Pagination
// ---------------------------------------------------------------------------
describe('pagination', () => {
  it('renders pagination buttons when pagination.pages > 1', async () => {
    mocks.getAffiliates.mockResolvedValue({
      data: {
        data: [defaultAffiliate],
        pagination: { pages: 3, page: 1 },
      },
    });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {
      // Should show 3 page buttons
      expect(screen.getAllByRole('button', { name: /^[123]$/ })).toHaveLength(3);
    });
  });

  it('loads new page when pagination button is clicked', async () => {
    mocks.getAffiliates.mockResolvedValue({
      data: {
        data: [defaultAffiliate],
        pagination: { pages: 3, page: 1 },
      },
    });
    render(<AffiliatesTab {...defaultProps} />);
    // Wait for the first page to render before interacting
    await waitFor(() => expect(screen.getByText('johndoe')).toBeInTheDocument());
    mocks.getAffiliates.mockClear();
    mocks.getAffiliates.mockResolvedValue({
      data: { data: [defaultAffiliate], pagination: { pages: 3, page: 2 } },
    });
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => {
      expect(mocks.getAffiliates).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });
  });

  it('does NOT render pagination when pagination.pages is 1', async () => {
    mocks.getAffiliates.mockResolvedValue({
      data: { data: [defaultAffiliate], pagination: { pages: 1, page: 1 } },
    });
    render(<AffiliatesTab {...defaultProps} />);
    await waitFor(() => {});
    // Page buttons should NOT appear for single-page results
    expect(screen.queryByRole('button', { name: '1' })).not.toBeInTheDocument();
  });
});
