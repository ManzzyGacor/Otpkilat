const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['deposit', 'order', 'refund', 'adjustment'], required: true },
  amount: { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  referenceId: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ['success', 'failed', 'pending'], default: 'success' }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('Transaction', transactionSchema);