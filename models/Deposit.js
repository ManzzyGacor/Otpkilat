const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    deposit_id: {
        type: String,
        required: true,
        unique: true
    },
    depositId: {
        type: String // Dummy opsional untuk menghentikan error E11000 index lama
    },
    amount: {
        type: Number,
        required: true
    },
    method: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'canceled', 'failed'],
        default: 'pending'
    }
}, {
    timestamps: true
});

const Deposit = mongoose.model('Deposit', depositSchema);
module.exports = Deposit;