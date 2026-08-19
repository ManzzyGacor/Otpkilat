const Setting = require('../models/Setting');
const Announcement = require('../models/Announcement');

exports.getSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne();
    if (!settings) {
      settings = await Setting.create({});
    }
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    
    res.render('admin/settings', { 
      title: 'Pengaturan Sistem & Admin', 
      settings, 
      announcements 
    });
  } catch (error) {
    console.error('Get Settings Error:', error);
    res.status(500).render('500', { error: 'Gagal memuat halaman pengaturan.' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { 
      websiteName, 
      marginType, 
      marginValue, 
      minimumDeposit, 
      maximumDeposit, 
      minimumOrder, 
      maximumOrder, 
      maintenanceMode 
    } = req.body;

    let settings = await Setting.findOne();
    if (!settings) {
      settings = new Setting();
    }

    settings.websiteName = websiteName || settings.websiteName;
    settings.marginType = marginType || settings.marginType;
    settings.marginValue = Number(marginValue) || settings.marginValue;
    settings.minimumDeposit = Number(minimumDeposit) || settings.minimumDeposit;
    settings.maximumDeposit = Number(maximumDeposit) || settings.maximumDeposit;
    settings.minimumOrder = Number(minimumOrder) || settings.minimumOrder;
    settings.maximumOrder = Number(maximumOrder) || settings.maximumOrder;
    settings.maintenanceMode = maintenanceMode === 'true' || maintenanceMode === true;

    await settings.save();

    return res.status(200).json({ success: true, data: { message: 'Pengaturan sistem berhasil diperbarui.' } });
  } catch (error) {
    console.error('Update Settings Error:', error);
    return res.status(500).json({ success: false, error: { message: 'Gagal memperbarui pengaturan.' } });
  }
};

exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content, type } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, error: { message: 'Judul dan konten wajib diisi.' } });
    }

    const newAnnouncement = new Announcement({
      title,
      content,
      type: type || 'info',
      isActive: true
    });

    await newAnnouncement.save();
    return res.status(201).json({ success: true, data: { message: 'Pengumuman berhasil dibuat.' } });
  } catch (error) {
    console.error('Create Announcement Error:', error);
    return res.status(500).json({ success: false, error: { message: 'Gagal membuat pengumuman.' } });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    await Announcement.findByIdAndDelete(id);
    return res.status(200).json({ success: true, data: { message: 'Pengumuman berhasil dihapus.' } });
  } catch (error) {
    console.error('Delete Announcement Error:', error);
    return res.status(500).json({ success: false, error: { message: 'Gagal menghapus pengumuman.' } });
  }
};