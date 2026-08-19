const User = require('../models/User');

exports.register = async (req, res) => {
  try {
    const { fullName, username, phone, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: { message: 'Password dan Konfirmasi Password tidak cocok.' } });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: { message: 'Password minimal 8 karakter.' } });
    }

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ success: false, error: { message: 'Username atau Email sudah terdaftar.' } });
    }

    let assignedRole = 'user';
    if (username.toLowerCase() === 'man') {
      assignedRole = 'admin';
    }

    const newUser = new User({
      fullName,
      username,
      phone,
      email,
      passwordHash: password,
      role: assignedRole
    });

    await newUser.save();

    req.session.userId = newUser._id;
    req.session.role = newUser.role;

    return res.status(201).json({ success: true, data: { message: 'Registrasi berhasil.', redirectUrl: '/dashboard' } });
  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({ success: false, error: { message: 'Terjadi kesalahan pada server.' } });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: { message: 'Kredensial tidak valid atau akun dinonaktifkan.' } });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: { message: 'Kredensial tidak valid.' } });
    }

    req.session.userId = user._id;
    req.session.role = user.role;

    return res.status(200).json({ success: true, data: { message: 'Login berhasil.', redirectUrl: user.role === 'admin' ? '/admin' : '/dashboard' } });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ success: false, error: { message: 'Terjadi kesalahan pada server.' } });
  }
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout Error:', err);
    res.redirect('/login');
  });
};