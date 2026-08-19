const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  providerOrderId: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  service: { type: String, required: true },
  country: { type: String, required: true },
  operator: { type: String, required: true },
  providerPrice: { type: Number, required: true },
  sellingPrice: { type: Number, required: true },
  profit: { type: Number, required: true },
  status: { type: String, enum: ['received', 'completed', 'canceled', 'expiring'], default: 'received' },
  otpCode: { type: String, default: null },
  otpMsg: { type: String, default: null },
  expiredAt: { type: Date, required: true }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('Order', orderSchema);