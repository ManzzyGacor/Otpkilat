const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const orderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 5, // Maksimal 5 order per menit untuk mencegah spam
  message: { success: false, error: { message: 'Terlalu banyak permintaan order, tunggu sebentar.' } }
});

router.use(auth);

// API Endpoints
router.post('/create', orderLimiter, orderController.createOrder);
router.get('/status/:id', orderController.getOrderStatus);
router.post('/set-status/:id', orderController.setOrderStatus);

// View Rendering
router.get('/', (req, res) => {
  res.render('order/index', { title: 'Pesan Nomor' });
});

module.exports = router;