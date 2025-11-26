const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// ROTA: Registrar novo usuário
router.post('/register', async (req, res) => {
    // LOG SEGURO: Mostra apenas o usuário, não a senha
    console.log('Tentativa de Registro para:', req.body.username); 

    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.send('<script>alert("Preencha tudo!"); window.location.href="/login";</script>');
        }

        // Verifica se já existe
        const userExists = await User.findOne({ username });
        if (userExists) {
            console.log('Registro falhou: Usuário já existe');
            return res.send('<script>alert("Usuário já existe!"); window.location.href="/login";</script>');
        }

        // Criptografa a senha (Hash)
        const hashedPassword = await bcrypt.hash(password, 10);

        // Salva no Banco
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        console.log('Usuário criado com sucesso (ID):', newUser._id);

        // CORREÇÃO DO BUG AQUI: Usamos 'newUser' e não 'user'
        req.session.userId = newUser._id;
        req.session.username = newUser.username;
        req.session.isAdmin = newUser.isAdmin; // <--- AQUI ESTAVA O ERRO
        
        res.redirect('/');
    } catch (err) {
        console.error('Erro técnico no registro:', err);
        res.redirect('/login');
    }
});

// ROTA: Login
router.post('/login', async (req, res) => {
    // LOG SEGURO
    console.log('Tentativa de Login para:', req.body.username);

    try {
        const { username, password } = req.body;

        // Busca usuário
        const user = await User.findOne({ username });
        if (!user) {
            console.log('Falha: Usuário não encontrado');
            return res.send('<script>alert("Usuário não encontrado!"); window.location.href="/login";</script>');
        }

        // Compara a senha digitada com o Hash do banco
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('Falha: Senha incorreta');
            return res.send('<script>alert("Senha incorreta!"); window.location.href="/login";</script>');
        }

        console.log('Login Sucesso! Sessão iniciada.');
        
        // Salva na sessão
        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.isAdmin = user.isAdmin;

        res.redirect('/');
    } catch (err) {
        console.error('Erro técnico no login:', err);
        res.redirect('/login');
    }
});

// ROTA: Logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// ROTA: Atualizar Perfil
router.post('/update', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');

    try {
        const { age, city, state, country, avatar } = req.body;
        
        await User.findByIdAndUpdate(req.session.userId, {
            age: age,
            location: { city, state, country },
            avatar: avatar
        });

        res.redirect('/profile');
    } catch (err) {
        console.error(err);
        res.redirect('/profile');
    }
});

module.exports = router;