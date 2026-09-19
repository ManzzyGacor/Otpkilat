const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Deposit = require('../models/Deposit');
const PaymentMethod = require('../models/PaymentMethod');
const { getSettings } = require('../utils/settings');
const { providerRequest, providerError } = require('../utils/provider');
const { sendTelegramNotif } = require('../utils/telegramBot');

const SUCCESS_STATES = ['success', 'paid', 'completed', 'settled'];
const genId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/** Hitung total bayar: nominal + fee metode + kode unik. */
const calculateCharge = (method, amount) => {
    const fee = Math.ceil((amount * (Number(method.feePercent) || 0)) / 100) + (Number(method.feeFlat) || 0);
    const uniqueCode = method.useUniqueCode && method.mode === 'manual'
        ? crypto.randomInt(1, Math.max(2, Number(method.uniqueCodeMax) || 499))
        : 0;
    return { fee, uniqueCode, payAmount: amount + fee + uniqueCode };
};

/** Daftar metode pembayaran aktif — dibaca dari database, bukan dari .env. */
exports.getPaymentMethods = async (req, res) => {
    try {
        const settings = await getSettings();
        const methods = await PaymentMethod.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });

        return res.status(200).json({
            success: true,
            data: methods.map((m) => m.toPublic()),
            limits: { min: settings.depositMin, max: settings.depositMax }
        });
    } catch (error) {
        console.error('[DEPOSIT METHODS ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat metode pembayaran.' });
    }
};

/**
 * Buat permintaan top up.
 * Metode, batas nominal, biaya, dan nomor rekening semuanya berasal dari
 * database sehingga admin bisa mengubahnya tanpa menyentuh .env.
 */
exports.createDeposit = async (req, res) => {
    try {
        const body = { ...req.query, ...req.body };
        const amount = Math.round(Number(body.amount));
        const methodCode = String(body.method || body.payment_id || '').trim().toLowerCase();

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Nominal top up tidak valid.' });
        }
        if (!methodCode) {
            return res.status(400).json({ success: false, message: 'Metode pembayaran wajib dipilih.' });
        }

        const method = await PaymentMethod.findOne({ code: methodCode, isActive: true });
        if (!method) {
            return res.status(404).json({ success: false, message: 'Metode pembayaran tidak tersedia.' });
        }

        const settings = await getSettings();
        const minAmount = Math.max(Number(method.minAmount) || 0, settings.depositMin);
        const maxAmount = Math.min(Number(method.maxAmount) || Infinity, settings.depositMax);

        if (amount < minAmount || amount > maxAmount) {
            return res.status(400).json({
                success: false,
                message: `Nominal untuk ${method.name} harus antara Rp${minAmount.toLocaleString('id-ID')} dan Rp${maxAmount.toLocaleString('id-ID')}.`
            });
        }

        // Batasi jumlah tagihan menggantung agar tidak dispam.
        const pendingCount = await Deposit.countDocuments({ user: req.user.id, status: 'pending' });
        if (pendingCount >= 3) {
            return res.status(429).json({
                success: false,
                message: 'Anda masih punya 3 tagihan yang belum dibayar. Selesaikan atau batalkan dulu.'
            });
        }

        const { fee, uniqueCode, payAmount } = calculateCharge(method, amount);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        if (method.mode === 'gateway') {
            const providerResponse = await providerRequest(
                method.providerVersion === 'v2' ? '/v2/deposit/create' : '/v1/deposit/create',
                { amount, payment_id: method.providerPaymentId || method.code }
            );

            if (!providerResponse || !providerResponse.success) {
                const message = (providerResponse && providerResponse.message) || 'Provider menolak permintaan deposit.';
                return res.status(400).json({ success: false, message });
            }

            const data = providerResponse.data || {};
            const providerId = String(data.id || data.deposit_id || genId('GW'));

            const deposit = await Deposit.create({
                user: req.user.id,
                deposit_id: providerId,
                depositId: providerId,
                amount,
                payAmount: Number(data.total || (data.currency && data.currency.total) || payAmount),
                fee,
                uniqueCode: 0,
                method: method.code,
                methodName: method.name,
                mode: 'gateway',
                qrImageUrl: data.qr_image || data.qr_url || '',
                paymentInfo: data,
                status: 'pending',
                expiresAt
            });

            sendTelegramNotif(
                `<b>Permintaan Top Up (Gateway)</b>\n\nUser: @${req.user.username}\n` +
                `ID: <code>${providerId}</code>\nMetode: ${method.name}\nNominal: Rp${amount.toLocaleString('id-ID')}`
            ).catch(() => {});

            return res.status(201).json({ success: true, message: 'Tagihan dibuat.', data: buildDepositView(deposit, method) });
        }

        // Mode manual: buat instruksi transfer, admin mengonfirmasi lewat dashboard.
        const manualId = genId('TRX');
        const deposit = await Deposit.create({
            user: req.user.id,
            deposit_id: manualId,
            // Selalu diisi: sebagian database lama punya index unik non-sparse di
            // kolom ini, sehingga beberapa dokumen bernilai null akan bentrok.
            depositId: manualId,
            amount,
            payAmount,
            fee,
            uniqueCode,
            method: method.code,
            methodName: method.name,
            mode: 'manual',
            qrImageUrl: method.qrImageUrl || '',
            paymentInfo: {
                accountName: method.accountName,
                accountNumber: method.accountNumber,
                instructions: method.instructions
            },
            status: 'pending',
            expiresAt
        });

        sendTelegramNotif(
            `<b>Permintaan Top Up Manual</b>\n\nUser: @${req.user.username}\n` +
            `ID: <code>${deposit.deposit_id}</code>\nMetode: ${method.name}\n` +
            `Bayar: Rp${payAmount.toLocaleString('id-ID')} (saldo Rp${amount.toLocaleString('id-ID')})`
        ).catch(() => {});

        return res.status(201).json({
            success: true,
            message: 'Tagihan dibuat. Silakan lakukan pembayaran.',
            data: buildDepositView(deposit, method)
        });
    } catch (error) {
        if (error.response || error.statusCode) return providerError(res, error, 'Gagal membuat tagihan deposit.');
        console.error('[DEPOSIT CREATE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal membuat tagihan deposit.' });
    }
};

const buildDepositView = (deposit, method) => ({
    id: deposit._id,
    depositId: deposit.deposit_id,
    amount: deposit.amount,
    payAmount: deposit.payAmount,
    fee: deposit.fee,
    uniqueCode: deposit.uniqueCode,
    method: deposit.method,
    methodName: deposit.methodName,
    mode: deposit.mode,
    status: deposit.status,
    qrImageUrl: deposit.qrImageUrl,
    accountName: deposit.paymentInfo ? deposit.paymentInfo.accountName : '',
    accountNumber: deposit.paymentInfo ? deposit.paymentInfo.accountNumber : '',
    instructions: (deposit.paymentInfo && deposit.paymentInfo.instructions) || (method ? method.instructions : ''),
    expiresAt: deposit.expiresAt,
    createdAt: deposit.createdAt
});

/**
 * Cek status tagihan.
 * Perbaikan penting: deposit dicari berdasarkan pemiliknya. Sebelumnya siapa pun
 * yang tahu sebuah deposit_id bisa memicu penambahan saldo ke akunnya sendiri.
 */
exports.checkDeposit = async (req, res) => {
    try {
        const depositId = String(req.query.deposit_id || req.query.id || '').trim();
        if (!depositId) {
            return res.status(400).json({ success: false, message: 'ID deposit wajib diisi.' });
        }

        const filter = { user: req.user.id, $or: [{ deposit_id: depositId }] };
        if (mongoose.isValidObjectId(depositId)) filter.$or.push({ _id: depositId });

        const deposit = await Deposit.findOne(filter);
        if (!deposit) {
            return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
        }

        if (deposit.status !== 'pending') {
            return res.status(200).json({ success: true, data: { status: deposit.status, ...buildDepositView(deposit) } });
        }

        if (deposit.mode === 'manual') {
            return res.status(200).json({
                success: true,
                data: { status: 'pending', ...buildDepositView(deposit) },
                message: 'Menunggu konfirmasi admin. Pembayaran biasanya diproses dalam beberapa menit.'
            });
        }

        const providerResponse = await providerRequest(
            '/v1/deposit/get_status',
            { deposit_id: deposit.deposit_id }
        );

        const providerData = (providerResponse && providerResponse.data) || {};
        const statusApi = String(providerData.status || '').toLowerCase();

        if (SUCCESS_STATES.includes(statusApi)) {
            // Pembaruan atomik: hanya dokumen yang masih 'pending' yang berubah,
            // sehingga polling berulang tidak pernah menambah saldo dua kali.
            const credited = await Deposit.findOneAndUpdate(
                { _id: deposit._id, status: 'pending' },
                { $set: { status: 'success', creditedAt: new Date() } },
                { new: true }
            );

            if (credited) {
                await User.findByIdAndUpdate(deposit.user, { $inc: { balance: deposit.amount } });
                sendTelegramNotif(
                    `<b>Top Up Berhasil ✅</b>\n\nUser: @${req.user.username}\n` +
                    `ID: <code>${deposit.deposit_id}</code>\nSaldo +Rp${deposit.amount.toLocaleString('id-ID')}`
                ).catch(() => {});
            }

            return res.status(200).json({
                success: true,
                message: 'Pembayaran diterima, saldo sudah ditambahkan.',
                data: { status: 'success', ...buildDepositView(deposit) }
            });
        }

        if (['canceled', 'cancelled', 'expired', 'failed'].includes(statusApi)) {
            await Deposit.updateOne({ _id: deposit._id, status: 'pending' }, { $set: { status: 'canceled' } });
            return res.status(200).json({ success: true, data: { status: 'canceled' }, message: 'Tagihan dibatalkan atau kedaluwarsa.' });
        }

        return res.status(200).json({ success: true, data: { status: 'pending' }, message: 'Pembayaran belum diterima.' });
    } catch (error) {
        if (error.response || error.statusCode) return providerError(res, error, 'Gagal memeriksa status deposit.');
        console.error('[DEPOSIT CHECK ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memeriksa status deposit.' });
    }
};

exports.cancelDeposit = async (req, res) => {
    try {
        const depositId = String(req.query.deposit_id || req.body.deposit_id || '').trim();
        if (!depositId) return res.status(400).json({ success: false, message: 'ID deposit wajib diisi.' });

        const filter = { user: req.user.id, status: 'pending', $or: [{ deposit_id: depositId }] };
        if (mongoose.isValidObjectId(depositId)) filter.$or.push({ _id: depositId });

        const deposit = await Deposit.findOne(filter);
        if (!deposit) {
            return res.status(404).json({ success: false, message: 'Transaksi aktif tidak ditemukan.' });
        }

        if (deposit.mode === 'gateway') {
            // Kegagalan di sisi provider tidak boleh menghalangi pembatalan lokal.
            try {
                await providerRequest('/v1/deposit/cancel', { deposit_id: deposit.deposit_id });
            } catch (err) {
                console.warn('[DEPOSIT CANCEL] Provider menolak pembatalan:', err.message);
            }
        }

        deposit.status = 'canceled';
        await deposit.save();

        return res.status(200).json({ success: true, message: 'Transaksi dibatalkan.' });
    } catch (error) {
        console.error('[DEPOSIT CANCEL ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal membatalkan transaksi.' });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const deposits = await Deposit.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(limit);
        return res.status(200).json({ success: true, data: deposits.map((d) => buildDepositView(d)) });
    } catch (error) {
        console.error('[DEPOSIT HISTORY ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat riwayat deposit.' });
    }
};

/** Tagihan manual yang masih menunggu pembayaran (dipakai halaman deposit). */
exports.getPending = async (req, res) => {
    try {
        const deposits = await Deposit.find({ user: req.user.id, status: 'pending' }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: deposits.map((d) => buildDepositView(d)) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Gagal memuat tagihan aktif.' });
    }
};
