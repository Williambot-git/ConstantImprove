/**
 * supportController.test.js
 *
 * Unit tests for supportController — covers:
 * - createTicket: POST /tickets → 201 with ticket object
 * - getTickets: GET /tickets → 200 with array of tickets
 * - replyToTicket: POST /tickets/:id/reply → 200
 * - getKnowledgeBase: GET /kb → 200 with KB articles
 *
 * These were 501 stubs; tests document expected behavior and
 * drive the minimal implementation.
 */

// Mock db before requiring controller
const mockQuery = jest.fn();
jest.mock('../../src/config/database', () => ({
  query: mockQuery
}));

const {
  createTicket,
  getTickets,
  replyToTicket,
  getKnowledgeBase,
} = require('../../src/controllers/supportController');

describe('supportController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // ============================================================
  // createTicket
  // ============================================================
  describe('createTicket', () => {
    it('201: creates a support ticket with default medium priority', async () => {
      mockReq = {
        user: { id: 'user-123' },
        body: {
          subject: 'Cannot connect to VPN',
          message: 'Getting timeout errors.',
        },
      };

      const ticketRow = {
        id: 'ticket-1',
        user_id: 'user-123',
        subject: 'Cannot connect to VPN',
        message: 'Getting timeout errors.',
        priority: 'medium',
        status: 'open',
        created_at: new Date().toISOString(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [ticketRow] });

      await createTicket(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        ticket: ticketRow,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO support_tickets'),
        ['user-123', 'Cannot connect to VPN', 'Getting timeout errors.', 'medium']
      );
    });

    it('201: creates ticket with high priority when specified', async () => {
      mockReq = {
        user: { id: 'user-456' },
        body: {
          subject: 'Urgent billing issue',
          message: 'Charged twice.',
          priority: 'high',
        },
      };

      const ticketRow = {
        id: 'ticket-2',
        user_id: 'user-456',
        subject: 'Urgent billing issue',
        message: 'Charged twice.',
        priority: 'high',
        status: 'open',
        created_at: new Date().toISOString(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [ticketRow] });

      await createTicket(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        ticket: ticketRow,
      });
    });

    it('500: returns 500 on database error', async () => {
      mockReq = {
        user: { id: 'user-789' },
        body: { subject: 'Test', message: 'Test message' },
      };
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      await createTicket(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to create ticket',
      });
    });
  });

  // ============================================================
  // getTickets
  // ============================================================
  describe('getTickets', () => {
    it('200: returns tickets for the authenticated user', async () => {
      mockReq = {
        user: { id: 'user-123' },
      };

      const rows = [
        {
          id: 'ticket-1',
          subject: 'Issue 1',
          priority: 'medium',
          status: 'open',
          created_at: new Date().toISOString(),
        },
        {
          id: 'ticket-2',
          subject: 'Issue 2',
          priority: 'high',
          status: 'resolved',
          created_at: new Date().toISOString(),
        },
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      await getTickets(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: rows,
      });
    });

    it('200: returns empty array when user has no tickets', async () => {
      mockReq = { user: { id: 'user-new' } };
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getTickets(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: [],
      });
    });

    it('500: returns 500 on database error', async () => {
      mockReq = { user: { id: 'user-err' } };
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await getTickets(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch tickets',
      });
    });
  });

  // ============================================================
  // replyToTicket
  // ============================================================
  describe('replyToTicket', () => {
    it('200: adds a reply to an existing ticket', async () => {
      mockReq = {
        user: { id: 'user-123' },
        params: { id: 'ticket-1' },
        body: { message: 'Here is more information.' },
      };

      mockQuery.mockResolvedValueOnce({ rows: [] }); // insert reply

      await replyToTicket(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Reply added successfully',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO support_replies'),
        ['ticket-1', 'user-123', 'Here is more information.']
      );
    });

    it('500: returns 500 on database error', async () => {
      mockReq = {
        user: { id: 'user-err' },
        params: { id: 'ticket-99' },
        body: { message: 'Reply text' },
      };
      mockQuery.mockRejectedValueOnce(new Error('DB failure'));

      await replyToTicket(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to add reply',
      });
    });
  });

  // ============================================================
  // getKnowledgeBase
  // ============================================================
  describe('getKnowledgeBase', () => {
    it('200: returns KB articles sorted by category', async () => {
      mockReq = {};

      const rows = [
        { id: 1, category: 'Billing', question: 'How do I cancel?', answer: 'Visit account settings.', created_at: new Date().toISOString() },
        { id: 2, category: 'Getting Started', question: 'How to connect?', answer: 'Download app and login.', created_at: new Date().toISOString() },
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      await getKnowledgeBase(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: rows,
      });
    });

    it('200: returns empty array when no KB articles exist', async () => {
      mockReq = {};
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getKnowledgeBase(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: [],
      });
    });

    it('500: returns 500 on database error', async () => {
      mockReq = {};
      mockQuery.mockRejectedValueOnce(new Error('DB unavailable'));

      await getKnowledgeBase(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch knowledge base',
      });
    });
  });
});
