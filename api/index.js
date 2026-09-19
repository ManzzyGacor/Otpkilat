/**
 * Titik masuk Vercel.
 *
 * Vercel memanggil berkas ini sebagai serverless function, jadi di sini tidak
 * boleh ada `app.listen()`. Koneksi database dibuka saat request pertama dan
 * dipakai ulang oleh invocation berikutnya (lihat config/db.js).
 */
const app = require('../app');
const { assertJwtSecret } = require('../utils/settings');

// Gagal cepat dengan pesan jelas bila rahasia sesi belum diatur di
// Project Settings > Environment Variables.
try {
    assertJwtSecret();
} catch (error) {
    console.error('[KONFIGURASI]', error.message);
    module.exports = (req, res) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
            success: false,
            message: 'SESSION_SECRET belum diatur di Environment Variables Vercel.'
        }));
    };
    return;
}

module.exports = app;
