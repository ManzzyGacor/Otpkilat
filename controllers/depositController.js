const axios = require('axios');
const User = require('../models/User'); // Model User untuk update saldo
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
        
        if (version === 'v2') {
            endpoint = '/v2/deposit/create';
        }

        const response = await axios(getAxiosConfig(endpoint, { amount, payment_id }));
        
        if (response.data && response.data.success) {
            const data = response.data.data;
            const nominal = data.amount || data.total;
            const notifMessage = `<b>Permintaan Deposit Baru!</b>\n\nID: <code>${data.id}</code>\nMetode: ${data.method || payment_id}\nNominal: Rp${nominal}`;
            await sendTelegramNotif(notifMessage);
        }

        res.status(200).json(response.data);
    } catch (error) {
        res.status(500).json(error.response ? error.response.data : { success: false, error: { message: error.message } });
    }
};

exports.checkDeposit = async (req, res) => {
    try {
        const { deposit_id, version } = req.query;
        let endpoint = '/v1/deposit/get_status';
        
        if (version === 'v2') {
            endpoint = '/v2/deposit/get_status';
        }

        const response = await axios(getAxiosConfig(endpoint, { deposit_id }));
        
        // Logika pengecekan dan penambahan saldo otomatis ke database lokal
        if (response.data && response.data.success) {
            const depositData = response.data.data;
            
            // Sesuaikan kondisi status sukses dari API RumahOTP (misal: 'success', 'paid', atau 'completed')
            if (depositData.status === 'success' || depositData.status === 'paid' || depositData.status === 'completed') {
                const userId = req.user._id; // Diambil dari middleware auth JWT
                const nominalDeposit = Number(depositData.amount || depositData.total || 0);

                if (nominalDeposit > 0) {
                    // Cek apakah user sudah pernah ditambahkan saldonya untuk deposit ID ini 
                    // (Bisa dikembangkan dengan menyimpan riwayat deposit di database agar tidak double-claim)
                    
                    await User.findByIdAndUpdate(userId, {
                        $inc: { balance: nominalDeposit }
                    });

                    await sendTelegramNotif(`<b>Deposit Berhasil!</b>\n\nID: <code>${deposit_id}</code>\nSaldo sebesar Rp${nominalDeposit} telah ditambahkan ke akun user.`);
                }
            }
        }

        res.status(200).json(response.data);
    } catch (error) {
        res.status(500).json(error.response ? error.response.data : { success: false, error: { message: error.message } });
    }
};

exports.getHistory = async (req, res) => {
    try {
        // Mengambil data deposit dari database lokal berdasarkan ID user
        const deposits = await Deposit.find({ user: req.user._id }).sort({ created_at: -1 });
        
        res.status(200).json({ 
            success: true, 
            data: deposits 
        });
    } catch (error) {
        console.error("Error getHistory Deposit:", error);
        res.status(500).json({ 
            success: false, 
            message: "Gagal memuat riwayat deposit." 
        });
    }
};

exports.cancelDeposit = async (req, res) => {
    try {
        const { deposit_id } = req.query;
        const response = await axios(getAxiosConfig('/v1/deposit/cancel', { deposit_id }));
        res.status(200).json(response.data);
    } catch (error) {
        res.status(500).json(error.response ? error.response.data : { success: false, error: { message: error.message } });
    }
};