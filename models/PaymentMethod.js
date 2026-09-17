const mongoose = require('mongoose');

/**
 * Metode pembayaran top up saldo.
 * Dulu metode dan kredensialnya di-hardcode di frontend + .env.
 * Sekarang seluruhnya dikelola admin lewat database.
 *
 * mode:
 *  - 'gateway' : tagihan dibuat otomatis lewat API provider (RumahOTP)
 *  - 'manual'  : user transfer manual lalu admin melakukan konfirmasi
 */
const paymentMethodSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    mode: { type: String, enum: ['gateway', 'manual'], default: 'manual' },

    // Khusus mode gateway
    providerPaymentId: { type: String, default: '' },
    providerVersion: { type: String, enum: ['v1', 'v2'], default: 'v1' },

    // Khusus mode manual
    accountName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    qrImageUrl: { type: String, default: '' },
    instructions: { type: String, default: '' },

    // Tampilan & biaya
    logoUrl: { type: String, default: '' },
    feeFlat: { type: Number, default: 0 },
    feePercent: { type: Number, default: 0 },
    minAmount: { type: Number, default: 2000 },
    maxAmount: { type: Number, default: 1000000 },

    // Kode unik ditambahkan ke nominal transfer manual agar mudah dicocokkan
    useUniqueCode: { type: Boolean, default: true },
    uniqueCodeMax: { type: Number, default: 499 },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

paymentMethodSchema.methods.toPublic = function () {
    return {
        id: this._id,
        code: this.code,
        name: this.name,
        mode: this.mode,
        logoUrl: this.logoUrl,
        feeFlat: this.feeFlat,
        feePercent: this.feePercent,
        minAmount: this.minAmount,
        maxAmount: this.maxAmount,
        instructions: this.instructions,
        accountName: this.accountName,
        accountNumber: this.accountNumber,
        qrImageUrl: this.qrImageUrl
    };
};

const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);
module.exports = PaymentMethod;
