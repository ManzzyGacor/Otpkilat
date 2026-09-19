const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

// Batasi percobaan login/registrasi untuk menahan serangan tebak password.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    // Hanya percobaan yang gagal yang dihitung, sehingga pengguna sah di balik
    // satu IP bersama (jaringan seluler, kantor) tidak ikut terblokir.
    skipSuccessfulRequests: true,
    message: { success: false, message: 'Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.' }
});

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);

// Login Google. Rute-rute ini sebelumnya tidak pernah didaftarkan sehingga
// tombol "Masuk dengan Google" selalu menghasilkan 404.
router.get('/google/status', authController.googleStatus);
router.get('/google', authController.googleRedirect);
router.get('/google/callback', authController.googleCallback);
router.post('/google/token', authLimiter, authController.googleToken);

router.post('/change-password', verifyToken, authController.changePassword);

module.exports = router;
