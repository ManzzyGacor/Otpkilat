require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const { getSettings } = require('./utils/settings');
const { seedDefaults } = require('./config/seed');

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');

// Di belakang reverse proxy (Vercel, Nginx, Cloudflare) supaya IP asli
// dan protokol https terbaca dengan benar oleh rate limiter & OAuth.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.use('/api', rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' }
}));

/* ------------------------ Kesiapan database ------------------------ */

let seedPromise = null;

/**
 * Pastikan database siap sebelum rute API dijalankan.
 *
 * Di server biasa koneksi dibuka sekali saat start. Di serverless tidak ada
 * momen "start" yang bisa diandalkan, jadi kesiapan diperiksa per request;
 * hasilnya di-cache sehingga request berikutnya tidak menunggu lagi.
 */
const ensureDatabase = async (req, res, next) => {
    try {
        await connectDB();
        if (!seedPromise) {
            seedPromise = seedDefaults().catch((error) => {
                // Gagal menyiapkan data awal tidak boleh mematikan API, tapi
                // harus dicoba lagi pada request berikutnya.
                seedPromise = null;
                console.error('[SEED] gagal:', error.message);
            });
        }
        await seedPromise;
        return next();
    } catch (error) {
        console.error('[DB] Tidak bisa terhubung:', error.message);
        return res.status(503).json({
            success: false,
            message: 'Server sedang tidak dapat menghubungi database. Coba lagi sebentar lagi.'
        });
    }
};

/* ------------------------------- API ------------------------------- */

app.get('/api/health', (req, res) => res.status(200).json({
    success: true,
    uptime: process.uptime(),
    env: process.env.VERCEL ? 'vercel' : 'node'
}));

/** Konfigurasi publik untuk frontend (nama situs, status login Google, dll). */
app.get('/api/config', async (req, res) => {
    try {
        await connectDB();
        const settings = await getSettings();
        return res.status(200).json({
            success: true,
            data: {
                siteName: settings.siteName,
                siteTagline: settings.siteTagline,
                supportUrl: settings.supportUrl,
                googleEnabled: Boolean(settings.googleClientId && settings.googleClientSecret),
                depositMin: settings.depositMin,
                depositMax: settings.depositMax,
                maintenanceMode: settings.maintenanceMode,
                maintenanceMessage: settings.maintenanceMessage
            }
        });
    } catch (error) {
        // Halaman tetap harus bisa tampil walau pengaturan belum terbaca.
        return res.status(200).json({ success: true, data: { siteName: 'KilatOTP', googleEnabled: false } });
    }
});

app.use('/api/auth', ensureDatabase, require('./routes/authRoutes'));
app.use('/api/otp', ensureDatabase, require('./routes/otpRoutes'));
app.use('/api/deposit', ensureDatabase, require('./routes/depositRoutes'));
app.use('/api/user', ensureDatabase, require('./routes/userRoutes'));
app.use('/api/admin', ensureDatabase, require('./routes/adminRoutes'));
app.use('/api/announcements', ensureDatabase, require('./routes/announcementRoutes'));

// Endpoint API yang tidak dikenal harus menjawab JSON, bukan halaman HTML.
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan.' }));

/* ----------------------------- Halaman ----------------------------- */

app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: false }));

const sendPage = (file) => (req, res) => res.sendFile(path.join(PUBLIC_DIR, file));

// Halaman depan adalah landing page; aplikasi ada di /dashboard.
app.get('/', sendPage('landing.html'));
app.get('/dashboard', sendPage('dashboard.html'));

app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));

/* eslint-disable no-unused-vars */
app.use((err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'Ukuran file terlalu besar (maksimal 2 MB).' });
    }
    console.error('[UNHANDLED ERROR]', err);
    if (res.headersSent) return next(err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
});
/* eslint-enable no-unused-vars */

module.exports = app;
