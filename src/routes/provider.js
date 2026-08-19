const express = require('express');
const router = express.Router();
const rumahOtpService = require('../services/rumahOtpService');
const auth = require('../middleware/auth');

// Semua rute provider butuh login
router.use(auth);

router.get('/services', async (req, res) => {
  try {
    const data = await rumahOtpService.getServices();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.get('/countries', async (req, res) => {
  try {
    const { service_id } = req.query;
    if (!service_id) return res.status(400).json({ success: false, error: { message: 'Service ID diperlukan.' } });
    
    const data = await rumahOtpService.getCountries(service_id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.get('/operators', async (req, res) => {
  try {
    const { country, provider_id } = req.query;
    const data = await rumahOtpService.getOperators(country, provider_id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
});

module.exports = router;