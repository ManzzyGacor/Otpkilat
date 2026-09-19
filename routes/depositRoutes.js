const express = require('express');
const router = express.Router();
const depositController = require('../controllers/depositController');
const { verifyToken } = require('../middleware/auth');
const { blockWhenMaintenance } = require('../middleware/maintenance');

router.use(verifyToken, blockWhenMaintenance);

router.get('/methods', depositController.getPaymentMethods);
router.get('/history', depositController.getHistory);
router.get('/pending', depositController.getPending);
router.post('/create', depositController.createDeposit);
router.get('/create', depositController.createDeposit); // alias lama
router.get('/check', depositController.checkDeposit);
router.get('/cancel', depositController.cancelDeposit);
router.post('/cancel', depositController.cancelDeposit);

module.exports = router;
