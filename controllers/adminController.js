const Setting = require('../models/Setting');

// Helper untuk memastikan selalu ada 1 dokumen pengaturan di database
const getOrCreateSetting = async () => {
    let setting = await Setting.findOne();
    if (!setting) {
        setting = await Setting.create({ marginProfit: 0, announcement: 'Selamat datang di KilatOTP!' });
    }
    return setting;
};

exports.getSettings = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Akses ditolak. Khusus Admin.' });
        }
        
        const setting = await getOrCreateSetting();
        res.status(200).json({ success: true, data: setting });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal memuat pengaturan sistem.' });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Akses ditolak. Khusus Admin.' });
        }

        const { marginProfit, announcement } = req.body;
        const setting = await getOrCreateSetting();
        
        // Update data
        setting.marginProfit = Number(marginProfit);
        setting.announcement = announcement;
        
        await setting.save();

        res.status(200).json({ success: true, message: 'Konfigurasi berhasil diperbarui.', data: setting });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan sistem.' });
    }
};