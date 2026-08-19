const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
  depositId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true },
  fee: { type: Number, required: true },
  total: { type: Number, required: true },
  diterima: { type: Number, required: true },
  method: { type: String, default: 'qris' },
  qrString: { type: String, required: true },
  qrImage: { type: String, required: true },
  status: { type: String, enum: ['pending', 'success', 'cancel'], default: 'pending' },
  expiredAt: { type: Date, required: true }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('Deposit', depositSchema);