const PaymentMethod = require('../models/PaymentMethod');
const { getSettingDoc } = require('../utils/settings');

/**
 * Isi data awal saat pertama kali dijalankan.
 * Konfigurasi yang dulu hanya ada di .env dipindahkan ke database agar
 * bisa diubah lewat Admin Dashboard tanpa redeploy.
 */
const seedDefaults = async () => {
    try {
        const setting = await getSettingDoc();
        let changed = false;

        const migrate = (field, envKey) => {
            if (!setting[field] && process.env[envKey]) {
                setting[field] = process.env[envKey];
                changed = true;
            }
        };

        migrate('providerApiKey', 'RUMAHOTP_API_KEY');
        migrate('providerBaseUrl', 'RUMAHOTP_BASE_URL');
        migrate('telegramBotToken', 'TELEGRAM_BOT_TOKEN');
        migrate('telegramChatId', 'TELEGRAM_CHAT_ID');
        migrate('googleClientId', 'GOOGLE_CLIENT_ID');
        migrate('googleClientSecret', 'GOOGLE_CLIENT_SECRET');
        migrate('googleCallbackUrl', 'GOOGLE_CALLBACK_URL');
        migrate('githubToken', 'GITHUB_TOKEN');
        migrate('githubOwner', 'GITHUB_OWNER');
        migrate('githubRepo', 'GITHUB_REPO');

        if (changed) {
            await setting.save();
            console.log('[SEED] Konfigurasi .env dipindahkan ke database.');
        }

        if ((await PaymentMethod.estimatedDocumentCount()) === 0) {
            await PaymentMethod.insertMany([
                {
                    code: 'qris',
                    name: 'QRIS (Semua E-Wallet & Bank)',
                    mode: 'manual',
                    instructions: 'Bayar sesuai nominal yang tertera, lalu tekan "Cek Status". Admin akan mengonfirmasi pembayaran Anda. Atur gambar QR di Admin > Pembayaran.',
                    feePercent: 0.7,
                    minAmount: 5000,
                    maxAmount: 1000000,
                    useUniqueCode: true,
                    sortOrder: 1,
                    isActive: true
                },
                {
                    code: 'bca',
                    name: 'Transfer Bank BCA',
                    mode: 'manual',
                    accountName: 'Ganti di Admin > Metode Pembayaran',
                    accountNumber: '0000000000',
                    instructions: 'Transfer tepat sampai 3 digit terakhir agar pembayaran mudah dicocokkan, lalu tekan "Cek Status".',
                    minAmount: 10000,
                    maxAmount: 5000000,
                    useUniqueCode: true,
                    sortOrder: 2,
                    isActive: true
                },
                {
                    code: 'dana',
                    name: 'DANA',
                    mode: 'manual',
                    accountName: 'Ganti di Admin > Metode Pembayaran',
                    accountNumber: '08xxxxxxxxxx',
                    instructions: 'Kirim ke nomor DANA di atas sesuai nominal yang tertera, lalu tekan "Cek Status".',
                    minAmount: 5000,
                    maxAmount: 2000000,
                    useUniqueCode: true,
                    sortOrder: 3,
                    isActive: true
                }
            ]);
            console.log('[SEED] Metode pembayaran bawaan dibuat.');
        }
    } catch (error) {
        console.error('[SEED] Gagal menyiapkan data awal:', error.message);
    }
};

module.exports = { seedDefaults };
