const crypto = require('crypto');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getSettings, getJwtSecret } = require('../utils/settings');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const signToken = (user) => jwt.sign(
    { user: { id: String(user._id), role: user.role } },
    getJwtSecret(),
    { expiresIn: '7d' }
);

const sessionPayload = (user) => ({
    success: true,
    token: signToken(user),
    user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        avatarUrl: user.avatarUrl
    }
});

const normalize = (value) => String(value || '').trim().toLowerCase();

/** Username unik dari email/nama, ditambah angka bila sudah dipakai. */
const buildUniqueUsername = async (seed) => {
    let base = normalize(seed).replace(/[^a-z0-9_]/g, '');
    if (base.length < 3) base = `user${base}`;
    base = base.slice(0, 20);

    let candidate = base;
    let attempt = 0;
    /* eslint-disable no-await-in-loop */
    while (await User.exists({ username: candidate })) {
        attempt += 1;
        candidate = `${base}${Math.floor(Math.random() * 10000)}`;
        if (attempt > 25) {
            candidate = `user${Date.now()}`;
            break;
        }
    }
    /* eslint-enable no-await-in-loop */
    return candidate;
};

/**
 * Serialisasi aman untuk ditanam di dalam tag <script>.
 * Isi <script> adalah raw text (entitas HTML tidak diurai), jadi karakter
 * berbahaya di-escape sebagai \uXXXX yang tetap valid JSON.
 */
const toScriptJson = (value) => JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/** Halaman kecil untuk memindahkan token ke localStorage lalu redirect. */
const renderHandoff = (res, { token, user, error }) => {
    const payload = toScriptJson({ token: token || null, user: user || null, error: error || null });
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><title>Menghubungkan...</title>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Inter,system-ui,sans-serif;background:#0b1020;color:#fff}
.box{text-align:center}.spin{width:38px;height:38px;border:3px solid rgba(255,255,255,.2);border-top-color:#6366f1;border-radius:50%;margin:0 auto 14px;animation:s .8s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}</style></head>
<body><div class="box"><div class="spin"></div><p id="msg">Menyelesaikan proses login...</p></div>
<script id="payload" type="application/json">${payload}</script>
<script>
(function(){
  var data = JSON.parse(document.getElementById('payload').textContent);
  if (data.error || !data.token) {
    document.getElementById('msg').textContent = data.error || 'Login Google gagal.';
    setTimeout(function(){ location.href = '/login?error=' + encodeURIComponent(data.error || 'google_failed'); }, 1800);
    return;
  }
  try {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  } catch (e) {}
  location.replace('/');
})();
</script></body></html>`);
};

exports.register = async (req, res) => {
    try {
        const fullName = String(req.body.fullName || '').trim();
        const username = normalize(req.body.username);
        const email = normalize(req.body.email);
        const phoneNumber = String(req.body.phoneNumber || '').trim() || null;
        const password = String(req.body.password || '');

        if (!fullName || !username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Nama, username, email, dan password wajib diisi.' });
        }
        if (!/^[a-z0-9_]{3,20}$/.test(username)) {
            return res.status(400).json({ success: false, message: 'Username 3-20 karakter, hanya huruf, angka, dan garis bawah.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'Format email tidak valid.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password minimal 6 karakter.' });
        }

        const orConditions = [{ username }, { email }];
        if (phoneNumber) orConditions.push({ phoneNumber });

        const existingUser = await User.findOne({ $or: orConditions });
        if (existingUser) {
            let field = 'Data';
            if (existingUser.username === username) field = 'Username';
            else if (existingUser.email === email) field = 'Email';
            else field = 'Nomor HP';
            return res.status(409).json({ success: false, message: `${field} sudah terdaftar.` });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const isFirstUser = (await User.estimatedDocumentCount()) === 0;

        const newUser = await User.create({
            fullName,
            username,
            email,
            phoneNumber,
            password: hashedPassword,
            // User pertama otomatis menjadi admin agar dashboard bisa diakses.
            role: isFirstUser ? 'admin' : 'user',
            avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=6366f1&color=fff`
        });

        return res.status(201).json({
            success: true,
            message: 'Registrasi berhasil. Silakan masuk.',
            data: newUser.toPublic()
        });
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Username, email, atau nomor HP sudah terdaftar.' });
        }
        console.error('[REGISTER ERROR]', error);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat registrasi.' });
    }
};

exports.login = async (req, res) => {
    try {
        const identifier = normalize(req.body.username || req.body.identifier || req.body.email);
        const password = String(req.body.password || '');

        if (!identifier || !password) {
            return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
        }

        const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
        // Pesan sengaja disamakan agar tidak membocorkan username mana yang terdaftar.
        const invalid = { success: false, message: 'Username atau password salah.' };

        if (!user || !user.password) return res.status(401).json(invalid);
        if (user.isActive === false) {
            return res.status(403).json({ success: false, message: 'Akun Anda dinonaktifkan. Hubungi admin.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json(invalid);

        user.lastLoginAt = new Date();
        await user.save();

        return res.status(200).json({ ...sessionPayload(user), message: 'Login berhasil.' });
    } catch (error) {
        console.error('[LOGIN ERROR]', error);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat login.' });
    }
};

/** Apakah login Google tersedia (dipakai frontend untuk menyembunyikan tombol). */
exports.googleStatus = async (req, res) => {
    try {
        const settings = await getSettings();
        return res.status(200).json({
            success: true,
            data: { enabled: Boolean(settings.googleClientId && settings.googleClientSecret) }
        });
    } catch (error) {
        return res.status(200).json({ success: true, data: { enabled: false } });
    }
};

const resolveCallbackUrl = async (req) => {
    const settings = await getSettings();
    if (settings.googleCallbackUrl) return settings.googleCallbackUrl;
    const proto = req.header('x-forwarded-proto') || req.protocol;
    return `${proto}://${req.get('host')}/api/auth/google/callback`;
};

/**
 * Mulai alur OAuth Google.
 * Rute ini sebelumnya tidak pernah didaftarkan sama sekali, sehingga tombol
 * "Masuk dengan Google" selalu berujung 404.
 */
exports.googleRedirect = async (req, res) => {
    try {
        const settings = await getSettings();
        if (!settings.googleClientId || !settings.googleClientSecret) {
            return res.redirect('/login?error=' + encodeURIComponent('Login Google belum dikonfigurasi admin.'));
        }

        const state = crypto.randomBytes(16).toString('hex');
        res.cookie('g_state', state, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 10 * 60 * 1000,
            secure: (req.header('x-forwarded-proto') || req.protocol) === 'https'
        });

        const params = new URLSearchParams({
            client_id: settings.googleClientId,
            redirect_uri: await resolveCallbackUrl(req),
            response_type: 'code',
            scope: 'openid email profile',
            state,
            prompt: 'select_account',
            access_type: 'online'
        });

        return res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
    } catch (error) {
        console.error('[GOOGLE REDIRECT ERROR]', error);
        return res.redirect('/login?error=' + encodeURIComponent('Gagal memulai login Google.'));
    }
};

/** Tukar authorization code menjadi profil Google, lalu buat/ambil user lokal. */
exports.googleCallback = async (req, res) => {
    try {
        const { code, state, error: oauthError } = req.query;

        if (oauthError) return renderHandoff(res, { error: 'Login Google dibatalkan.' });
        if (!code) return renderHandoff(res, { error: 'Kode otorisasi Google tidak diterima.' });

        const expectedState = req.cookies ? req.cookies.g_state : null;
        if (expectedState && state !== expectedState) {
            return renderHandoff(res, { error: 'Verifikasi keamanan gagal. Silakan ulangi.' });
        }
        res.clearCookie('g_state');

        const settings = await getSettings();
        if (!settings.googleClientId || !settings.googleClientSecret) {
            return renderHandoff(res, { error: 'Login Google belum dikonfigurasi admin.' });
        }

        const tokenRes = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
            code: String(code),
            client_id: settings.googleClientId,
            client_secret: settings.googleClientSecret,
            redirect_uri: await resolveCallbackUrl(req),
            grant_type: 'authorization_code'
        }).toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 20000
        });

        const profileRes = await axios.get(GOOGLE_USERINFO_URL, {
            headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
            timeout: 20000
        });

        const profile = profileRes.data || {};
        if (!profile.sub || !profile.email) {
            return renderHandoff(res, { error: 'Profil Google tidak lengkap.' });
        }
        if (profile.email_verified === false) {
            return renderHandoff(res, { error: 'Email Google Anda belum terverifikasi.' });
        }

        const user = await findOrCreateGoogleUser(profile);
        if (user.isActive === false) {
            return renderHandoff(res, { error: 'Akun Anda dinonaktifkan. Hubungi admin.' });
        }

        const payload = sessionPayload(user);
        return renderHandoff(res, { token: payload.token, user: payload.user });
    } catch (error) {
        console.error('[GOOGLE CALLBACK ERROR]', error.response ? error.response.data : error.message);
        return renderHandoff(res, { error: 'Login Google gagal. Silakan coba lagi.' });
    }
};

async function findOrCreateGoogleUser(profile) {
    const email = normalize(profile.email);

    let user = await User.findOne({ googleId: profile.sub });
    if (!user) user = await User.findOne({ email });

    if (user) {
        // Tautkan akun email yang sudah ada ke Google.
        let changed = false;
        if (!user.googleId) { user.googleId = profile.sub; changed = true; }
        if (profile.picture && user.avatarUrl && user.avatarUrl.includes('ui-avatars.com')) {
            user.avatarUrl = profile.picture;
            changed = true;
        }
        if (changed) { /* profil disegarkan dari Google */ }
        user.lastLoginAt = new Date();
        await user.save();
        return user;
    }

    const isFirstUser = (await User.estimatedDocumentCount()) === 0;
    return User.create({
        fullName: profile.name || email.split('@')[0],
        username: await buildUniqueUsername(email.split('@')[0]),
        email,
        phoneNumber: null,
        password: null,
        googleId: profile.sub,
        avatarUrl: profile.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=6366f1&color=fff`,
        role: isFirstUser ? 'admin' : 'user',
        lastLoginAt: new Date()
    });
}

/** Alur alternatif untuk Google Sign-In di sisi klien (kirim id_token). */
exports.googleToken = async (req, res) => {
    try {
        const idToken = String(req.body.credential || req.body.id_token || '');
        if (!idToken) return res.status(400).json({ success: false, message: 'Token Google tidak dikirim.' });

        const settings = await getSettings();
        const { data: profile } = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
            params: { id_token: idToken },
            timeout: 15000
        });

        if (!profile || !profile.sub) {
            return res.status(401).json({ success: false, message: 'Token Google tidak valid.' });
        }
        if (settings.googleClientId && profile.aud !== settings.googleClientId) {
            return res.status(401).json({ success: false, message: 'Token Google bukan untuk aplikasi ini.' });
        }

        const user = await findOrCreateGoogleUser(profile);
        if (user.isActive === false) {
            return res.status(403).json({ success: false, message: 'Akun Anda dinonaktifkan.' });
        }

        return res.status(200).json({ ...sessionPayload(user), message: 'Login Google berhasil.' });
    } catch (error) {
        console.error('[GOOGLE TOKEN ERROR]', error.response ? error.response.data : error.message);
        return res.status(500).json({ success: false, message: 'Login Google gagal.' });
    }
};

/** Setel/ubah password (berguna untuk akun yang dibuat lewat Google). */
exports.changePassword = async (req, res) => {
    try {
        const currentPassword = String(req.body.currentPassword || '');
        const newPassword = String(req.body.newPassword || '');

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });

        if (user.password) {
            const ok = await bcrypt.compare(currentPassword, user.password);
            if (!ok) return res.status(401).json({ success: false, message: 'Password lama salah.' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return res.status(200).json({ success: true, message: 'Password berhasil diperbarui.' });
    } catch (error) {
        console.error('[CHANGE PASSWORD ERROR]', error);
        return res.status(500).json({ success: false, message: 'Gagal memperbarui password.' });
    }
};
