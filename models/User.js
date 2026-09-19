const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minlength: 3
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    // Nomor HP tidak lagi wajib: user yang mendaftar lewat Google belum tentu punya.
    // sparse:true membuat index unique mengabaikan dokumen tanpa nomor.
    phoneNumber: {
        type: String,
        default: null,
        trim: true,
        unique: true,
        sparse: true
    },
    // Password kosong untuk akun Google-only sampai user menyetel password sendiri.
    password: {
        type: String,
        default: null
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    avatarUrl: {
        type: String,
        default: 'https://ui-avatars.com/api/?name=User&background=6366f1&color=fff'
    },
    googleId: {
        type: String,
        default: null,
        unique: true,
        sparse: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    notes: {
        type: String,
        default: ''
    },
    lastLoginAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

userSchema.methods.toPublic = function () {
    return {
        id: this._id,
        fullName: this.fullName,
        username: this.username,
        email: this.email,
        phoneNumber: this.phoneNumber,
        role: this.role,
        balance: this.balance,
        avatarUrl: this.avatarUrl,
        isActive: this.isActive,
        hasPassword: Boolean(this.password),
        googleLinked: Boolean(this.googleId),
        createdAt: this.createdAt
    };
};

const User = mongoose.model('User', userSchema);
module.exports = User;
