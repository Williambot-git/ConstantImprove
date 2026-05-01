const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const emailService = require('../services/emailService');
const { protect, csrfProtection, setCsrfToken } = require('../middleware/authMiddleware_new');

// Public — no auth required
router.post('/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    res.status(400).json({ error: 'All fields are required' });
    return;
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: 'Invalid email address' });
    return;
  }

  try {
    await emailService.sendContactEmail({ name, email, subject, message });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

router.use(protect);
router.use(csrfProtection);

router.post('/tickets', supportController.createTicket);
router.get('/tickets', supportController.getTickets);
router.post('/tickets/:id/reply', supportController.replyToTicket);
router.get('/kb', supportController.getKnowledgeBase);

module.exports = router;