const express = require('express');
const router = express.Router();
const depositController = require('../controllers/depositController');
const jwt = require('jsonwebtoken');

// Middleware Verifikasi Token
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ success: false, message: 'Akses ditolak.' });
    try {
        const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.SESSION_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ success: false, message: 'Token tidak valid' });
    }
};

router.get('/create', verifyToken, depositController.createDeposit);
router.get('/check', verifyToken, depositController.checkDeposit);
router.get('/cancel', verifyToken, depositController.cancelDeposit);

module.exports = router;