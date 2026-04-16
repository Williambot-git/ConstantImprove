const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { protect, csrfProtection, setCsrfToken } = require('../middleware/authMiddleware_new');

router.use(protect);
router.use(csrfProtection);

router.get('/plans', subscriptionController.getPlans);
router.get('/', subscriptionController.getSubscription);
router.post('/', subscriptionController.createSubscription);
router.put('/pause', subscriptionController.pauseSubscription);
router.put('/resume', subscriptionController.resumeSubscription);
router.put('/cancel', subscriptionController.cancelSubscription);
router.put('/switch', subscriptionController.switchPlan);
router.get('/invoices', subscriptionController.getInvoices);

module.exports = router;