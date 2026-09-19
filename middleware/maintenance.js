const { getSettings } = require('../utils/settings');

/**
 * Saat mode perbaikan aktif, transaksi baru dihentikan untuk pengguna biasa.
 * Admin tetap bisa mengakses semuanya agar dapat menguji sebelum dibuka lagi.
 * Dipasang setelah verifyToken karena membutuhkan req.user.
 */
const blockWhenMaintenance = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'admin') return next();

        const settings = await getSettings();
        if (!settings.maintenanceMode) return next();

        return res.status(503).json({
            success: false,
            maintenance: true,
            message: settings.maintenanceMessage || 'Sistem sedang dalam perbaikan. Silakan coba beberapa saat lagi.'
        });
    } catch (error) {
        // Kegagalan membaca pengaturan tidak boleh mematikan layanan.
        return next();
    }
};

module.exports = { blockWhenMaintenance };
