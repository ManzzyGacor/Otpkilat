const app = require('./app');
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`[KilatOTP] Server berjalan di mode ${process.env.NODE_ENV || 'development'} pada port ${PORT}`);
});

// Menangani Unhandled Promise Rejections (Mencegah server crash secara diam-diam)
process.on('unhandledRejection', (err, promise) => {
  console.error(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});