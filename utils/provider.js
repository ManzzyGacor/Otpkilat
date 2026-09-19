const axios = require('axios');
const { getSettings } = require('./settings');

/**
 * Pemanggil API provider nomor (RumahOTP).
 * Kredensial diambil dari database agar bisa diganti tanpa redeploy.
 */
const providerRequest = async (endpoint, params = {}, method = 'GET') => {
    const settings = await getSettings();

    if (!settings.providerApiKey) {
        const err = new Error('API key provider belum diatur. Isi di Admin > Pengaturan.');
        err.statusCode = 503;
        throw err;
    }

    const baseUrl = String(settings.providerBaseUrl).replace(/\/$/, '');

    const response = await axios({
        method,
        url: `${baseUrl}${endpoint}`,
        headers: {
            'x-apikey': settings.providerApiKey,
            Accept: 'application/json'
        },
        params,
        timeout: 30000
    });

    return response.data;
};

/** Ubah error axios menjadi respons JSON yang konsisten. */
const providerError = (res, error, fallbackMessage) => {
    const status = error.statusCode || 502;
    const payload = error.response ? error.response.data : null;
    const message = (payload && (payload.message || (payload.error && payload.error.message))) || error.message || fallbackMessage;
    return res.status(payload ? 400 : status).json({
        success: false,
        message: message || fallbackMessage,
        error: payload || undefined
    });
};

const formatRupiah = (angka) => 'Rp' + Number(angka || 0).toLocaleString('id-ID');

module.exports = { providerRequest, providerError, formatRupiah };
