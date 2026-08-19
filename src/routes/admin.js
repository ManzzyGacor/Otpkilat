const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const adminSettingsController = require('../controllers/adminSettingsController');

// Terapkan middleware login dan pengecekan role admin
router.use(auth);
router.use(adminMiddleware);

// ==========================================
// API Endpoints untuk fungsionalitas Admin
// ==========================================
router.get('/api/users', adminController.getUsers);
router.post('/api/users/adjust-balance', adminController.adjustBalance);
router.get('/api/transactions/logs', adminController.getTransactionsLogs);

// ==========================================
// Render Halaman (EJS)
// ==========================================
router.get('/', async (req, res) => {
  // Dalam production asli, query ke MongoDB (User.countDocuments, Order.aggregate, dll) 
  // bisa dilakukan di sini untuk mengirim statistik ke dashboard.
  // Untuk kerangka ini, kita asumsikan data ditarik/dihitung secara asinkron atau dilempar sebagai placeholder.
  res.render('admin/index', { title: 'Admin Dashboard' });
});

router.get('/users', (req, res) => {
  res.render('admin/users', { title: 'Manajemen Pengguna' });
});

router.get('/settings', (req, res) => {
  res.render('admin/settings', { title: 'Pengaturan Sistem' });
});


// Tambahkan rute ini di dalam src/routes/admin.js:
router.get('/settings', adminSettingsController.getSettings);
router.post('/api/settings/update', adminSettingsController.updateSettings);
router.post('/api/announcements/create', adminSettingsController.createAnnouncement);
router.post('/api/announcements/delete/:id', adminSettingsController.deleteAnnouncement);

module.exports = router;