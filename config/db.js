const mongoose = require('mongoose');

const connectDB = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI belum diatur. Salin .env.example menjadi .env terlebih dahulu.');
        process.exit(1);
    }

    try {
        mongoose.set('strictQuery', true);
        const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
        console.log(`MongoDB terhubung: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`Gagal terhubung ke MongoDB: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
