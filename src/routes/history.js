const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', historyController.renderHistory);

module.exports = router;