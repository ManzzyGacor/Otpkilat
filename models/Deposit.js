const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    deposit_id: {
        type: String,
        required: true,
        unique: true
    },
    // Field lama, dipertahankan agar index unik warisan di MongoDB tidak bentrok.
    depositId: {
        type: String,
        default: null,
        sparse: true
    },
    // Nominal yang diminta user (saldo yang akan diterima)
    amount: {
        type: Number,
        required: true
    },
    // Nominal yang harus dibayar (termasuk fee + kode unik)
    payAmount: {
        type: Number,
        default: 0
    },
    fee: {
        type: Number,
        default: 0
    },
    uniqueCode: {
        type: Number,
        default: 0
    },
    method: {
        type: String,
        required: true
    },
    methodName: {
        type: String,
        default: ''
    },
    mode: {
        type: String,
        enum: ['gateway', 'manual'],
        default: 'manual'
    },
    qrImageUrl: {
        type: String,
        default: ''
    },
    paymentInfo: {
        type: Object,
        default: {}
    },
    proofUrl: {
        type: String,
        default: ''
    },
    note: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'canceled', 'failed', 'rejected'],
        default: 'pending',
        index: true
    },
    creditedAt: {
        type: Date,
        default: null
    },
    handledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    expiresAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

const Deposit = mongoose.model('Deposit', depositSchema);
module.exports = Deposit;
