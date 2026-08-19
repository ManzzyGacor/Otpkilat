require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');
const adminMiddleware = require('./middleware/admin');

// Inisialisasi Database
connectDB();

const app = express();

// Security & Optimization Middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' })); // Diperbesar sedikit untuk support upload avatar base64
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session Management
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_fallback_key_123',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 hari
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// Setup EJS View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Gunakan Express Layouts
app.use(expressLayouts);
app.set('layout', 'layouts/main'); // Mengarahkan ke views/layouts/main.ejs

// Set Folder Statis (CSS, JS, Images)
app.use(express.static(path.join(__dirname, '../public')));

// Set Global Variable untuk EJS Views
app.use(async (req, res, next) => {
  res.locals.user = req.session.userId ? { id: req.session.userId, role: req.session.role } : null;
  res.locals.path = req.path;
  
  // Ambil saldo dan nama secara dinamis jika user sudah login untuk ditampilkan di layout utama
  if (req.session.userId) {
    try {
      const User = require('./models/User');
      const currentUser = await User.findById(req.session.userId).select('balance fullName avatar');
      if (currentUser) {
        res.locals.balance = currentUser.balance;
        res.locals.fullName = currentUser.fullName;
        res.locals.userAvatar = currentUser.avatar;
      }
    } catch (e) {
      console.error('Global user context error:', e);
    }
  }
  next();
});

// ==========================================
// Pendaftaran Routes API & Backend Services
// ==========================================
const authRoutes = require('./routes/auth');
const providerRoutes = require('./routes/provider');
const orderRoutes = require('./routes/order');
const depositRoutes = require('./routes/deposit');
const historyRoutes = require('./routes/history');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/provider', providerRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/profile', profileRoutes);
app.use('/admin', adminRoutes);

// ==========================================
// Pendaftaran Routes Frontend (Views EJS)
// ==========================================

// Landing Page Publik
app.get('/', async (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  
  // Ambil pengumuman aktif untuk landing page
  try {
    const Announcement = require('./models/Announcement');
    const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 }).limit(3);
    res.render('layouts/landing', { title: 'Beranda', announcements });
  } catch (e) {
    res.render('layouts/landing', { title: 'Beranda', announcements: [] });
  }
});

app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('auth/login');
});

app.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('auth/register');
});

// Dashboard User (Menggunakan Layout Utama)
app.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const Announcement = require('./models/Announcement');
    const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 });
    
    // Render menggunakan wrapper layouts/main
    res.render('dashboard/index', { 
      title: 'Dashboard',
      announcements,
      layout: 'layouts/main' 
    });
  } catch (e) {
    res.render('dashboard/index', { title: 'Dashboard', announcements: [] });
  }
});

// Rute Halaman Utama Lainnya yang dibungkus Layout Main
app.use('/order', orderRoutes);
app.use('/deposit', depositRoutes);
app.use('/history', historyRoutes);
app.use('/profile', profileRoutes);

// Middleware penutup untuk 404
app.use((req, res, next) => {
  res.status(404).render('404', { url: req.url });
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;