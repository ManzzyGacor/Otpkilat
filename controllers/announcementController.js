const mongoose = require('mongoose');
const Announcement = require('../models/Announcement');

/** (PUBLIK) Pengumuman aktif untuk ditampilkan di dashboard user. */
exports.getAllAnnouncements = async (req, res) => {
    try {
        const announcements = await Announcement.find({ isActive: true })
            .sort({ createdAt: -1 })
            .limit(20);
        return res.status(200).json({ success: true, data: announcements });
    } catch (error) {
        console.error('[ANNOUNCEMENT LIST ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal mengambil pengumuman.' });
    }
};

/** (ADMIN) Tambah pengumuman. Rute ini dulu terbuka tanpa autentikasi sama sekali. */
exports.addAnnouncement = async (req, res) => {
    try {
        const title = String(req.body.title || '').trim();
        const content = String(req.body.content || '').trim();

        if (!title || !content) {
            return res.status(400).json({ success: false, message: 'Judul dan isi pengumuman wajib diisi.' });
        }

        const announcement = await Announcement.create({
            title: title.slice(0, 120),
            content: content.slice(0, 2000),
            isActive: req.body.isActive === undefined ? true : Boolean(req.body.isActive)
        });

        return res.status(201).json({ success: true, message: 'Pengumuman ditambahkan.', data: announcement });
    } catch (error) {
        console.error('[ANNOUNCEMENT ADD ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal menambah pengumuman.' });
    }
};

/** (ADMIN) Tampilkan atau sembunyikan pengumuman tanpa menghapusnya. */
exports.toggleAnnouncement = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'ID pengumuman tidak valid.' });
        }
        const announcement = await Announcement.findById(req.params.id);
        if (!announcement) return res.status(404).json({ success: false, message: 'Pengumuman tidak ditemukan.' });

        announcement.isActive = !announcement.isActive;
        await announcement.save();

        return res.status(200).json({
            success: true,
            message: announcement.isActive ? 'Pengumuman ditampilkan.' : 'Pengumuman disembunyikan.',
            data: announcement
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Gagal memperbarui pengumuman.' });
    }
};

/** (ADMIN) Hapus pengumuman. */
exports.deleteAnnouncement = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'ID pengumuman tidak valid.' });
        }
        const deleted = await Announcement.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, message: 'Pengumuman tidak ditemukan.' });

        return res.status(200).json({ success: true, message: 'Pengumuman dihapus.' });
    } catch (error) {
        console.error('[ANNOUNCEMENT DELETE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal menghapus pengumuman.' });
    }
};
