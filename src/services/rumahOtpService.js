const axios = require('axios');

const apiClient = axios.create({
  baseURL: process.env.RUMAHOTP_BASE_URL,
  headers: {
    'x-apikey': process.env.RUMAHOTP_API_KEY,
    'Accept': 'application/json'
  },
  timeout: 10000
});

exports.getBalance = async () => {
  try {
    const response = await apiClient.get('/v1/user/balance');
    return response.data;
  } catch (error) {
    console.error('Provider getBalance Error:', error.response?.data || error.message);
    throw new Error('Gagal mengambil saldo provider');
  }
};

exports.getServices = async () => {
  try {
    const response = await apiClient.get('/v2/services');
    return response.data;
  } catch (error) {
    console.error('Provider getServices Error:', error.response?.data || error.message);
    throw new Error('Gagal mengambil daftar layanan');
  }
};

exports.getCountries = async (serviceId) => {
  try {
    const response = await apiClient.get(`/v2/countries?service_id=${serviceId}`);
    return response.data;
  } catch (error) {
    console.error('Provider getCountries Error:', error.response?.data || error.message);
    throw new Error('Gagal mengambil daftar negara');
  }
};

exports.getOperators = async (country, providerId) => {
  try {
    const response = await apiClient.get(`/v2/operators?country=${country}&provider_id=${providerId}`);
    return response.data;
  } catch (error) {
    console.error('Provider getOperators Error:', error.response?.data || error.message);
    throw new Error('Gagal mengambil daftar operator');
  }
};

exports.createOrder = async (numberId, providerId, operatorId) => {
  try {
    const response = await apiClient.get(`/v2/orders?number_id=${numberId}&provider_id=${providerId}&operator_id=${operatorId}`);
    return response.data;
  } catch (error) {
    console.error('Provider createOrder Error:', error.response?.data || error.message);
    throw new Error('Gagal membuat pesanan di provider');
  }
};

exports.getOrderStatus = async (orderId) => {
  try {
    const response = await apiClient.get(`/v1/orders/get_status?order_id=${orderId}`);
    return response.data;
  } catch (error) {
    console.error('Provider getOrderStatus Error:', error.response?.data || error.message);
    throw new Error('Gagal mendapatkan status pesanan');
  }
};

exports.setOrderStatus = async (orderId, status) => {
  try {
    const response = await apiClient.get(`/v1/orders/set_status?order_id=${orderId}&status=${status}`);
    return response.data;
  } catch (error) {
    console.error('Provider setOrderStatus Error:', error.response?.data || error.message);
    throw new Error('Gagal mengubah status pesanan');
  }
};