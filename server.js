const express = require('express');
const helmet = require('helmet');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin'); // Rota de Admin
const RoyalGameOfUr = require('./src/gameLogic');
const User = require('./src/models/User');
const Match = require('./src/models/Match'); // Model de Partidas

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// --- MIDDLEWARES ---
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(express.urlencoded({ extended: true })); 
app.use(express.json());
app.use(session({
    secret: 'segredo-super-secreto-royal-ur',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'src/views'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

// --- ROTAS ---
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// ROTA HOME (Com Ranking e User)
app.get('/', async (req, res) => {
    let user = null;
    if (req.session.userId) {
        user = await User.findById(req.session.userId);
    }

    // Busca Top 5 para o Widget
    const topRanking = await User.find({ isAdmin: { $ne: true } }, 'username matchesWon')
                                 .sort({ matchesWon: -1 })
                                 .limit(5);

    res.render('index.html', { user, ranking: topRanking });
});

// ROTA LOGIN (ESSA ESTAVA FALTANDO!)
app.get('/login', (req, res) => res.render('login.html'));

// ROTA PERFIL
app.get('/profile', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const user = await User.findById(req.session.userId);
    res.render('profile.html', { user });
});

// ROTA LOBBY
app.get('/lobby', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const user = await User.findById(req.session.userId);
    res.render('lobby.html', { user });
});

// ROTA RANKING COMPLETO
app.get('/ranking', async (req, res) => {
    try {
        const topPlayers = await User.find({ isAdmin: { $ne: true } }, 'username matchesWon matchesPlayed')
                                     .sort({ matchesWon: -1 })
                                     .limit(20); // Top 20 na página dedicada

        let currentUser = null;
        if (req.session.userId) {
            currentUser = await User.findById(req.session.userId);
        }

        res.render('ranking.html', { ranking: topPlayers, user: currentUser });
    } catch (err) {
        res.redirect('/');
    }
});

// ROTA DO JOGO
app.get('/game', async (req, res) => {
    // Entra se: Modo Bot OU Tem Sala (Espectador) OU Está Logado
    if (req.query.mode === 'bot' || req.query.room || req.session.userId) {
        
        let user = null;
        if (req.session.userId) {
            user = await User.findById(req.session.userId);
        }
        
        return res.render('game.html', { user });
    }
    res.redirect('/login');
});

// --- BANCO DE DADOS ---
mongoose.connect('mongodb://127.0.0.1/royal_ur_db')
    .then(() => console.log('📦 MongoDB Conectado!'))
    .catch(err => console.error('❌ Erro Mongo:', err));


// ============================================================
// GAME MANAGER (SOCKET.IO)
// ============================================================

const games = new Map(); 

// Auxiliar: Pega ID da sala do socket
function getSocketGameRoom(socket) {
    for (const room of socket.rooms) {
        if (room.startsWith('room_')) return room;
    }
    return null;
}

// Auxiliar: Lista salas públicas para o Lobby
function getPublicRooms() {
    return Array.from(games.entries())
        .filter(([id, data]) => data.type === 'public')
        .map(([id, data]) => {
            const roomSize = io.sockets.adapter.rooms.get(id)?.size || 0;
            let status = 'waiting';
            let label = 'Aguardando Oponente';
            
            if (roomSize >= 2) {
                status = 'playing';
                label = 'Em Andamento';
            }
            const spectators = Math.max(0, roomSize - 2);

            return { id, name: data.name, status, label, count: roomSize, spectators };
        });
}

// Auxiliar: Salvar Fim de Jogo
async function handleGameEnd(roomId, gameState, roomData) {
    if (!gameState.winner) return;
    
    // PEGA OS NOMES QUE SALVAMOS NO INÍCIO (MUITO MAIS SEGURO)
    const p1Name = roomData.p1Name || "Jogador 1";
    const p2Name = roomData.p2Name || (roomData.type === 'bot' ? "Robô" : "Jogador 2");

    console.log(`🏆 Jogo ${roomId} acabou! Vencedor: ${gameState.winner} (${gameState.winner === 1 ? p1Name : p2Name})`);

    const winnerName = gameState.winner === 1 ? p1Name : p2Name;

    try {
        const match = new Match({
            player1: p1Name,
            player2: p2Name,
            winner: winnerName,
            mode: roomData.type
        });
        await match.save();

        const isBotGame = (roomData.type === 'bot');

        // ATUALIZA JOGADOR 1
        if (p1Name !== 'Visitante' && !p1Name.startsWith('Visitante')) {
            const update = { $inc: {} };
            if (isBotGame) {
                update.$inc.botMatchesPlayed = 1;
                if (gameState.winner === 1) update.$inc.botWins = 1;
            } else {
                update.$inc.matchesPlayed = 1;
                if (gameState.winner === 1) update.$inc.matchesWon = 1;
            }
            await User.findOneAndUpdate({ username: p1Name }, update);
        }

        // ATUALIZA JOGADOR 2
        if (p2Name !== 'Visitante' && !p2Name.startsWith('Visitante') && !isBotGame) {
             const update = { $inc: { matchesPlayed: 1 } };
             if (gameState.winner === 2) update.$inc.matchesWon = 1;
             await User.findOneAndUpdate({ username: p2Name }, update);
        }

    } catch (err) {
        console.error("Erro ao salvar partida:", err);
    }
    
    if (roomData.type === 'public') {
        roomData.type = 'finished';
        io.emit('lobby-list', getPublicRooms());
    }
}

// --- SOCKET CONNECTION ---
io.on('connection', (socket) => {
    const mode = socket.handshake.query.mode;
    const roomIdParam = socket.handshake.query.roomId;
    const username = socket.handshake.query.username;

    // Salva o nome na sessão do socket
    socket.data.username = username;

    // --- 1. ENTRADA NA SALA ---
    if (mode === 'bot') {
        const roomId = `room_bot_${socket.id}`;
        const newGame = new RoyalGameOfUr();
        const uName = socket.data.username || 'Visitante';

        games.set(roomId, { 
            game: newGame, 
            players: [], 
            type: 'bot', 
            j1Socket: socket.id, 
            p1Name: uName,
            p2Name: 'Robô'
        });
        
        socket.join(roomId);
        socket.emit('init-game', { playerIndex: 1, gameState: newGame.getState() });
    } 
    else if (roomIdParam) {
        const roomData = games.get(roomIdParam);
        if (roomData) {
            socket.join(roomIdParam);
            const numClients = io.sockets.adapter.rooms.get(roomIdParam)?.size || 0;
            
            // Identifica usuário para mensagens
            const uName = username || 'Visitante';

            if (numClients === 1) {
                // Host ou Reconnect J1
                if (!roomData.j1Socket) roomData.j1Socket = socket.id;
                socket.emit('init-game', { playerIndex: 1, gameState: roomData.game.getState() });
                
            } else if (numClients === 2) {
                // J2 Entrou
                roomData.j2Socket = socket.id;
                roomData.p2Name = uName;
                socket.emit('init-game', { playerIndex: 2, gameState: roomData.game.getState() });
                io.to(roomIdParam).emit('receive-chat', { msg: `${uName} entrou para jogar!`, senderName: "Sistema", username: "System" });
            } else {
                // Espectador
                socket.emit('init-game', { playerIndex: -1, gameState: roomData.game.getState() });
                io.to(roomIdParam).emit('receive-chat', { msg: `${uName} está assistindo.`, senderName: "Sistema", username: "System" });
            }
        }
    }

    // --- 2. LOBBY EVENTS ---
    socket.on('create-room', (roomName) => {
        const roomId = `room_public_${Date.now()}`;
        const newGame = new RoyalGameOfUr();
        
        const uName = socket.data.username || 'Visitante';

        games.set(roomId, { 
            game: newGame, 
            name: roomName || `Sala ${roomId}`,
            type: 'public',
            hostId: socket.id,
            j1Socket: socket.id,
            p1Name: uName,
            p2Name: null
        });
        
        socket.emit('room-created', roomId);
        io.emit('lobby-list', getPublicRooms());
    });

    socket.on('request-lobby', () => {
        socket.emit('lobby-list', getPublicRooms());
    });

    // --- 3. GAME EVENTS ---
    socket.on('roll-dice', () => {
        const roomId = getSocketGameRoom(socket);
        if (!roomId) return;
        const roomData = games.get(roomId);
        if (!roomData) return;

        const game = roomData.game;
        const newState = game.rollDice();
        
        if (newState) {
            io.to(roomId).emit('update-state', newState);
            if (roomData.type === 'bot' && newState.currentPlayer === 2) playBotTurn(roomId, game);
        }
    });

    socket.on('move-piece', (pieceIndex) => {
        const roomId = getSocketGameRoom(socket);
        if (!roomId) return;
        const roomData = games.get(roomId);
        if (!roomData) return;

        const game = roomData.game;
        const newState = game.movePiece(pieceIndex);
        
        if (newState) {
            io.to(roomId).emit('update-state', newState);
            
            // Vitória
            if (newState.winner) {
                handleGameEnd(roomId, newState, roomData);
            }
            // Turno do Bot
            else if (roomData.type === 'bot' && newState.currentPlayer === 2) {
                playBotTurn(roomId, game);
            }
        }
    });

    // --- 4. CHAT ---
    socket.on('send-chat', (msg) => {
        const roomId = getSocketGameRoom(socket);
        if (!roomId) return;
        const roomData = games.get(roomId);
        if (!roomData) return;

        const safeMsg = String(msg).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const uName = socket.data.username || 'Anônimo';
        let senderLabel = uName;

        io.to(roomId).emit('receive-chat', {
            msg: safeMsg,
            senderName: senderLabel,
            username: uName
        });
    });

    // --- 5. DISCONNECT ---
    socket.on('disconnect', () => {
        const roomId = getSocketGameRoom(socket);
        if (roomId) {
            const uName = socket.data.username || 'Alguém';
            io.to(roomId).emit('receive-chat', { msg: `${uName} saiu.`, senderName: "Sistema", username: "System" });
            
            const roomData = games.get(roomId);
            if (roomData) {
                const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
                if (roomData.type === 'bot' || roomSize === 0) {
                    games.delete(roomId);
                }
            }
        }
        io.emit('lobby-list', getPublicRooms());
    });
});

// --- BOT LOGIC ---
const playBotTurn = (roomId, gameInstance) => {
    if (!games.has(roomId)) return;
    setTimeout(() => {
        if (!games.has(roomId)) return;
        const rollState = gameInstance.rollDice();
        io.to(roomId).emit('update-state', rollState);

        if (rollState.phase === 'move') {
            setTimeout(() => {
                if (!games.has(roomId)) return;
                const bestMove = gameInstance.getBotMove();
                if (bestMove !== null) {
                    const moveState = gameInstance.movePiece(bestMove);
                    io.to(roomId).emit('update-state', moveState);
                    
                    if (moveState.winner) {
                        const rData = games.get(roomId);
                        handleGameEnd(roomId, moveState, rData);
                        return;
                    }
                    if (moveState.currentPlayer === 2) playBotTurn(roomId, gameInstance);
                }
            }, 1000);
        } else {
             if (rollState.currentPlayer === 2) playBotTurn(roomId, gameInstance);
        }
    }, 1000);
};

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Servidor rodando: http://localhost:${PORT}`);
});