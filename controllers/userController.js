const axios = require('axios');
const User = require('../models/User');
const Order = require('../models/Order');
const Deposit = require('../models/Deposit');
const { getSettings } = require('../utils/settings');

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        return res.status(200).json({ success: true, data: user.toPublic() });
    } catch (error) {
        console.error('[PROFILE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat profil.' });
    }
};

/** Ringkasan untuk kartu statistik di halaman profil. */
exports.getSummary = async (req, res) => {
    try {
        const [totalOrders, completedOrders, depositAgg] = await Promise.all([
            Order.countDocuments({ user: req.user.id }),
            Order.countDocuments({ user: req.user.id, status: 'completed' }),
            Deposit.aggregate([
                { $match: { user: req.userDoc._id, status: 'success' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);

        return res.status(200).json({
            success: true,
            data: {
                totalOrders,
                completedOrders,
                totalDeposit: depositAgg[0] ? depositAgg[0].total : 0
            }
        });
    } catch (error) {
        console.error('[SUMMARY ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat ringkasan.' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });

        if (req.body.fullName !== undefined) {
            const fullName = String(req.body.fullName).trim();
            if (fullName.length < 2) {
                return res.status(400).json({ success: false, message: 'Nama lengkap minimal 2 karakter.' });
            }
            user.fullName = fullName;
        }

        if (req.body.phoneNumber !== undefined) {
            const phoneNumber = String(req.body.phoneNumber).trim();
            if (phoneNumber && !/^[0-9+\-\s]{8,20}$/.test(phoneNumber)) {
                return res.status(400).json({ success: false, message: 'Format nomor HP tidak valid.' });
            }
            if (phoneNumber && phoneNumber !== user.phoneNumber
                && await User.exists({ phoneNumber, _id: { $ne: user._id } })) {
                return res.status(409).json({ success: false, message: 'Nomor HP sudah dipakai akun lain.' });
            }
            user.phoneNumber = phoneNumber || null;
        }

        await user.save();
        return res.status(200).json({ success: true, message: 'Profil berhasil diperbarui.', data: user.toPublic() });
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Nomor HP sudah dipakai akun lain.' });
        }
        console.error('[UPDATE PROFILE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memperbarui profil.' });
    }
};

/** Kompatibilitas dengan endpoint lama /update-name. */
exports.updateName = exports.updateProfile;

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

exports.uploadAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Tidak ada file yang diunggah.' });
        }
        if (!ALLOWED_AVATAR_TYPES.includes(req.file.mimetype)) {
            return res.status(400).json({ success: false, message: 'Format gambar harus PNG, JPG, atau WEBP.' });
        }
        if (req.file.size > MAX_AVATAR_BYTES) {
            return res.status(400).json({ success: false, message: 'Ukuran gambar maksimal 2 MB.' });
        }

        const settings = await getSettings();
        if (!settings.githubToken || !settings.githubOwner || !settings.githubRepo) {
            return res.status(503).json({
                success: false,
                message: 'Penyimpanan gambar belum dikonfigurasi. Hubungi admin.'
            });
        }

        const extension = req.file.mimetype === 'image/png' ? 'png' : (req.file.mimetype === 'image/webp' ? 'webp' : 'jpg');
        const filename = `avatar_${req.user.id}_${Date.now()}.${extension}`;
        const url = `https://api.github.com/repos/${settings.githubOwner}/${settings.githubRepo}/contents/avatars/${filename}`;

        const githubResponse = await axios.put(url, {
            message: `Upload avatar for user ${req.user.id}`,
            content: req.file.buffer.toString('base64')
        }, {
            headers: {
                Authorization: `token ${settings.githubToken}`,
                Accept: 'application/vnd.github+json'
            },
            timeout: 30000
        });

        const rawUrl = githubResponse.data.content.download_url;
        const user = await User.findByIdAndUpdate(req.user.id, { avatarUrl: rawUrl }, { new: true }).select('-password');

        return res.status(200).json({ success: true, message: 'Foto profil berhasil diperbarui.', data: user.toPublic() });
    } catch (error) {
        console.error('[UPLOAD AVATAR ERROR]', error.response ? error.response.data : error.message);
        return res.status(502).json({ success: false, message: 'Gagal mengunggah foto profil.' });
    }
};
