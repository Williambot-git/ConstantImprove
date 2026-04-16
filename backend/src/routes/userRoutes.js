const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const exportController = require('../controllers/exportController');
const { protect, csrfProtection, setCsrfToken, require2FA } = require('../middleware/authMiddleware_new');

router.use(protect);
router.use(csrfProtection);

router.get('/profile', userController.getProfile);
router.put('/profile', require2FA, userController.updateProfile);
router.get('/devices', userController.getDevices);
router.delete('/devices/:id', userController.revokeDevice);
router.get('/activity', userController.getActivity);
router.get('/usage', userController.getUsage);
router.delete('/account', userController.deleteAccount);

// GDPR/CCPA data export endpoints
router.post('/export', exportController.createExport);
router.get('/export/:token', exportController.downloadExport);

module.exports = router;