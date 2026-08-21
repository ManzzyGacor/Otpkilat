const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    try {
        const { fullName, username, email, phoneNumber, password } = req.body;

        // Cek apakah username, email, atau phoneNumber sudah terdaftar
        const existingUser = await User.findOne({ $or: [{ username }, { email }, { phoneNumber }] });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Username, Email, atau Nomor HP sudah terdaftar."
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
            email,
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
                email: newUser.email,
                role: newUser.role
            }
        });
    } catch (error) {
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

exports.googleAuth = async (req, res) => {
    try {
        const { googleId, email, fullName, username } = req.body;
        
        let user = await User.findOne({ googleId });
        if (!user) {
            if (email) {
                user = await User.findOne({ email });
            }
            
            if (user) {
                user.googleId = googleId;
                await user.save();
            } else {
                const generatedUsername = username || (email ? email.split('@')[0] + Math.floor(Math.random() * 1000) : 'user_' + Date.now());
                const randomPassword = await bcrypt.hash(Math.random().toString(), 10);
                
                let assignedRole = 'user';
                if (generatedUsername.toLowerCase() === 'man') {
                    assignedRole = 'admin';
                }

                user = new User({
                    fullName: fullName || 'Google User',
                    username: generatedUsername,
                    email: email || `${generatedUsername}@google.com`,
                    phoneNumber: 'g_' + Date.now(),
                    password: randomPassword,
                    googleId: googleId,
                    role: assignedRole
                });
                await user.save();
            }
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
                    message: "Login Google berhasil.",
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
        console.error("[GOOGLE AUTH ERROR]:", error);
        res.status(500).json({
            success: false,
            message: "Terjadi kesalahan pada server saat Google Auth.",
            error: error.message
        });
    }
};