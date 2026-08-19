const User = require('../models/User');
const githubService = require('../services/githubService');
const bcrypt = require('bcrypt');

exports.renderProfile = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-passwordHash');
    res.render('profile/index', { title: 'Profil Saya', userData: user });
  } catch (error) {
    res.status(500).render('500', { error: 'Gagal memuat profil.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { fullName, phone } = req.body;
    const user = await User.findById(req.session.userId);
    
    if (!user) return res.status(404).json({ success: false, error: { message: 'User tidak ditemukan.' } });

    if (fullName) user.fullName = fullName;
    if (phone) user.phone = phone;

    await user.save();
    return res.status(200).json({ success: true, data: { message: 'Profil berhasil diperbarui.', user: { fullName: user.fullName, phone: user.phone } } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { message: 'Terjadi kesalahan sistem.' } });
  }
};

exports.updateAvatar = async (req, res) => {
  try {
    const { base64Image, extension } = req.body;
    if (!base64Image || !extension) {
      return res.status(400).json({ success: false, error: { message: 'Data gambar tidak valid.' } });
    }

    const validExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    if (!validExtensions.includes(extension.toLowerCase())) {
      return res.status(400).json({ success: false, error: { message: 'Ekstensi gambar tidak diizinkan.' } });
    }

    const avatarUrl = await githubService.uploadImage(base64Image, extension);
    
    const user = await User.findById(req.session.userId);
    user.avatar = avatarUrl;
    await user.save();

    return res.status(200).json({ success: true, data: { message: 'Avatar berhasil diperbarui.', avatarUrl } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { message: error.message || 'Gagal mengubah avatar.' } });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.session.userId);

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: { message: 'Password lama tidak sesuai.' } });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: { message: 'Password baru minimal 8 karakter.' } });
    }

    user.passwordHash = newPassword; // Pre-save hook di Model User akan nge-hash ini otomatis
    await user.save();

    return res.status(200).json({ success: true, data: { message: 'Password berhasil diubah.' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { message: 'Gagal mengubah password.' } });
  }
};