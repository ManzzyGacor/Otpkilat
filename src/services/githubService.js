const axios = require('axios');
const crypto = require('crypto');

exports.uploadImage = async (base64Data, extension) => {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    throw new Error('Konfigurasi GitHub Uploader belum diatur di server.');
  }

  // Format Base64 yang diterima dari frontend biasanya "data:image/jpeg;base64,/9j/4AAQ..."
  const base64Content = base64Data.split(',')[1];
  
  // Buat nama file unik
  const fileName = `avatar_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${extension}`;
  const path = `avatars/${fileName}`;

  try {
    const response = await axios.put(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        message: `Upload avatar: ${fileName}`,
        content: base64Content,
      },
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    // Mengembalikan raw URL agar bisa diload sebagai image
    return `https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`;
  } catch (error) {
    console.error('GitHub Upload Error:', error.response?.data || error.message);
    throw new Error('Gagal mengunggah gambar ke penyimpanan cloud.');
  }
};