const axios = require('axios');
const { sendTelegramNotif } = require('../utils/telegramBot');
const Setting = require('../models/Setting');
const User = require('../models/User');
const Order = require('../models/Order');

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

const getMargin = async () => {
    const setting = await Setting.findOne();
    return setting ? setting.marginProfit : 0;
};

const formatRupiah = (angka) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
};

exports.getServices = async (req, res) => {
    try {
        const response = await axios(getAxiosConfig('/v2/services'));
        res.status(200).json(response.data);
    } catch (error) {
        console.error("[SERVICES ERROR]", error.response ? error.response.data : error.message);
        res.status(500).json(error.response ? error.response.data : { success: false, error: { message: error.message } });
    }
};

exports.getCountries = async (req, res) => {
    try {
        const { service_id } = req.query;
        const response = await axios(getAxiosConfig('/v2/countries', { service_id }));
        
        if (response.data && response.data.success) {
            const margin = await getMargin();
            response.data.data = response.data.data.map(country => {
                if (country.pricelist) {
                    country.pricelist = country.pricelist.map(priceItem => {
                        const originalPrice = priceItem.price;
                        const sellingPrice = Math.ceil(originalPrice + (originalPrice * margin / 100));
                        priceItem.price = sellingPrice;
                        priceItem.price_format = formatRupiah(sellingPrice);
                        return priceItem;
                    });
                }
                return country;
            });
        }
        res.status(200).json(response.data);
    } catch (error) {
        console.error("[COUNTRIES ERROR]", error.response ? error.response.data : error.message);
        res.status(500).json(error.response ? error.response.data : { success: false, error: { message: error.message } });
    }
};

exports.getOperators = async (req, res) => {
    try {
        const { country, provider_id } = req.query;
        const response = await axios(getAxiosConfig('/v2/operators', { country, provider_id }));
        res.status(200).json(response.data);
    } catch (error) {
        console.error("[OPERATORS ERROR]", error.response ? error.response.data : error.message);
        res.status(500).json(error.response ? error.response.data : { success: false, error: { message: error.message } });
    }
};

exports.orderNumber = async (req, res) => {
    try {
        const { number_id, provider_id, operator_id = 1 } = req.query;
        const userId = req.user.id || req.user._id;

        console.log(`[ORDER REQUEST] Mencoba pesan nomor: number_id=${number_id}, provider_id=${provider_id}, operator_id=${operator_id}`);

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        const response = await axios(getAxiosConfig('/v2/orders', { number_id, provider_id, operator_id }));
        console.log(`[ORDER API RESPONSE]`, response.data);
        
        if (response.data && response.data.success) {
            const data = response.data.data;
            const originalPrice = data.price;
            const margin = await getMargin();
            const sellingPrice = Math.ceil(originalPrice + (originalPrice * margin / 100));

            if (user.balance < sellingPrice) {
                console.warn(`[ORDER FAILED] Saldo user tidak cukup. Saldo: ${user.balance}, Harga: ${sellingPrice}`);
                await axios(getAxiosConfig('/v1/orders/set_status', { order_id: data.order_id, status: 'cancel' }));
                return res.status(400).json({ success: false, message: 'Saldo KilatOTP Anda tidak mencukupi.' });
            }

            user.balance -= sellingPrice;
            await user.save();

            await Order.create({
                user: userId,
                orderId: data.order_id,
                phoneNumber: data.phone_number,
                service: data.service,
                country: data.country,
                price: sellingPrice,
                status: 'received',
                createdAtTimestamp: Date.now()
            });

            data.price = sellingPrice;
            data.price_formated = formatRupiah(sellingPrice);

            const profit = sellingPrice - originalPrice;
            const notifMessage = `<b>Pesanan NOKOS Baru!</b>\n\nUser: @${user.username}\nID: <code>${data.order_id}</code>\nLayanan: ${data.service}\nNegara: ${data.country}\nHarga Jual: Rp${sellingPrice}\nProfit: Rp${profit}\nNomor: <code>${data.phone_number}</code>`;
            await sendTelegramNotif(notifMessage);
        }

        res.status(200).json(response.data);
    } catch (error) {
        console.error("[ORDER ERROR MENTAH]", error.response ? error.response.data : error.message);
        res.status(500).json(error.response ? error.response.data : { success: false, error: { message: error.message } });
    }
};

exports.checkOrder = async (req, res) => {
    try {
        const { order_id } = req.query;
        const response = await axios(getAxiosConfig('/v1/orders/get_status', { order_id }));
        res.status(200).json(response.data);
    } catch (error) {
        console.error("[CHECK ORDER ERROR]", error.response ? error.response.data : error.message);
        res.status(500).json(error.response ? error.response.data : { success: false, error: { message: error.message } });
    }
};

exports.setOrderStatus = async (req, res) => {
    try {
        const { order_id, status } = req.query;
        const userId = req.user.id || req.user._id;

        console.log(`[SET STATUS] Order ID: ${order_id}, Status baru: ${status}`);

        if (status === 'cancel') {
            const order = await Order.findOne({ orderId: order_id, user: userId });
            if (!order) {
                return res.status(404).json({ success: false, message: 'Riwayat pesanan tidak ditemukan.' });
            }

            const currentTime = Date.now();
            const timeDifferenceInMinutes = (currentTime - order.createdAtTimestamp) / (1000 * 60);

            if (timeDifferenceInMinutes < 2) {
                const sisaDetik = Math.ceil((2 - timeDifferenceInMinutes) * 60);
                return res.status(400).json({ 
                    success: false, 
                    message: `Harap tunggu ${sisaDetik} detik lagi (jeda minimal 2 menit).` 
                });
            }

            const response = await axios(getAxiosConfig('/v1/orders/set_status', { order_id, status }));

            if (response.data && response.data.success) {
                if (order.status !== 'canceled') {
                    const user = await User.findById(userId);
                    user.balance += order.price;
                    await user.save();
                    order.status = 'canceled';
                    await order.save();
                    console.log(`[ORDER CANCELLED] Saldo user direfund sebesar Rp${order.price}`);
                }
            }
            return res.status(200).json(response.data);
        }

        const response = await axios(getAxiosConfig('/v1/orders/set_status', { order_id, status }));
        await Order.findOneAndUpdate({ orderId: order_id }, { status: status === 'done' ? 'completed' : status });
        res.status(200).json(response.data);
    } catch (error) {
        console.error("[SET STATUS ERROR]", error.response ? error.response.data : error.message);
        res.status(500).json(error.response ? error.response.data : { success: false, error: { message: error.message } });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user.id || req.user._id }).sort({ createdAtTimestamp: -1 });
        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        console.error("[ORDER HISTORY ERROR]", error.message);
        res.status(500).json({ success: false, message: "Gagal memuat riwayat pesanan." });
    }
};