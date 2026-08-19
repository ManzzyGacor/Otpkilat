const Deposit = require('../models/Deposit');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Setting = require('../models/Setting');
const axios = require('axios');
const mongoose = require('mongoose');
const crypto = require('crypto');

const apiClient = axios.create({
  baseURL: process.env.RUMAHOTP_BASE_URL,
  headers: {
    'x-apikey': process.env.RUMAHOTP_API_KEY,
    'Accept': 'application/json'
  },
  timeout: 10000
});

exports.createDeposit = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.session.userId;

    const parsedAmount = Number(amount);
    const settings = await Setting.findOne();
    const minDeposit = settings ? settings.minimumDeposit : 10000;
    const maxDeposit = settings ? settings.maximumDeposit : 1000000;

    if (isNaN(parsedAmount) || parsedAmount < minDeposit || parsedAmount > maxDeposit) {
      return res.status(400).json({ 
        success: false, 
        error: { message: `Nominal deposit harus antara Rp${minDeposit} hingga Rp${maxDeposit}.` } 
      });
    }

    const providerResponse = await apiClient.get(`/v2/deposit/create?amount=${parsedAmount}&payment_id=qris`);
    const data = providerResponse.data;

    if (!data.success) {
      return res.status(400).json({ success: false, error: { message: 'Gagal membuat deposit di provider.' } });
    }

    const depositData = data.data;
    
    const newDeposit = new Deposit({
      depositId: depositData.id,
      userId: userId,
      amount: parsedAmount,
      fee: depositData.fee || 0,
      total: depositData.total || parsedAmount,
      diterima: depositData.diterima || parsedAmount,
      method: 'qris',
      qrString: depositData.qr_string,
      qrImage: depositData.qr_image,
      status: 'pending',
      expiredAt: new Date(depositData.expired_at ? depositData.expired_at * 1000 : Date.now() + 3600000)
    });

    await newDeposit.save();

    return res.status(201).json({ success: true, data: newDeposit });
  } catch (error) {
    console.error('Create Deposit Error:', error.response?.data || error.message);
    return res.status(500).json({ success: false, error: { message: 'Terjadi kesalahan saat memproses deposit.' } });
  }
};

exports.getDepositStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { depositId } = req.params;
    const userId = req.session.userId;

    const deposit = await Deposit.findOne({ depositId, userId }).session(session);
    if (!deposit) {
      throw new Error('Deposit tidak ditemukan atau Anda tidak memiliki akses.');
    }

    if (deposit.status !== 'pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ success: true, data: deposit });
    }

    const providerResponse = await apiClient.get(`/v2/deposit/get_status?deposit_id=${depositId}`);
    const data = providerResponse.data;

    if (!data.success) {
      throw new Error('Gagal mengecek status deposit ke provider.');
    }

    const providerStatus = data.data.status; 
    
    if (providerStatus === 'success') {
      deposit.status = 'success';
      
      const user = await User.findById(userId).session(session);
      const balanceBefore = user.balance;
      const balanceAfter = balanceBefore + deposit.diterima;
      
      user.balance = balanceAfter;
      await user.save({ session });

      const transaction = new Transaction({
        userId: user._id,
        type: 'deposit',
        amount: deposit.diterima,
        balanceBefore,
        balanceAfter,
        referenceId: deposit.depositId,
        description: `Deposit QRIS #${deposit.depositId}`,
        status: 'success'
      });
      await transaction.save({ session });

    } else if (providerStatus === 'cancel' || providerStatus === 'expired' || new Date() > deposit.expiredAt) {
      deposit.status = 'cancel';
    }

    await deposit.save({ session });
    
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ success: true, data: deposit });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Check Deposit Status Error:', error.response?.data || error.message);
    return res.status(400).json({ success: false, error: { message: error.message || 'Terjadi kesalahan sistem.' } });
  }
};

exports.cancelDeposit = async (req, res) => {
  try {
    const { depositId } = req.params;
    const userId = req.session.userId;

    const deposit = await Deposit.findOne({ depositId, userId });
    if (!deposit) {
      return res.status(404).json({ success: false, error: { message: 'Deposit tidak ditemukan.' } });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({ success: false, error: { message: 'Hanya deposit berstatus pending yang bisa dibatalkan.' } });
    }

    const providerResponse = await apiClient.get(`/v1/deposit/cancel?deposit_id=${depositId}`);
    
    deposit.status = 'cancel';
    await deposit.save();

    return res.status(200).json({ success: true, data: { message: 'Deposit berhasil dibatalkan.', deposit } });
  } catch (error) {
    console.error('Cancel Deposit Error:', error.response?.data || error.message);
    return res.status(500).json({ success: false, error: { message: 'Gagal membatalkan deposit.' } });
  }
};