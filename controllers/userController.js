const User = require('../models/User');
const axios = require('axios');
require('dotenv').config();

// Mengambil profil user saat ini
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal memuat profil' });
    }
};

// Update Nama
exports.updateName = async (req, res) => {
    try {
        const { fullName } = req.body;
        const user = await User.findByIdAndUpdate(req.user.id, { fullName }, { new: true }).select('-password');
        res.status(200).json({ success: true, message: 'Nama berhasil diubah', data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal mengubah nama' });
    }
};

// Upload Avatar ke GitHub
exports.uploadAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Tidak ada file yang diunggah' });
        }

        const fileBuffer = req.file.buffer.toString('base64');
        const filename = `avatar_${req.user.id}_${Date.now()}.png`;
        const owner = process.env.GITHUB_OWNER;
        const repo = process.env.GITHUB_REPO;
        const token = process.env.GITHUB_TOKEN;

        const githubApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/avatars/${filename}`;

        // Push ke GitHub API
        const githubResponse = await axios.put(
            githubApiUrl,
            {
                message: `Upload avatar for user ${req.user.id}`,
                content: fileBuffer
            },
            {
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Ambil URL raw dari GitHub
        const rawUrl = githubResponse.data.content.download_url;

        // Update database user
        const user = await User.findByIdAndUpdate(req.user.id, { avatarUrl: rawUrl }, { new: true }).select('-password');

        res.status(200).json({ success: true, message: 'Avatar berhasil diperbarui', data: user });
    } catch (error) {
        console.error(error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, message: 'Gagal mengunggah avatar ke GitHub' });
    }
};

// Ambil Saldo Pusat (Hanya Admin)
exports.getAdminBalance = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Akses ditolak. Khusus Admin.' });
        }

        const response = await axios({
            method: 'GET',
            url: `${process.env.RUMAHOTP_BASE_URL}/v1/user/balance`,
            headers: {
                'x-apikey': process.env.RUMAHOTP_API_KEY,
                'Accept': 'application/json'
            }
        });

        res.status(200).json(response.data);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal mengambil saldo dari server' });
    }
};