const express = require('express');
const router = express.Router();
const otpController = require('../controllers/otpController');
const jwt = require('jsonwebtoken');

// Middleware Autentikasi JWT
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

// Semua rute OTP dilindungi agar hanya user login yang bisa akses
router.get('/services', verifyToken, otpController.getServices);
router.get('/countries', verifyToken, otpController.getCountries);
router.get('/operators', verifyToken, otpController.getOperators);
router.get('/order', verifyToken, otpController.orderNumber);
router.get('/check-order', verifyToken, otpController.checkOrder);
router.get('/set-status', verifyToken, otpController.setOrderStatus);

module.exports = router;