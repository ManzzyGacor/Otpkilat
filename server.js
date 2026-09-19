require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');
const { seedDefaults } = require('./config/seed');
const { assertJwtSecret } = require('./utils/settings');

const PORT = process.env.PORT || 3000;

/**
 * Titik masuk untuk server biasa (VPS, Railway, `npm start` di komputer).
 * Untuk Vercel dipakai `api/index.js`, yang memuat `app.js` tanpa listen.
 */
const start = async () => {
    // Berhenti sekarang juga bila rahasia sesi belum diatur, bukan setelah
    // pengguna pertama terlanjur login dengan token yang bisa dipalsukan.
    assertJwtSecret();
    await connectDB();
    await seedDefaults();
    app.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));
};

start().catch((error) => {
    console.error('Gagal menjalankan server:', error.message);
    process.exit(1);
});
