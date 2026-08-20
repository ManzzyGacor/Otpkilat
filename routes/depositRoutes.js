const express = require('express');
const router = express.Router();
const depositController = require('../controllers/depositController');

router.get('/create', depositController.createDeposit);
router.get('/check', depositController.checkDeposit);
router.get('/cancel', depositController.cancelDeposit);

module.exports = router;