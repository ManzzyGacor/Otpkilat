const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const jwt = require('jsonwebtoken');

// Middleware Verifikasi Token (Re-use logic)
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

router.get('/settings', verifyToken, adminController.getSettings);
router.post('/settings', verifyToken, adminController.updateSettings);

module.exports = router;