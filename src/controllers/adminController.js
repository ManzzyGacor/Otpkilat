const User = require('../models/User');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const crypto = require('crypto');

exports.getUsers = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      query = {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const users = await User.find(query).select('-passwordHash').sort({ createdAt: -1 }).limit(100);
    
    return res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error('Admin getUsers Error:', error);
    return res.status(500).json({ success: false, error: { message: 'Gagal memuat data pengguna.' } });
  }
};

exports.adjustBalance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { userId, amount, action, description } = req.body; 
    
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('Pengguna tidak ditemukan.');
    }

    const adjustAmount = Number(amount);
    if (isNaN(adjustAmount) || adjustAmount <= 0) {
      throw new Error('Nominal adjustment tidak valid.');
    }

    const balanceBefore = user.balance;
    let balanceAfter = balanceBefore;

    if (action === 'add') {
      balanceAfter += adjustAmount;
    } else if (action === 'deduct') {
      if (balanceBefore < adjustAmount) {
        throw new Error('Saldo pengguna tidak mencukupi untuk pemotongan.');
      }
      balanceAfter -= adjustAmount;
    } else {
      throw new Error('Action tidak valid. Gunakan add atau deduct.');
    }

    user.balance = balanceAfter;
    await user.save({ session });

    const referenceId = `ADJ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    const transaction = new Transaction({
      userId: user._id,
      type: 'adjustment',
      amount: action === 'add' ? adjustAmount : -Math.abs(adjustAmount),
      balanceBefore,
      balanceAfter,
      referenceId,
      description: description || `Admin adjustment: ${action}`,
      status: 'success'
    });

    await transaction.save({ session });
    
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ 
      success: true, 
      data: { message: 'Saldo berhasil diperbarui.', currentBalance: balanceAfter } 
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Admin adjustBalance Error:', error);
    return res.status(400).json({ success: false, error: { message: error.message || 'Gagal melakukan adjustment saldo.' } });
  }
};

exports.getTransactionsLogs = async (req, res) => {
  try {
    const { type, limit = 50 } = req.query;
    let query = {};
    
    if (type) {
      query.type = type;
    }

    const logs = await Transaction.find(query)
      .populate('userId', 'username fullName email')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    return res.status(200).json({ success: true, data: logs });
  } catch (error) {
    console.error('Admin getTransactionsLogs Error:', error);
    return res.status(500).json({ success: false, error: { message: 'Gagal memuat log transaksi.' } });
  }
};