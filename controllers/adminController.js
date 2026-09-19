const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Deposit = require('../models/Deposit');
const Announcement = require('../models/Announcement');
const PaymentMethod = require('../models/PaymentMethod');
const { getSettingDoc, invalidateSettingsCache, getSettings } = require('../utils/settings');
const { providerRequest } = require('../utils/provider');
const { sendTelegramNotif } = require('../utils/telegramBot');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

/* ------------------------------------------------------------------ */
/* Statistik                                                           */
/* ------------------------------------------------------------------ */

exports.getStats = async (req, res) => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const [
            totalUsers,
            activeUsers,
            newUsersToday,
            totalOrders,
            ordersToday,
            pendingDeposits,
            balanceAgg,
            revenueAgg,
            depositAgg
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isActive: true }),
            User.countDocuments({ createdAt: { $gte: startOfToday } }),
            Order.countDocuments(),
            Order.countDocuments({ createdAt: { $gte: startOfToday } }),
            Deposit.countDocuments({ status: 'pending' }),
            User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
            Order.aggregate([
                { $match: { status: { $in: ['completed', 'received'] } } },
                { $group: { _id: null, total: { $sum: '$price' } } }
            ]),
            Deposit.aggregate([
                { $match: { status: 'success' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);

        const settings = await getSettings(true);

        return res.status(200).json({
            success: true,
            data: {
                totalUsers,
                activeUsers,
                newUsersToday,
                totalOrders,
                ordersToday,
                pendingDeposits,
                totalBalanceInSystem: balanceAgg[0] ? balanceAgg[0].total : 0,
                totalRevenue: revenueAgg[0] ? revenueAgg[0].total : 0,
                totalDeposit: depositAgg[0] ? depositAgg[0].total : 0,
                setting: { marginProfit: settings.marginProfit }
            }
        });
    } catch (error) {
        console.error('[ADMIN STATS ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat statistik admin.' });
    }
};

/** Saldo di akun provider (dulu ada di userController dan mudah tertukar). */
exports.getProviderBalance = async (req, res) => {
    try {
        const data = await providerRequest('/v1/user/balance');
        return res.status(200).json({ success: true, data: data.data || data });
    } catch (error) {
        return res.status(200).json({
            success: false,
            message: error.statusCode === 503
                ? 'API key provider belum diatur.'
                : 'Gagal mengambil saldo provider.'
        });
    }
};

/* ------------------------------------------------------------------ */
/* Manajemen user                                                      */
/* ------------------------------------------------------------------ */

exports.getUsers = async (req, res) => {
    try {
        const page = Math.max(1, toInt(req.query.page, 1));
        const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
        const search = String(req.query.search || '').trim();
        const role = String(req.query.role || '').trim();

        const filter = {};
        if (search) {
            const rx = new RegExp(escapeRegex(search), 'i');
            filter.$or = [{ username: rx }, { email: rx }, { fullName: rx }, { phoneNumber: rx }];
        }
        if (role === 'admin' || role === 'user') filter.role = role;

        const [users, total] = await Promise.all([
            User.find(filter).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
            User.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            data: users.map((u) => u.toPublic()),
            pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
        });
    } catch (error) {
        console.error('[ADMIN GET USERS ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat daftar user.' });
    }
};

exports.getUserDetail = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'ID user tidak valid.' });
        }
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });

        const [orders, deposits] = await Promise.all([
            Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(10),
            Deposit.find({ user: user._id }).sort({ createdAt: -1 }).limit(10)
        ]);

        return res.status(200).json({ success: true, data: { user: user.toPublic(), orders, deposits } });
    } catch (error) {
        console.error('[ADMIN USER DETAIL ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat detail user.' });
    }
};

/**
 * Simpan perubahan data user.
 * Endpoint ini sebelumnya tidak ada sama sekali, itulah sebabnya tombol
 * simpan di dashboard admin tidak pernah berhasil.
 */
exports.updateUser = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'ID user tidak valid.' });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });

        const { fullName, username, email, phoneNumber, role, balance, isActive, notes, newPassword } = req.body;

        if (fullName !== undefined) {
            const value = String(fullName).trim();
            if (!value) return res.status(400).json({ success: false, message: 'Nama lengkap tidak boleh kosong.' });
            user.fullName = value;
        }

        if (username !== undefined) {
            const value = String(username).trim().toLowerCase();
            if (!/^[a-z0-9_]{3,20}$/.test(value)) {
                return res.status(400).json({ success: false, message: 'Username 3-20 karakter (huruf, angka, garis bawah).' });
            }
            if (value !== user.username && await User.exists({ username: value, _id: { $ne: user._id } })) {
                return res.status(409).json({ success: false, message: 'Username sudah dipakai user lain.' });
            }
            user.username = value;
        }

        if (email !== undefined) {
            const value = String(email).trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                return res.status(400).json({ success: false, message: 'Format email tidak valid.' });
            }
            if (value !== user.email && await User.exists({ email: value, _id: { $ne: user._id } })) {
                return res.status(409).json({ success: false, message: 'Email sudah dipakai user lain.' });
            }
            user.email = value;
        }

        if (phoneNumber !== undefined) {
            const value = String(phoneNumber).trim();
            if (value && value !== user.phoneNumber && await User.exists({ phoneNumber: value, _id: { $ne: user._id } })) {
                return res.status(409).json({ success: false, message: 'Nomor HP sudah dipakai user lain.' });
            }
            user.phoneNumber = value || null;
        }

        if (role !== undefined) {
            if (!['user', 'admin'].includes(role)) {
                return res.status(400).json({ success: false, message: 'Role tidak valid.' });
            }
            // Cegah admin terakhir menurunkan dirinya sendiri sehingga dashboard terkunci.
            if (user.role === 'admin' && role === 'user') {
                const adminCount = await User.countDocuments({ role: 'admin' });
                if (adminCount <= 1) {
                    return res.status(400).json({ success: false, message: 'Tidak bisa menghapus admin terakhir.' });
                }
            }
            user.role = role;
        }

        if (balance !== undefined) {
            const value = Number(balance);
            if (!Number.isFinite(value) || value < 0) {
                return res.status(400).json({ success: false, message: 'Saldo harus angka minimal 0.' });
            }
            user.balance = Math.round(value);
        }

        if (isActive !== undefined) {
            const next = isActive === true || isActive === 'true';
            if (!next && String(user._id) === req.user.id) {
                return res.status(400).json({ success: false, message: 'Tidak bisa menonaktifkan akun sendiri.' });
            }
            user.isActive = next;
        }

        if (notes !== undefined) user.notes = String(notes).slice(0, 500);

        if (newPassword) {
            const value = String(newPassword);
            if (value.length < 6) {
                return res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter.' });
            }
            user.password = await bcrypt.hash(value, 10);
        }

        await user.save();
        return res.status(200).json({ success: true, message: 'Data user berhasil disimpan.', data: user.toPublic() });
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Username, email, atau nomor HP sudah dipakai.' });
        }
        console.error('[ADMIN UPDATE USER ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan data user.' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'ID user tidak valid.' });
        }
        if (req.params.id === req.user.id) {
            return res.status(400).json({ success: false, message: 'Tidak bisa menghapus akun sendiri.' });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });

        if (user.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin' });
            if (adminCount <= 1) {
                return res.status(400).json({ success: false, message: 'Tidak bisa menghapus admin terakhir.' });
            }
        }

        await user.deleteOne();
        return res.status(200).json({ success: true, message: `User @${user.username} dihapus.` });
    } catch (error) {
        console.error('[ADMIN DELETE USER ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal menghapus user.' });
    }
};

/** Tambah / kurangi saldo user. Memakai $inc agar aman dari balapan request. */
exports.adjustUserBalance = async (req, res) => {
    try {
        const { username, userId, amount, type, note } = req.body;
        const nominal = Math.round(Number(amount));

        if (!Number.isFinite(nominal) || nominal <= 0) {
            return res.status(400).json({ success: false, message: 'Nominal harus angka lebih dari 0.' });
        }
        if (!['add', 'reduce'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Jenis aksi tidak valid.' });
        }

        const query = userId && mongoose.isValidObjectId(userId)
            ? { _id: userId }
            : { username: String(username || '').trim().toLowerCase() };

        const target = await User.findOne(query);
        if (!target) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });

        if (type === 'reduce' && target.balance < nominal) {
            return res.status(400).json({
                success: false,
                message: `Saldo user hanya Rp${target.balance.toLocaleString('id-ID')}, tidak cukup untuk dikurangi.`
            });
        }

        const updated = await User.findOneAndUpdate(
            { _id: target._id },
            { $inc: { balance: type === 'add' ? nominal : -nominal } },
            { new: true }
        ).select('-password');

        if (updated.balance < 0) {
            await User.updateOne({ _id: updated._id }, { $set: { balance: 0 } });
            updated.balance = 0;
        }

        const adjustmentId = `ADM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await Deposit.create({
            user: updated._id,
            deposit_id: adjustmentId,
            depositId: adjustmentId,
            amount: type === 'add' ? nominal : -nominal,
            payAmount: 0,
            method: 'admin-adjustment',
            methodName: type === 'add' ? 'Penambahan oleh Admin' : 'Pengurangan oleh Admin',
            mode: 'manual',
            status: 'success',
            note: String(note || '').slice(0, 200),
            creditedAt: new Date(),
            handledBy: req.user.id
        });

        sendTelegramNotif(
            `<b>Penyesuaian Saldo Manual</b>\n\nUser: @${updated.username}\n` +
            `Aksi: ${type === 'add' ? 'Tambah' : 'Kurangi'} Rp${nominal.toLocaleString('id-ID')}\n` +
            `Saldo akhir: Rp${updated.balance.toLocaleString('id-ID')}`
        ).catch(() => {});

        return res.status(200).json({
            success: true,
            message: `Saldo @${updated.username} kini Rp${updated.balance.toLocaleString('id-ID')}.`,
            data: updated.toPublic()
        });
    } catch (error) {
        console.error('[ADMIN ADJUST BALANCE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal mengubah saldo user.' });
    }
};

/* ------------------------------------------------------------------ */
/* Pesanan & deposit                                                   */
/* ------------------------------------------------------------------ */

exports.getOrders = async (req, res) => {
    try {
        const page = Math.max(1, toInt(req.query.page, 1));
        const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
        const status = String(req.query.status || '').trim();
        const search = String(req.query.search || '').trim();

        const filter = {};
        if (status) filter.status = status;
        if (search) {
            const rx = new RegExp(escapeRegex(search), 'i');
            filter.$or = [{ orderId: rx }, { phoneNumber: rx }, { service: rx }];
        }

        const [orders, total] = await Promise.all([
            Order.find(filter).populate('user', 'username email').sort({ createdAt: -1 })
                .skip((page - 1) * limit).limit(limit),
            Order.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            data: orders,
            pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
        });
    } catch (error) {
        console.error('[ADMIN ORDERS ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat daftar pesanan.' });
    }
};

exports.getDeposits = async (req, res) => {
    try {
        const page = Math.max(1, toInt(req.query.page, 1));
        const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
        const status = String(req.query.status || '').trim();

        const filter = {};
        if (status) filter.status = status;

        const [deposits, total] = await Promise.all([
            Deposit.find(filter).populate('user', 'username email').sort({ createdAt: -1 })
                .skip((page - 1) * limit).limit(limit),
            Deposit.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            data: deposits,
            pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
        });
    } catch (error) {
        console.error('[ADMIN DEPOSITS ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat daftar deposit.' });
    }
};

/**
 * Konfirmasi deposit manual.
 * Saldo hanya ditambahkan bila status pending berhasil diubah menjadi success
 * dalam satu operasi atomik, sehingga klik ganda tidak menambah saldo dua kali.
 */
exports.approveDeposit = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'ID deposit tidak valid.' });
        }

        const deposit = await Deposit.findOneAndUpdate(
            { _id: req.params.id, status: 'pending' },
            { $set: { status: 'success', creditedAt: new Date(), handledBy: req.user.id } },
            { new: true }
        );

        if (!deposit) {
            return res.status(409).json({
                success: false,
                message: 'Deposit tidak ditemukan atau sudah diproses sebelumnya.'
            });
        }

        const user = await User.findByIdAndUpdate(
            deposit.user,
            { $inc: { balance: deposit.amount } },
            { new: true }
        );

        sendTelegramNotif(
            `<b>Deposit Dikonfirmasi ✅</b>\n\nUser: @${user ? user.username : '-'}\n` +
            `ID: <code>${deposit.deposit_id}</code>\nNominal: Rp${deposit.amount.toLocaleString('id-ID')}`
        ).catch(() => {});

        return res.status(200).json({ success: true, message: 'Deposit dikonfirmasi dan saldo ditambahkan.' });
    } catch (error) {
        console.error('[ADMIN APPROVE DEPOSIT ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal mengonfirmasi deposit.' });
    }
};

exports.rejectDeposit = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'ID deposit tidak valid.' });
        }

        const deposit = await Deposit.findOneAndUpdate(
            { _id: req.params.id, status: 'pending' },
            { $set: { status: 'rejected', handledBy: req.user.id, note: String(req.body.note || '').slice(0, 200) } },
            { new: true }
        );

        if (!deposit) {
            return res.status(409).json({ success: false, message: 'Deposit tidak ditemukan atau sudah diproses.' });
        }

        return res.status(200).json({ success: true, message: 'Deposit ditolak.' });
    } catch (error) {
        console.error('[ADMIN REJECT DEPOSIT ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal menolak deposit.' });
    }
};

/* ------------------------------------------------------------------ */
/* Metode pembayaran                                                   */
/* ------------------------------------------------------------------ */

const paymentFields = [
    'code', 'name', 'mode', 'providerPaymentId', 'providerVersion', 'accountName',
    'accountNumber', 'qrImageUrl', 'instructions', 'logoUrl', 'feeFlat', 'feePercent',
    'minAmount', 'maxAmount', 'useUniqueCode', 'uniqueCodeMax', 'isActive', 'sortOrder'
];

const buildPaymentPayload = (body) => {
    const payload = {};
    paymentFields.forEach((field) => {
        if (body[field] === undefined) return;
        if (['feeFlat', 'feePercent', 'minAmount', 'maxAmount', 'uniqueCodeMax', 'sortOrder'].includes(field)) {
            payload[field] = Number(body[field]) || 0;
        } else if (['isActive', 'useUniqueCode'].includes(field)) {
            payload[field] = body[field] === true || body[field] === 'true';
        } else {
            payload[field] = String(body[field]).trim();
        }
    });
    return payload;
};

exports.getPaymentMethods = async (req, res) => {
    try {
        const methods = await PaymentMethod.find().sort({ sortOrder: 1, name: 1 });
        return res.status(200).json({ success: true, data: methods });
    } catch (error) {
        console.error('[ADMIN PAYMENT LIST ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat metode pembayaran.' });
    }
};

exports.createPaymentMethod = async (req, res) => {
    try {
        const payload = buildPaymentPayload(req.body);
        if (!payload.code || !payload.name) {
            return res.status(400).json({ success: false, message: 'Kode dan nama metode wajib diisi.' });
        }
        payload.code = payload.code.toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (!payload.code) {
            return res.status(400).json({ success: false, message: 'Kode metode hanya boleh huruf, angka, - dan _.' });
        }
        if (await PaymentMethod.exists({ code: payload.code })) {
            return res.status(409).json({ success: false, message: 'Kode metode sudah dipakai.' });
        }
        if (payload.mode === 'gateway' && !payload.providerPaymentId) {
            return res.status(400).json({ success: false, message: 'Mode gateway membutuhkan Payment ID provider.' });
        }

        const method = await PaymentMethod.create(payload);
        return res.status(201).json({ success: true, message: 'Metode pembayaran ditambahkan.', data: method });
    } catch (error) {
        console.error('[ADMIN PAYMENT CREATE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal menambah metode pembayaran.' });
    }
};

exports.updatePaymentMethod = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'ID metode tidak valid.' });
        }
        const payload = buildPaymentPayload(req.body);
        delete payload.code; // kode bersifat tetap agar riwayat deposit lama tetap cocok

        const method = await PaymentMethod.findByIdAndUpdate(req.params.id, { $set: payload }, { new: true, runValidators: true });
        if (!method) return res.status(404).json({ success: false, message: 'Metode tidak ditemukan.' });

        return res.status(200).json({ success: true, message: 'Metode pembayaran disimpan.', data: method });
    } catch (error) {
        console.error('[ADMIN PAYMENT UPDATE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan metode pembayaran.' });
    }
};

exports.deletePaymentMethod = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'ID metode tidak valid.' });
        }
        const method = await PaymentMethod.findByIdAndDelete(req.params.id);
        if (!method) return res.status(404).json({ success: false, message: 'Metode tidak ditemukan.' });
        return res.status(200).json({ success: true, message: 'Metode pembayaran dihapus.' });
    } catch (error) {
        console.error('[ADMIN PAYMENT DELETE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal menghapus metode pembayaran.' });
    }
};

/* ------------------------------------------------------------------ */
/* Pengaturan sistem                                                   */
/* ------------------------------------------------------------------ */

const SECRET_FIELDS = ['providerApiKey', 'telegramBotToken', 'googleClientSecret', 'githubToken'];
const maskSecret = (value) => (value ? `${'•'.repeat(8)}${String(value).slice(-4)}` : '');

exports.getSettings = async (req, res) => {
    try {
        const doc = await getSettingDoc();
        const data = doc.toObject();

        // Rahasia hanya dikirim dalam bentuk tersamar; nilai penuh tidak pernah keluar.
        SECRET_FIELDS.forEach((field) => {
            data[`${field}Set`] = Boolean(data[field]);
            data[field] = maskSecret(data[field]);
        });
        delete data.jwtSecret;

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('[ADMIN GET SETTINGS ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat pengaturan.' });
    }
};

const SETTING_STRINGS = [
    'siteName', 'siteTagline', 'supportUrl', 'announcement', 'providerBaseUrl',
    'telegramChatId', 'googleClientId', 'googleCallbackUrl', 'githubOwner',
    'githubRepo', 'maintenanceMessage'
];
const SETTING_NUMBERS = ['marginProfit', 'depositMin', 'depositMax'];

exports.updateSettings = async (req, res) => {
    try {
        const doc = await getSettingDoc();

        SETTING_STRINGS.forEach((field) => {
            if (req.body[field] !== undefined) doc[field] = String(req.body[field]).trim();
        });

        SETTING_NUMBERS.forEach((field) => {
            if (req.body[field] === undefined) return;
            const value = Number(req.body[field]);
            if (Number.isFinite(value) && value >= 0) doc[field] = value;
        });

        if (req.body.maintenanceMode !== undefined) {
            doc.maintenanceMode = req.body.maintenanceMode === true || req.body.maintenanceMode === 'true';
        }

        // Rahasia hanya ditimpa bila admin benar-benar mengisi nilai baru,
        // sehingga menyimpan form tidak menghapus kunci yang sudah ada.
        SECRET_FIELDS.forEach((field) => {
            const value = req.body[field];
            if (value === undefined) return;
            const trimmed = String(value).trim();
            if (trimmed === '' || trimmed.includes('•')) return;
            doc[field] = trimmed;
        });

        if (doc.depositMax < doc.depositMin) {
            return res.status(400).json({ success: false, message: 'Batas maksimum deposit harus lebih besar dari minimum.' });
        }

        await doc.save();
        invalidateSettingsCache();

        return res.status(200).json({ success: true, message: 'Pengaturan berhasil disimpan.' });
    } catch (error) {
        console.error('[ADMIN UPDATE SETTINGS ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan.' });
    }
};

/* ------------------------------------------------------------------ */
/* Pengumuman                                                          */
/* ------------------------------------------------------------------ */

exports.getAnnouncements = async (req, res) => {
    try {
        const items = await Announcement.find().sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: items });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Gagal memuat pengumuman.' });
    }
};
