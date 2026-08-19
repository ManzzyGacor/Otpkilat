const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const updateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10,
  message: { success: false, error: { message: 'Terlalu sering memperbarui profil.' } }
});

router.use(auth);

router.get('/', profileController.renderProfile);
router.post('/update', updateLimiter, profileController.updateProfile);
router.post('/avatar', updateLimiter, profileController.updateAvatar);
router.post('/password', updateLimiter, profileController.updatePassword);

module.exports = router;