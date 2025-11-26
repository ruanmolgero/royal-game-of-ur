const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Middleware: Bloqueia quem não é admin
const checkAdmin = (req, res, next) => {
    if (req.session.userId && req.session.isAdmin) {
        next(); // Pode passar
    } else {
        res.status(403).send("Acesso Negado. Você não é um administrador.");
    }
};

// ROTA: Painel Principal (Lista Usuários)
router.get('/', checkAdmin, async (req, res) => {
    try {
        // Busca todos os usuários (menos a senha)
        const users = await User.find({}, '-password'); 
        res.render('admin.html', { users, currentUser: req.session.username });
    } catch (err) {
        res.send("Erro ao listar usuários");
    }
});

// ROTA: Banir (Deletar) Usuário
router.post('/delete/:id', checkAdmin, async (req, res) => {
    try {
        // Impede que o admin se delete
        if (req.params.id === req.session.userId) {
            return res.send('<script>alert("Você não pode se banir!"); window.location.href="/admin";</script>');
        }

        await User.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (err) {
        res.send("Erro ao deletar usuário");
    }
});

module.exports = router;