const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    player1: { type: String, required: true },
    player2: { type: String, required: true },
    winner: { type: String, required: true },
    mode: { type: String, enum: ['bot', 'online', 'public'], default: 'online' },
    duration: { type: Number }
});

module.exports = mongoose.model('Match', MatchSchema);