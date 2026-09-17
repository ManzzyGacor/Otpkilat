const Setting = require('../models/Setting');

let cached = null;
let cachedAt = 0;
const TTL_MS = 30 * 1000;

/** Nilai pertama yang tidak kosong. */
const pick = (...values) => {
    for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
};

/** Ambil (atau buat) dokumen pengaturan tunggal. */
const getSettingDoc = async () => {
    let doc = await Setting.findOne({ key: 'global' });
    if (!doc) {
        // Migrasi dokumen lama yang belum punya field `key`.
        doc = await Setting.findOne({ key: { $exists: false } });
        if (doc) {
            doc.key = 'global';
            await doc.save();
        }
    }
    if (!doc) {
        doc = await Setting.create({ key: 'global' });
    }
    return doc;
};

/** Pengaturan efektif: nilai database menang, .env hanya jadi cadangan. */
const getSettings = async (force = false) => {
    if (!force && cached && Date.now() - cachedAt < TTL_MS) return cached;

    const doc = await getSettingDoc();
    cached = {
        doc,
        siteName: pick(doc.siteName, 'KilatOTP'),
        siteTagline: doc.siteTagline || '',
        supportUrl: doc.supportUrl || '',
        marginProfit: Number(doc.marginProfit) || 0,
        providerApiKey: pick(doc.providerApiKey, process.env.RUMAHOTP_API_KEY),
        providerBaseUrl: pick(doc.providerBaseUrl, process.env.RUMAHOTP_BASE_URL, 'https://www.rumahotp.io/api'),
        telegramBotToken: pick(doc.telegramBotToken, process.env.TELEGRAM_BOT_TOKEN),
        telegramChatId: pick(doc.telegramChatId, process.env.TELEGRAM_CHAT_ID),
        googleClientId: pick(doc.googleClientId, process.env.GOOGLE_CLIENT_ID),
        googleClientSecret: pick(doc.googleClientSecret, process.env.GOOGLE_CLIENT_SECRET),
        googleCallbackUrl: pick(doc.googleCallbackUrl, process.env.GOOGLE_CALLBACK_URL),
        depositMin: Number(doc.depositMin) || 2000,
        depositMax: Number(doc.depositMax) || 1000000,
        githubToken: pick(doc.githubToken, process.env.GITHUB_TOKEN),
        githubOwner: pick(doc.githubOwner, process.env.GITHUB_OWNER),
        githubRepo: pick(doc.githubRepo, process.env.GITHUB_REPO),
        maintenanceMode: Boolean(doc.maintenanceMode),
        maintenanceMessage: doc.maintenanceMessage || ''
    };
    cachedAt = Date.now();
    return cached;
};

const invalidateSettingsCache = () => {
    cached = null;
    cachedAt = 0;
};

/**
 * Rahasia JWT. Sengaja dibaca sinkron dari env karena middleware auth berjalan
 * pada setiap request; nilai yang berubah-ubah akan membatalkan semua sesi.
 */
const getJwtSecret = () => process.env.SESSION_SECRET || process.env.JWT_SECRET || 'kilatotp-dev-secret-change-me';

const getMargin = async () => (await getSettings()).marginProfit;

module.exports = { getSettings, getSettingDoc, invalidateSettingsCache, getJwtSecret, getMargin };
