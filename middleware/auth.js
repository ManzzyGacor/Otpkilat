const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../utils/settings');

/**
 * Ambil token dari header Authorization (mendukung "Bearer <token>" maupun token polos)
 * atau dari query string ?token= untuk kebutuhan redirect.
 */
const extractToken = (req) => {
    const header = req.header('Authorization') || req.header('authorization');
    if (header) {
        return header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
    }
    if (req.query && req.query.token) return String(req.query.token);
    return null;
};

/**
 * Verifikasi JWT lalu muat ulang user dari database.
 * Sebelumnya role diambil langsung dari payload token sehingga perubahan role
 * (atau user yang dinonaktifkan) tidak pernah berlaku sampai user login ulang.
 */
const verifyToken = async (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ success: false, message: 'Akses ditolak. Silakan login terlebih dahulu.' });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret());
        const userId = decoded.user ? decoded.user.id : decoded.id;

        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Sesi tidak valid. Akun tidak ditemukan.' });
        }
        if (user.isActive === false) {
            return res.status(403).json({ success: false, message: 'Akun Anda dinonaktifkan. Hubungi admin.' });
        }

        req.user = { id: String(user._id), role: user.role, username: user.username };
        req.userDoc = user;
        return next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Sesi berakhir atau token tidak valid. Silakan login ulang.' });
    }
};

/** Hanya boleh diakses admin. Dipakai setelah verifyToken. */
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Akses ditolak. Khusus admin.' });
    }
    return next();
};

module.exports = { verifyToken, requireAdmin, extractToken };
