const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    phoneNumber: {
        type: String,
        required: true
    },
    service: {
        type: String,
        required: true
    },
    serviceImg: {
        type: String, // Menampung URL gambar logo layanan
        default: 'https://assets.cindigital.id/apps/other.png'
    },
    country: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    otpCode: {
        type: String, // Menampung kode OTP yang berhasil diterima
        default: null
    },
    status: {
        type: String,
        enum: ['received', 'completed', 'canceled', 'expiring', 'pending'],
        default: 'received'
    },
    createdAtTimestamp: {
        type: Number,
        required: true
    }
}, {
    timestamps: true
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;