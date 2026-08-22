const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');

// Rute Publik (Muncul di Dashboard User)
router.get('/', announcementController.getAllAnnouncements);

// Rute Admin (Menambah / Menghapus)
// Ganti middleware ini jika kamu punya sistem admin terpisah
router.post('/add', announcementController.addAnnouncement);
router.delete('/:id', announcementController.deleteAnnouncement);

module.exports = router;