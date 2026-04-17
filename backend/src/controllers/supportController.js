const db = require('../config/database');

/**
 * Create a new support ticket.
 * POST /tickets → 201
 */
const createTicket = async (req, res) => {
  try {
    const { subject, message, priority } = req.body;
    const userId = req.user.id;

    // Normalise priority — default to 'medium' so DB constraint is respected
    const normalisedPriority = ['low', 'medium', 'high'].includes(priority)
      ? priority
      : 'medium';

    const result = await db.query(
      `INSERT INTO support_tickets (user_id, subject, message, priority, status, created_at)
       VALUES ($1, $2, $3, $4, 'open', NOW())
       RETURNING id, user_id, subject, message, priority, status, created_at`,
      [userId, subject, message, normalisedPriority]
    );

    res.status(201).json({ success: true, ticket: result.rows[0] });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
};

/**
 * Fetch all support tickets for the authenticated user.
 * GET /tickets → 200
 */
const getTickets = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT id, subject, priority, status, created_at
       FROM support_tickets
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
};

/**
 * Add a reply to an existing support ticket.
 * POST /tickets/:id/reply → 200
 */
const replyToTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    await db.query(
      `INSERT INTO support_replies (ticket_id, user_id, message, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [id, userId, message]
    );

    res.status(200).json({ success: true, message: 'Reply added successfully' });
  } catch (error) {
    console.error('Reply to ticket error:', error);
    res.status(500).json({ error: 'Failed to add reply' });
  }
};

/**
 * Return the public knowledge-base article list.
 * GET /kb → 200
 */
const getKnowledgeBase = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, category, question, answer, created_at
       FROM knowledge_base
       ORDER BY category ASC, id ASC`
    );

    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get knowledge base error:', error);
    res.status(500).json({ error: 'Failed to fetch knowledge base' });
  }
};

module.exports = {
  createTicket,
  getTickets,
  replyToTicket,
  getKnowledgeBase,
};
