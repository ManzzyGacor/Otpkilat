const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
require('dotenv').config();

// Import Routes
const authRoutes = require('./routes/authRoutes');
const otpRoutes = require('./routes/otpRoutes');
const depositRoutes = require('./routes/depositRoutes');
const adminRoutes = require('./routes/adminRoutes');
const announcementRoutes = require('./routes/announcementRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Menyembunyikan ekstensi .html di URL (misal: /login akan merender login.html)
app.use(express.static('public', { extensions: ['html'] }));

// Connect Database
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/admin', adminRoutes);
app.use('/api/announcements', announcementRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});