const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true }, // Hash
    
    // --- NOVOS CAMPOS OBRIGATÓRIOS ---
    age: { type: Number, default: null },
    location: {
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        country: { type: String, default: 'Brasil' }
    },
    avatar: { 
        type: String, 
        default: '/assets/default-avatar.png' // Caminho para imagem padrão
    },
    
    // --- DADOS DO SISTEMA ---
    createdAt: { type: Date, default: Date.now },
    isAdmin: { type: Boolean, default: false }, // Para o CRUD de Admin futuro
    
    // Estatísticas
    matchesPlayed: { type: Number, default: 0 },
    matchesWon: { type: Number, default: 0 },

    botMatchesPlayed: { type: Number, default: 0 },
    botWins: { type: Number, default: 0 },
    
    // Configurações
    preferences: {
        theme: { type: String, default: 'light' }
    }
});

module.exports = mongoose.model('User', UserSchema);