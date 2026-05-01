const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController_csrf');
const { protect, loginRateLimiter } = require('../middleware/authMiddleware_new');

// Public routes
router.post('/register', authController.register);
router.post('/login', loginRateLimiter, authController.login);
router.post('/refresh-token', authController.refreshToken);

// Protected routes (require authentication)
router.post('/logout', protect, authController.logout);

module.exports = router;
