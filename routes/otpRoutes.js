const express = require('express');
const router = express.Router();
const otpController = require('../controllers/otpController');
const { verifyToken } = require('../middleware/auth');
const { blockWhenMaintenance } = require('../middleware/maintenance');

router.use(verifyToken, blockWhenMaintenance);

router.get('/active', otpController.getActiveOrder);
router.get('/history', otpController.getHistory);
router.get('/services', otpController.getServices);
router.get('/countries', otpController.getCountries);
router.get('/operators', otpController.getOperators);
router.get('/order', otpController.orderNumber);
router.get('/check-order', otpController.checkOrder);
router.get('/set-status', otpController.setOrderStatus);

module.exports = router;
