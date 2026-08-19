const express = require('express');
const router = express.Router();
const depositController = require('../controllers/depositController');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const depositLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 menit
  max: 3, // Maksimal 3 request deposit per 5 menit
  message: { success: false, error: { message: 'Anda memiliki batas pembuatan deposit. Tunggu beberapa saat.' } }
});

router.use(auth);

// API Endpoints
router.post('/create', depositLimiter, depositController.createDeposit);
router.get('/status/:depositId', depositController.getDepositStatus);
router.post('/cancel/:depositId', depositController.cancelDeposit);

// View Rendering
router.get('/', (req, res) => {
  res.render('deposit/index', { title: 'Deposit Saldo' });
});

module.exports = router;