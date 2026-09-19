const mongoose = require('mongoose');

/**
 * Koneksi MongoDB yang aman untuk lingkungan serverless (Vercel).
 *
 * Setiap invocation bisa memakai ulang proses Node yang sama, jadi koneksi
 * disimpan pada objek global. Tanpa ini, setiap request akan membuka koneksi
 * baru dan dengan cepat menghabiskan jatah koneksi di MongoDB Atlas.
 */
const cache = global.__kilatotpMongoose || (global.__kilatotpMongoose = { conn: null, promise: null });

const connectDB = async () => {
    if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI belum diatur. Salin .env.example menjadi .env terlebih dahulu.');
    }

    if (!cache.promise) {
        mongoose.set('strictQuery', true);
        cache.promise = mongoose.connect(uri, {
            serverSelectionTimeoutMS: 15000,
            // Kolam koneksi kecil: satu instance serverless hanya melayani
            // sedikit request sekaligus, sedangkan instance-nya bisa banyak.
            maxPoolSize: 10,
            minPoolSize: 0
        }).then((conn) => {
            console.log(`MongoDB terhubung: ${conn.connection.host}`);
            return conn;
        }).catch((error) => {
            // Buang promise yang gagal agar percobaan berikutnya tidak memakai
            // hasil yang sudah ditolak selamanya.
            cache.promise = null;
            throw error;
        });
    }

    cache.conn = await cache.promise;
    return cache.conn;
};

module.exports = connectDB;
