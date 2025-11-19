const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// ROTA: Registrar
router.post('/register', async (req, res) => {
    console.log('Tentativa de Registro:', req.body); // <--- LOG NOVO
    try {
        const { username, password } = req.body;
        
        // Validação básica
        if (!username || !password) {
            return res.send('<script>alert("Preencha tudo!"); window.location.href="/login";</script>');
        }

        const userExists = await User.findOne({ username });
        if (userExists) {
            console.log('Usuário já existe'); // <--- LOG NOVO
            return res.send('<script>alert("Usuário já existe!"); window.location.href="/login";</script>');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        console.log('Usuário criado com sucesso:', newUser._id); // <--- LOG NOVO

        req.session.userId = newUser._id;
        req.session.username = newUser.username;
        
        res.redirect('/game');
    } catch (err) {
        console.error('Erro no registro:', err);
        res.redirect('/login');
    }
});

// ROTA: Login
router.post('/login', async (req, res) => {
    console.log('Tentativa de Login:', req.body); // <--- LOG NOVO
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        
        if (!user) {
            console.log('Usuário não encontrado no banco');
            return res.send('<script>alert("Usuário não encontrado!"); window.location.href="/login";</script>');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('Senha incorreta');
            return res.send('<script>alert("Senha incorreta!"); window.location.href="/login";</script>');
        }

        console.log('Login Sucesso! Sessão iniciada para:', user.username);
        req.session.userId = user._id;
        req.session.username = user.username;

        res.redirect('/game');
    } catch (err) {
        console.error('Erro no login:', err);
        res.redirect('/login');
    }
});

// ROTA: Logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

module.exports = router;