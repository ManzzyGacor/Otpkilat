const Announcement = require('../models/Announcement');

// (PUBLIC) Mengambil semua pengumuman yang aktif
exports.getAllAnnouncements = async (req, res) => {
    try {
        // Ambil semua pengumuman aktif, urutkan dari yang terbaru (descending)
        const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: announcements });
    } catch (error) {
        res.status(500).json({ success: false, message: "Gagal mengambil pengumuman." });
    }
};

// (ADMIN) Menambah pengumuman baru
exports.addAnnouncement = async (req, res) => {
    try {
        const { title, content } = req.body;
        const newAnnounce = await Announcement.create({ title, content });
        res.status(201).json({ success: true, message: "Pengumuman ditambahkan!", data: newAnnounce });
    } catch (error) {
        res.status(500).json({ success: false, message: "Gagal menambah pengumuman." });
    }
};

// (ADMIN) Menghapus pengumuman
exports.deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        await Announcement.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Pengumuman dihapus!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Gagal menghapus pengumuman." });
    }
};