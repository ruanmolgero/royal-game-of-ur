const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    // Estatísticas do Jogo
    matchesPlayed: { type: Number, default: 0 },
    matchesWon: { type: Number, default: 0 },
    
    // Configurações Visuais (Opcional, para salvar o tema)
    preferences: {
        theme: { type: String, default: 'light' }
    }
});

module.exports = mongoose.model('User', UserSchema);