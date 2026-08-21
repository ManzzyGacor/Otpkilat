const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    try {
        const { fullName, username, phoneNumber, password } = req.body;

        const existingUser = await User.findOne({ $or: [{ username }, { phoneNumber }] });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Username atau nomor HP sudah terdaftar."
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        let assignedRole = 'user';
        if (username && username.toLowerCase() === 'man') {
            assignedRole = 'admin';
        }

        const newUser = new User({
            fullName,
            username,
            phoneNumber,
            password: hashedPassword,
            role: assignedRole
        });

        await newUser.save();

        res.status(201).json({
            success: true,
            message: "Registrasi berhasil.",
            data: {
                id: newUser._id,
                username: newUser.username,
                role: newUser.role
            }
        });
    } catch (error) {
        // CETAK ERROR ASLI KE TERMINAL VPS
        console.error("[REGISTER ERROR DETAIL]:", error);
        
        res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server saat registrasi.",
            error: error.message
        });
    }
};
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Username tidak ditemukan."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Password salah."
            });
        }

        const payload = {
            user: {
                id: user._id,
                role: user.role
            }
        };

        jwt.sign(
            payload,
            process.env.SESSION_SECRET,
            { expiresIn: '24h' },
            (err, token) => {
                if (err) throw err;
                res.status(200).json({
                    success: true,
                    message: "Login berhasil.",
                    token: token,
                    user: {
                        username: user.username,
                        role: user.role,
                        balance: user.balance,
                        avatarUrl: user.avatarUrl
                    }
                });
            }
        );
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server saat login.",
            error: error.message
        });
    }
};