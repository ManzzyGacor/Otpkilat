const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        default: 'Info Sistem'
    },
    content: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true // Jika false, pengumuman bisa disembunyikan tanpa dihapus
    }
}, {
    timestamps: true
});

const Announcement = mongoose.model('Announcement', announcementSchema);
module.exports = Announcement;