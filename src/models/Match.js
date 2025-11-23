const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    player1: { type: String, required: true }, // Nome ou ID do J1
    player2: { type: String, required: true }, // Nome ou ID do J2
    winner: { type: String, required: true },  // Quem ganhou
    mode: { type: String, enum: ['bot', 'online'], default: 'online' },
    duration: { type: Number } // Em segundos (opcional, mas legal)
});

module.exports = mongoose.model('Match', MatchSchema);