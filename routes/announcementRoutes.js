const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// Publik: hanya membaca pengumuman aktif.
router.get('/', announcementController.getAllAnnouncements);

// Admin: sebelumnya rute ini bisa dipanggil siapa saja tanpa login.
router.post('/add', verifyToken, requireAdmin, announcementController.addAnnouncement);
router.patch('/:id/toggle', verifyToken, requireAdmin, announcementController.toggleAnnouncement);
router.delete('/:id', verifyToken, requireAdmin, announcementController.deleteAnnouncement);

module.exports = router;
