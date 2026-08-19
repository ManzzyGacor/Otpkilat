const Order = require('../models/Order');
const Transaction = require('../models/Transaction');

exports.renderHistory = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Mengambil 50 data terakhir untuk masing-masing histori
    const orders = await Order.find({ userId }).sort({ createdAt: -1 }).limit(50);
    const transactions = await Transaction.find({ userId }).sort({ createdAt: -1 }).limit(50);
    
    res.render('history/index', { 
      title: 'Riwayat Transaksi', 
      orders, 
      transactions 
    });
  } catch (error) {
    console.error('History Render Error:', error);
    res.status(500).render('500', { error: 'Gagal memuat halaman riwayat.' });
  }
};