const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// Seluruh rute admin wajib login sebagai admin.
router.use(verifyToken, requireAdmin);

// Statistik
router.get('/stats', adminController.getStats);
router.get('/provider-balance', adminController.getProviderBalance);

// Manajemen user
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserDetail);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.post('/adjust-balance', adminController.adjustUserBalance);

// Transaksi
router.get('/orders', adminController.getOrders);
router.get('/deposits', adminController.getDeposits);
router.post('/deposits/:id/approve', adminController.approveDeposit);
router.post('/deposits/:id/reject', adminController.rejectDeposit);

// Metode pembayaran
router.get('/payment-methods', adminController.getPaymentMethods);
router.post('/payment-methods', adminController.createPaymentMethod);
router.put('/payment-methods/:id', adminController.updatePaymentMethod);
router.delete('/payment-methods/:id', adminController.deletePaymentMethod);

// Pengaturan & pengumuman
router.get('/settings', adminController.getSettings);
router.post('/settings', adminController.updateSettings);
router.put('/settings', adminController.updateSettings);
router.get('/announcements', adminController.getAnnouncements);

module.exports = router;
