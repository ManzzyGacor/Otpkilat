const User = require('../models/User');
const Order = require('../models/Order');
const { getMargin } = require('../utils/settings');
const { providerRequest, providerError, formatRupiah } = require('../utils/provider');
const { sendTelegramNotif } = require('../utils/telegramBot');

// Nomor otomatis kedaluwarsa dan saldo dikembalikan setelah batas waktu ini.
const ORDER_TTL_MINUTES = 20;
const CANCEL_COOLDOWN_MINUTES = 2;

const applyMargin = (price, margin) => Math.ceil(Number(price) + (Number(price) * margin) / 100);

/**
 * Kembalikan saldo untuk sebuah pesanan, sekali saja.
 * Status diubah lewat satu operasi atomik; bila dokumen sudah tidak berstatus
 * aktif berarti refund sudah pernah dilakukan dan saldo tidak ditambah lagi.
 */
const refundOrder = async (orderId, reason = 'canceled') => {
    const order = await Order.findOneAndUpdate(
        { _id: orderId, status: { $in: ['received', 'pending'] } },
        { $set: { status: reason } },
        { new: true }
    );
    if (!order) return null;

    await User.findByIdAndUpdate(order.user, { $inc: { balance: order.price } });
    return order;
};

/** Kedaluwarsakan pesanan yang melewati batas waktu, lalu kembalikan saldonya. */
const expireStaleOrders = async (userId) => {
    const threshold = Date.now() - ORDER_TTL_MINUTES * 60 * 1000;
    const stale = await Order.find({
        user: userId,
        status: { $in: ['received', 'pending'] },
        createdAtTimestamp: { $lt: threshold }
    }).select('_id');

    for (const order of stale) {
        // Berurutan dan atomik agar tidak terjadi refund ganda.
        await refundOrder(order._id, 'expiring');
    }
    return stale.length;
};

exports.getServices = async (req, res) => {
    try {
        const data = await providerRequest('/v2/services');
        return res.status(200).json(data);
    } catch (error) {
        return providerError(res, error, 'Gagal memuat daftar layanan.');
    }
};

exports.getCountries = async (req, res) => {
    try {
        const { service_id: serviceId } = req.query;
        if (!serviceId) return res.status(400).json({ success: false, message: 'Layanan wajib dipilih.' });

        const data = await providerRequest('/v2/countries', { service_id: serviceId });

        if (data && data.success && Array.isArray(data.data)) {
            const margin = await getMargin();
            data.data = data.data.map((country) => {
                if (Array.isArray(country.pricelist)) {
                    country.pricelist = country.pricelist.map((item) => {
                        const sellingPrice = applyMargin(item.price, margin);
                        return { ...item, price: sellingPrice, price_format: formatRupiah(sellingPrice) };
                    });
                }
                return country;
            });
        }
        return res.status(200).json(data);
    } catch (error) {
        return providerError(res, error, 'Gagal memuat daftar negara.');
    }
};

exports.getOperators = async (req, res) => {
    try {
        const { country, provider_id: providerId } = req.query;
        const data = await providerRequest('/v2/operators', { country, provider_id: providerId });
        return res.status(200).json(data);
    } catch (error) {
        return providerError(res, error, 'Gagal memuat daftar operator.');
    }
};

/**
 * Pesan nomor baru.
 * Saldo dipotong dengan operasi atomik bersyarat (balance >= harga) sehingga
 * dua permintaan bersamaan tidak bisa membuat saldo menjadi minus.
 */
exports.orderNumber = async (req, res) => {
    try {
        const { number_id: numberId, provider_id: providerId, operator_id: operatorId = 1 } = req.query;
        if (!numberId || !providerId) {
            return res.status(400).json({ success: false, message: 'Data pesanan tidak lengkap.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        if (user.balance <= 0) {
            return res.status(400).json({ success: false, message: 'Saldo Anda kosong. Silakan top up terlebih dahulu.' });
        }

        const response = await providerRequest('/v2/orders', {
            number_id: numberId,
            provider_id: providerId,
            operator_id: operatorId
        });

        if (!response || !response.success || !response.data) {
            const message = (response && response.message) || 'Nomor sedang tidak tersedia. Coba layanan atau negara lain.';
            return res.status(400).json({ success: false, message });
        }

        const data = response.data;
        const margin = await getMargin();
        const sellingPrice = applyMargin(data.price, margin);

        const charged = await User.findOneAndUpdate(
            { _id: user._id, balance: { $gte: sellingPrice } },
            { $inc: { balance: -sellingPrice } },
            { new: true }
        );

        if (!charged) {
            // Saldo tidak cukup: batalkan nomor di provider agar tidak terbuang.
            await providerRequest('/v1/orders/set_status', { order_id: data.order_id, status: 'cancel' }).catch(() => {});
            return res.status(400).json({
                success: false,
                message: `Saldo tidak mencukupi. Dibutuhkan ${formatRupiah(sellingPrice)}.`
            });
        }

        try {
            await Order.create({
                user: user._id,
                orderId: String(data.order_id),
                phoneNumber: data.phone_number,
                service: data.service,
                serviceImg: data.service_img || data.image || undefined,
                country: data.country,
                price: sellingPrice,
                status: 'received',
                createdAtTimestamp: Date.now()
            });
        } catch (dbError) {
            // Pencatatan gagal: kembalikan saldo agar user tidak dirugikan.
            await User.findByIdAndUpdate(user._id, { $inc: { balance: sellingPrice } });
            await providerRequest('/v1/orders/set_status', { order_id: data.order_id, status: 'cancel' }).catch(() => {});
            console.error('[ORDER SAVE ERROR]', dbError);
            return res.status(500).json({ success: false, message: 'Gagal menyimpan pesanan. Saldo Anda telah dikembalikan.' });
        }

        data.price = sellingPrice;
        data.price_formated = formatRupiah(sellingPrice);

        sendTelegramNotif(
            `<b>Pesanan Nomor Baru</b>\n\nUser: @${user.username}\nID: <code>${data.order_id}</code>\n` +
            `Layanan: ${data.service}\nNegara: ${data.country}\nHarga: ${formatRupiah(sellingPrice)}\n` +
            `Nomor: <code>${data.phone_number}</code>`
        ).catch(() => {});

        return res.status(200).json({ success: true, data, balance: charged.balance });
    } catch (error) {
        if (error.response || error.statusCode) return providerError(res, error, 'Gagal memesan nomor.');
        console.error('[ORDER ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memesan nomor.' });
    }
};

exports.checkOrder = async (req, res) => {
    try {
        const orderId = String(req.query.order_id || '').trim();
        if (!orderId) return res.status(400).json({ success: false, message: 'ID pesanan wajib diisi.' });

        // Pastikan pesanan memang milik user yang meminta.
        const order = await Order.findOne({ orderId, user: req.user.id });
        if (!order) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });

        const response = await providerRequest('/v1/orders/get_status', { order_id: orderId });

        if (response && response.success && response.data) {
            const data = response.data;
            if (data.otp_code && String(data.otp_code).trim() !== '') {
                order.otpCode = String(data.otp_code).trim();
                if (order.status === 'received' || order.status === 'pending') {
                    order.status = data.status === 'completed' ? 'completed' : 'received';
                }
                await order.save();
            }
        }

        return res.status(200).json(response);
    } catch (error) {
        return providerError(res, error, 'Gagal memeriksa status pesanan.');
    }
};

exports.setOrderStatus = async (req, res) => {
    try {
        const orderId = String(req.query.order_id || '').trim();
        const status = String(req.query.status || '').trim();

        if (!orderId || !status) {
            return res.status(400).json({ success: false, message: 'Data permintaan tidak lengkap.' });
        }

        const order = await Order.findOne({ orderId, user: req.user.id });
        if (!order) return res.status(404).json({ success: false, message: 'Riwayat pesanan tidak ditemukan.' });

        if (status === 'cancel') {
            if (order.status === 'canceled' || order.status === 'expiring') {
                return res.status(409).json({ success: false, message: 'Pesanan ini sudah dibatalkan.' });
            }
            if (order.otpCode) {
                return res.status(400).json({ success: false, message: 'OTP sudah diterima, pesanan tidak bisa dibatalkan.' });
            }

            const elapsedMinutes = (Date.now() - order.createdAtTimestamp) / 60000;
            if (elapsedMinutes < CANCEL_COOLDOWN_MINUTES) {
                const waitSeconds = Math.ceil((CANCEL_COOLDOWN_MINUTES - elapsedMinutes) * 60);
                return res.status(400).json({
                    success: false,
                    message: `Harap tunggu ${waitSeconds} detik lagi sebelum membatalkan.`
                });
            }

            await providerRequest('/v1/orders/set_status', { order_id: orderId, status: 'cancel' }).catch((err) => {
                console.warn('[SET STATUS] Provider menolak pembatalan:', err.message);
            });

            const refunded = await refundOrder(order._id, 'canceled');
            if (!refunded) {
                return res.status(409).json({ success: false, message: 'Pesanan sudah diproses sebelumnya.' });
            }

            return res.status(200).json({
                success: true,
                message: `Pesanan dibatalkan. Saldo ${formatRupiah(refunded.price)} dikembalikan.`
            });
        }

        if (status === 'done') {
            const response = await providerRequest('/v1/orders/set_status', { order_id: orderId, status: 'done' });

            const updated = await Order.findOneAndUpdate(
                { _id: order._id, status: { $in: ['received', 'pending'] } },
                { $set: { status: 'completed' } },
                { new: true }
            );

            if (updated) {
                sendTelegramNotif(
                    `<b>Pesanan Selesai ✅</b>\n\nUser: @${req.user.username}\nID: <code>${orderId}</code>\n` +
                    `Layanan: ${updated.service}\nNomor: <code>${updated.phoneNumber}</code>`
                ).catch(() => {});
            }

            return res.status(200).json({ success: true, message: 'Pesanan ditandai selesai.', data: response ? response.data : null });
        }

        return res.status(400).json({ success: false, message: 'Status tidak dikenal.' });
    } catch (error) {
        if (error.response || error.statusCode) return providerError(res, error, 'Gagal memperbarui status pesanan.');
        console.error('[SET STATUS ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memperbarui status pesanan.' });
    }
};

exports.getActiveOrder = async (req, res) => {
    try {
        await expireStaleOrders(req.user.id);
        const orders = await Order.find({
            user: req.user.id,
            status: { $in: ['received', 'pending'] }
        }).sort({ createdAtTimestamp: -1 });

        return res.status(200).json({
            success: true,
            data: orders.map((order) => ({
                ...order.toObject(),
                expiresInSeconds: Math.max(
                    0,
                    Math.floor((order.createdAtTimestamp + ORDER_TTL_MINUTES * 60 * 1000 - Date.now()) / 1000)
                )
            }))
        });
    } catch (error) {
        console.error('[ACTIVE ORDER ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat pesanan aktif.' });
    }
};

exports.getHistory = async (req, res) => {
    try {
        await expireStaleOrders(req.user.id);

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

        const [orders, total] = await Promise.all([
            Order.find({ user: req.user.id }).sort({ createdAtTimestamp: -1 })
                .skip((page - 1) * limit).limit(limit),
            Order.countDocuments({ user: req.user.id })
        ]);

        return res.status(200).json({
            success: true,
            data: orders,
            pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
        });
    } catch (error) {
        console.error('[ORDER HISTORY ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat riwayat pesanan.' });
    }
};
