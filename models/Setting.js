const mongoose = require('mongoose');

/**
 * Dokumen tunggal (singleton) berisi konfigurasi platform.
 * Semua nilai yang dulu hanya bisa diisi lewat .env kini tersimpan di database
 * dan bisa diubah langsung dari Admin Dashboard.
 */
const settingSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },

    // Identitas situs
    siteName: { type: String, default: 'KilatOTP' },
    siteTagline: { type: String, default: 'Virtual Number & OTP Otomatis' },
    supportUrl: { type: String, default: 'https://t.me/kilatlogs' },

    // Harga
    marginProfit: { type: Number, default: 0 },

    // Pengumuman lama (dipertahankan agar data lama tidak hilang)
    announcement: { type: String, default: '' },

    // Provider nomor (RumahOTP)
    providerApiKey: { type: String, default: '' },
    providerBaseUrl: { type: String, default: 'https://www.rumahotp.io/api' },

    // Notifikasi Telegram
    telegramBotToken: { type: String, default: '' },
    telegramChatId: { type: String, default: '' },

    // Google OAuth
    googleClientId: { type: String, default: '' },
    googleClientSecret: { type: String, default: '' },
    googleCallbackUrl: { type: String, default: '' },

    // Batas top up
    depositMin: { type: Number, default: 2000 },
    depositMax: { type: Number, default: 1000000 },

    // Penyimpanan avatar (GitHub)
    githubToken: { type: String, default: '' },
    githubOwner: { type: String, default: '' },
    githubRepo: { type: String, default: '' },

    // Rahasia JWT (kalau kosong memakai env SESSION_SECRET)
    jwtSecret: { type: String, default: '' },

    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: 'Sistem sedang dalam perbaikan. Silakan coba beberapa saat lagi.' }
}, { timestamps: true });

const Setting = mongoose.model('Setting', settingSchema);
module.exports = Setting;
