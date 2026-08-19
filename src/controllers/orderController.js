const Order = require('../models/Order');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const pricingService = require('../services/pricingService');
const axios = require('axios');
const mongoose = require('mongoose');
const crypto = require('crypto');

const apiClient = axios.create({
  baseURL: process.env.RUMAHOTP_BASE_URL,
  headers: {
    'x-apikey': process.env.RUMAHOTP_API_KEY,
    'Accept': 'application/json'
  },
  timeout: 15000
});

exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { numberId, providerId, operatorId, serviceName, countryName } = req.body;
    const userId = req.session.userId;

    const user = await User.findById(userId).session(session);
    if (!user) throw new Error('Pengguna tidak valid.');

    const checkPriceResponse = await apiClient.get(`/v2/countries?service_id=${serviceName}`);
    const checkPriceData = checkPriceResponse.data;
    if (!checkPriceData.success) throw new Error('Gagal memvalidasi harga dari provider.');

    const countryData = checkPriceData.data.find(c => String(c.number_id) === String(numberId));
    if (!countryData) throw new Error('Data negara tidak ditemukan.');
    
    const providerPriceInfo = countryData.pricelist.find(p => String(p.provider_id) === String(providerId));
    if (!providerPriceInfo) throw new Error('Data provider tidak ditemukan pada negara ini.');

    const providerPrice = providerPriceInfo.price;
    const pricing = await pricingService.calculatePricing(providerPrice);

    if (user.balance < pricing.sellingPrice) {
      throw new Error('Saldo tidak mencukupi untuk melakukan pesanan ini.');
    }

    const balanceBeforeDeduction = user.balance;
    const balanceAfterDeduction = balanceBeforeDeduction - pricing.sellingPrice;
    user.balance = balanceAfterDeduction;
    await user.save({ session });

    const orderRef = `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const deductionTx = new Transaction({
      userId: user._id,
      type: 'order',
      amount: -pricing.sellingPrice,
      balanceBefore: balanceBeforeDeduction,
      balanceAfter: balanceAfterDeduction,
      referenceId: orderRef,
      description: `Pembelian NOKOS ${serviceName} - ${countryName}`,
      status: 'pending' 
    });
    await deductionTx.save({ session });

    let providerOrderResponse;
    try {
      providerOrderResponse = await apiClient.get(`/v2/orders?number_id=${numberId}&provider_id=${providerId}&operator_id=${operatorId}`);
    } catch (apiError) {
      throw new Error('Provider gagal memproses pesanan.');
    }

    if (!providerOrderResponse.data.success) {
      throw new Error(providerOrderResponse.data.error?.message || 'Provider gagal memproses pesanan.');
    }

    const orderData = providerOrderResponse.data.data;

    const newOrder = new Order({
      orderId: orderRef,
      userId: user._id,
      providerOrderId: orderData.order_id,
      phoneNumber: orderData.phone_number,
      service: orderData.service || serviceName,
      country: orderData.country || countryName,
      operator: orderData.operator || operatorId,
      providerPrice: pricing.providerPrice,
      sellingPrice: pricing.sellingPrice,
      profit: pricing.profit,
      status: 'received',
      expiredAt: new Date(orderData.expired_at)
    });

    await newOrder.save({ session });
    deductionTx.status = 'success';
    await deductionTx.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({ success: true, data: newOrder });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Create Order Error:', error.message);
    return res.status(400).json({ success: false, error: { message: error.message || 'Terjadi kesalahan saat memproses order.' } });
  }
};

exports.getOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    const order = await Order.findOne({ orderId: id, userId });
    if (!order) return res.status(404).json({ success: false, error: { message: 'Order tidak ditemukan.' } });

    if (['completed', 'canceled'].includes(order.status)) {
      return res.status(200).json({ success: true, data: order });
    }

    const providerResponse = await apiClient.get(`/v1/orders/get_status?order_id=${order.providerOrderId}`);
    const providerData = providerResponse.data;

    if (providerData.success && providerData.data) {
      const pData = providerData.data;
      
      order.status = pData.status;
      order.otpCode = pData.otp_code || order.otpCode;
      order.otpMsg = pData.otp_msg || order.otpMsg;
      
      await order.save();

      if (order.status === 'canceled') {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
          const user = await User.findById(userId).session(session);
          const balanceBefore = user.balance;
          const balanceAfter = balanceBefore + order.sellingPrice;
          
          user.balance = balanceAfter;
          await user.save({ session });

          const refundTx = new Transaction({
            userId: user._id,
            type: 'refund',
            amount: order.sellingPrice,
            balanceBefore,
            balanceAfter,
            referenceId: order.orderId,
            description: `Refund pembatalan NOKOS #${order.orderId}`,
            status: 'success'
          });
          await refundTx.save({ session });
          
          await session.commitTransaction();
          session.endSession();
        } catch (refundError) {
          await session.abortTransaction();
          session.endSession();
          console.error('Refund Error:', refundError);
        }
      }
    }

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    console.error('Get Order Status Error:', error.response?.data || error.message);
    return res.status(500).json({ success: false, error: { message: 'Gagal mendapatkan status order.' } });
  }
};

exports.setOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; 
    const userId = req.session.userId;

    const order = await Order.findOne({ orderId: id, userId });
    if (!order) return res.status(404).json({ success: false, error: { message: 'Order tidak ditemukan.' } });

    const providerResponse = await apiClient.get(`/v1/orders/set_status?order_id=${order.providerOrderId}&status=${status}`);
    const providerData = providerResponse.data;

    if (!providerData.success) {
      return res.status(400).json({ success: false, error: { message: 'Gagal mengubah status di provider.' } });
    }

    return res.status(200).json({ success: true, data: { message: 'Status order berhasil diajukan untuk diubah.' } });
  } catch (error) {
    console.error('Set Order Status Error:', error.response?.data || error.message);
    return res.status(500).json({ success: false, error: { message: 'Gagal mengubah status order.' } });
  }
};