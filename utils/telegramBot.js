const axios = require('axios');

const sendTelegramNotif = async (message) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
        console.log("Telegram Bot Token atau Chat ID belum diatur di .env");
        return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    try {
        await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error("Gagal mengirim notifikasi Telegram:", error.response ? error.response.data : error.message);
    }
};

module.exports = { sendTelegramNotif };