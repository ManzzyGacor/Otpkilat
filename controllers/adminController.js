const Setting = require('../models/Setting');
const User = require('../models/User');
const Order = require('../models/Order');

const getOrCreateSetting = async () => {
    let setting = await Setting.findOne();
    if (!setting) {
        setting = await Setting.create({ marginProfit: 0, announcement: 'Selamat datang di KilatOTP!' });
    }
    return setting;
};

// Ambil Statistik Platform untuk Admin
exports.getAdminStats = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Akses ditolak.' });
        }

        const totalUsers = await User.countDocuments();
        const totalOrders = await Order.countDocuments();
        const users = await User.find();
        const totalBalanceInSystem = users.reduce((acc, user) => acc + user.balance, 0);

        const setting = await getOrCreateSetting();

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                totalOrders,
                totalBalanceInSystem,
                setting
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal memuat statistik admin.' });
    }
};

exports.getSettings = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Akses ditolak.' });
        }
        const setting = await getOrCreateSetting();
        res.status(200).json({ success: true, data: setting });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal memuat pengaturan.' });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Akses ditolak.' });
        }

        const { marginProfit, announcement } = req.body;
        const setting = await getOrCreateSetting();
        
        setting.marginProfit = Number(marginProfit);
        setting.announcement = announcement;
        await setting.save();

        res.status(200).json({ success: true, message: 'Pengaturan berhasil diperbarui.', data: setting });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan.' });
    }
};

// Fitur Tambah/Kurang Saldo User oleh Admin
exports.adjustUserBalance = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Akses ditolak.' });
        }

        const { username, amount, type } = req.body; // type: 'add' atau 'reduce'
        const targetUser = await User.findOne({ username });

        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        }

        const nominal = Number(amount);
        if (type === 'add') {
            targetUser.balance += nominal;
        } else if (type === 'reduce') {
            targetUser.balance = Math.max(0, targetUser.balance - nominal);
        }

        await targetUser.save();
        res.status(200).json({ success: true, message: `Saldo user @${username} berhasil diubah.` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal mengubah saldo user.' });
    }
};