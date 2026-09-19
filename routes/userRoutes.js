const express = require('express');
const multer = require('multer');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 }
});

router.use(verifyToken);

router.get('/me', userController.getProfile);
router.get('/summary', userController.getSummary);
router.put('/profile', userController.updateProfile);
router.put('/update-name', userController.updateName); // alias lama
router.post('/upload-avatar', upload.single('avatar'), userController.uploadAvatar);

module.exports = router;
