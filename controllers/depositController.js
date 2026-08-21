const axios = require('axios');
const User = require('../models/User');
const Deposit = require('../models/Deposit');
const { sendTelegramNotif } = require('../utils/telegramBot');

const getAxiosConfig = (endpoint, params = {}) => {
    return {
        method: 'GET',
        url: `${process.env.RUMAHOTP_BASE_URL}${endpoint}`,
        headers: {
            'x-apikey': process.env.RUMAHOTP_API_KEY,
            'Accept': 'application/json'
        },
        params: params
    };
};

exports.createDeposit = async (req, res) => {
    try {
        const { amount, payment_id, version } = req.query;
        let endpoint = '/v1/deposit/create';
        if (version === 'v2') endpoint = '/v2/deposit/create';

        console.log(`[DEPOSIT CREATE] Meminta tagihan ke ${endpoint} dengan nominal ${amount}, metode ${payment_id}`);

        const response = await axios(getAxiosConfig(endpoint, { amount, payment_id }));
        console.log(`[DEPOSIT CREATE RES]`, response.data);
        
        if (response.data && response.data.success) {
            const data = response.data.data;
            const nominal = data.amount || data.total;
            const transId = data.id || data.deposit_id;
            
            // Simpan riwayat deposit dengan KEDUA format penamaan
            await Deposit.create({
                user: req.user.id || req.user._id,
                deposit_id: transId, // Wajib untuk Skema Mongoose
                depositId: transId,  // Wajib untuk mengakali Index Database MongoDB lama
                amount: nominal,
                method: data.method || payment_id,
                status: 'pending'
            });

            const notifMessage = `<b>Permintaan Deposit Baru!</b>\n\nID: <code>${transId}</code>\nMetode: ${data.method || payment_id}\nNominal: Rp${nominal}`;
            await sendTelegramNotif(notifMessage);
        }

        res.status(200).json(response.data);
    } catch (error) {
        console.error("[DEPOSIT CREATE ERROR]", error.response ? error.response.data : error.message);
        res.status(500).json(error.response ? error.response.data : { success: false, error: { message: error.message } });
    }
};

exports.checkDeposit = async (req, res) => {
    try {
        const { deposit_id, version } = req.query;
        let endpoint = '/v1/deposit/get_status';
        if (version === 'v2') endpoint = '/v2/deposit/get_status';

        console.log(`[DEPOSIT CHECK] Memeriksa status deposit ID: ${deposit_id}`);

        const response = await axios(getAxiosConfig(endpoint, { deposit_id }));
        console.log(`[DEPOSIT CHECK RES]`, response.data);
        
        if (response.data && response.data.success) {
            const depositData = response.data.data;
            const statusApi = depositData.status ? depositData.status.toLowerCase() : '';
            
            if (statusApi === 'success' || statusApi === 'paid' || statusApi === 'completed') {
                const userId = req.user.id || req.user._id;
                const nominalDeposit = Number(depositData.amount || depositData.total || 0);

                if (nominalDeposit > 0) {
                    // Cari berdasarkan deposit_id
                    let localDeposit = await Deposit.findOne({ deposit_id: deposit_id });

                    if (localDeposit && localDeposit.status !== 'success') {
                        await User.findByIdAndUpdate(userId, {
                            $inc: { balance: nominalDeposit }
                        });

                        localDeposit.status = 'success';
                        await localDeposit.save();

                        console.log(`[DEPOSIT SUCCESS] Saldo user ${userId} ditambah Rp${nominalDeposit}`);
                        await sendTelegramNotif(`<b>Deposit Berhasil!</b>\n\nID: <code>${deposit_id}</code>\nSaldo sebesar Rp${nominalDeposit} telah ditambahkan ke akun user.`);
                    }
                }
            }
        }

        res.status(200).json(response.data);
    } catch (error) {
        console.error("[DEPOSIT CHECK ERROR]", error.response ? error.response.data : error.message);
        res.status(500).json(error.response ? error.response.data : { success: false, error: { message: error.message } });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;
        const deposits = await Deposit.find({ user: userId }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: deposits });
    } catch (error) {
        console.error("[DEPOSIT HISTORY ERROR]", error.message);
        res.status(500).json({ success: false, message: "Gagal memuat riwayat deposit." });
    }
};

exports.cancelDeposit = async (req, res) => {
    try {
        const { deposit_id } = req.query;
        const response = await axios(getAxiosConfig('/v1/deposit/cancel', { deposit_id }));
        
        if (response.data && response.data.success) {
            // Update berdasarkan deposit_id
            await Deposit.findOneAndUpdate({ deposit_id: deposit_id }, { status: 'canceled' });
        }

        res.status(200).json(response.data);
    } catch (error) {
        console.error("[DEPOSIT CANCEL ERROR]", error.response ? error.response.data : error.message);
        res.status(500).json(error.response ? error.response.data : { success: false, error: { message: error.message } });
    }
};