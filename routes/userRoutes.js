const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const jwt = require('jsonwebtoken');
const multer = require('multer');

// Konfigurasi Multer (simpan di memory sementara)
const upload = multer({ storage: multer.memoryStorage() });

// Middleware Verifikasi Token Sederhana
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ success: false, message: 'Akses ditolak. Token tidak ada.' });
    
    try {
        const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.SESSION_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ success: false, message: 'Token tidak valid' });
    }
};

router.get('/me', verifyToken, userController.getProfile);
router.put('/update-name', verifyToken, userController.updateName);
router.post('/upload-avatar', verifyToken, upload.single('avatar'), userController.uploadAvatar);
router.get('/admin/balance', verifyToken, userController.getAdminBalance);

module.exports = router;