const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    marginProfit: {
        type: Number,
        default: 0
    },
    announcement: {
        type: String,
        default: 'Selamat datang di KilatOTP!'
    }
}, {
    timestamps: true
});

const Setting = mongoose.model('Setting', settingSchema);
module.exports = Setting;