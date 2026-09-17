const axios = require('axios');
const { getSettings } = require('./settings');

/**
 * Kirim notifikasi Telegram. Token & chat id diambil dari database
 * (Admin > Pengaturan), dengan .env sebagai cadangan.
 * Kegagalan notifikasi tidak pernah menggagalkan transaksi.
 */
const sendTelegramNotif = async (message) => {
    try {
        const settings = await getSettings();
        const token = settings.telegramBotToken;
        const chatId = settings.telegramChatId;

        if (!token || !chatId) return false;

        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        }, { timeout: 10000 });
        return true;
    } catch (error) {
        console.error('[TELEGRAM] Gagal mengirim notifikasi:', error.response ? error.response.data : error.message);
        return false;
    }
};

module.exports = { sendTelegramNotif };
