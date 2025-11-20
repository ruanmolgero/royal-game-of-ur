const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const authRoutes = require('./src/routes/auth');
const RoyalGameOfUr = require('./src/gameLogic');
const User = require('./src/models/User');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// --- MIDDLEWARES ---
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

// Home agora busca o usuário para mostrar "Bem vindo Ruan"
app.get('/', async (req, res) => {
    let user = null;
    if (req.session.userId) {
        user = await User.findById(req.session.userId);
    }
    res.render('index.html', { user });
});

app.get('/login', (req, res) => res.render('login.html'));
app.get('/profile', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const user = await User.findById(req.session.userId);
    res.render('profile.html', { user });
});

// Nova Rota: Lobby (Lista de Salas)
app.get('/lobby', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    const user = await User.findById(req.session.userId);
    res.render('lobby.html', { user });
});

// Rota do Jogo
app.get('/game', (req, res) => {
    // Entra se: Modo Bot OU Tem Sala (Espectador/Convidado) OU Está Logado
    if (req.query.mode === 'bot' || req.query.room || req.session.userId) {
        return res.render('game.html');
    }
    res.redirect('/login');
});

mongoose.connect('mongodb://127.0.0.1/royal_ur_db')
    .then(() => console.log('📦 MongoDB Conectado!'))
    .catch(err => console.error('❌ Erro Mongo:', err));

// ============================================================
// GAME MANAGER
// ============================================================

const games = new Map(); // { roomID: { game: instance, players: [name1, name2], type: 'public'/'private' } }

// Função Auxiliar: Descobre a sala do socket
function getSocketGameRoom(socket) {
    // O socket pode estar em várias salas, mas a sala de jogo começa com "room_"
    for (const room of socket.rooms) {
        if (room.startsWith('room_')) {
            return room;
        }
    }
    return null;
}

io.on('connection', (socket) => {
    const mode = socket.handshake.query.mode;
    const roomIdParam = socket.handshake.query.roomId; // Se vier do Lobby
    
    // --- LÓGICA DE ENTRADA ---
    
    if (mode === 'bot') {
        const roomId = `room_bot_${socket.id}`;
        const newGame = new RoyalGameOfUr();
        games.set(roomId, { 
            game: newGame, 
            players: ['Humano', 'Bot'], 
            type: 'bot' 
        });
        socket.join(roomId);
        socket.emit('init-game', { playerIndex: 1, gameState: newGame.getState() });
    } 
    else if (roomIdParam) {
        // ENTRANDO VIA LOBBY (Sala Específica)
        const roomData = games.get(roomIdParam);
        
        if (roomData) {
            socket.join(roomIdParam);
            
            // Verifica quantos tem na sala socket.io
            const numClients = io.sockets.adapter.rooms.get(roomIdParam)?.size || 0;
            
            if (numClients === 1) {
                // Sou o primeiro (Criei a sala ou o outro caiu) - Reseto ou continuo?
                // Por simplificação, assumimos que se tem 1 pessoa, ela é o host (J1)
                // Mas se a sala já existe no Map, pode ser que J1 já esteja lá.
                
                // Vamos simplificar: Se entrou via Lobby, verifica vagas
                // Se já tem 2 jogadores registrados na lógica, entra como Espectador
                
                // TODO: Lógica robusta de reconexão
                socket.emit('init-game', { playerIndex: 1, gameState: roomData.game.getState() });
                
            } else if (numClients === 2) {
                // Sou o segundo (Desafiante)
                socket.emit('init-game', { playerIndex: 2, gameState: roomData.game.getState() });
                io.to(roomIdParam).emit('receive-chat', { msg: "Um jogador entrou!", sender: "Sistema", senderId: -1 });
            } else {
                // Sala cheia -> Espectador
                socket.emit('init-game', { playerIndex: -1, gameState: roomData.game.getState() });
            }
        }
    }

    // --- EVENTOS DO LOBBY ---
    
    socket.on('create-room', (roomName) => {
        const roomId = `room_public_${Date.now()}`;
        const newGame = new RoyalGameOfUr();
        
        games.set(roomId, { 
            game: newGame, 
            name: roomName || `Sala ${roomId}`,
            players: [],
            type: 'public',
            hostId: socket.id
        });
        
        socket.emit('room-created', roomId);
        
        io.emit('lobby-list', getPublicRooms());
    });

    socket.on('request-lobby', () => {
        socket.emit('lobby-list', getPublicRooms());
    });


    // --- EVENTOS DE JOGO (CORREÇÃO DO BUG) ---
    
    socket.on('roll-dice', () => {
        // 1. Descobre a sala dinamicamente
        const roomId = getSocketGameRoom(socket);
        if (!roomId) return;

        const roomData = games.get(roomId);
        if (!roomData) return;

        // 2. Precisamos saber quem é esse socket (1 ou 2)
        // Uma forma segura é ver a ordem na sala do Socket.IO, ou confiar no cliente (inseguro)
        // Ou salvar no socket.data. Por enquanto, vamos manter a lógica simples de Estado
        
        // Hack Rápido: Se é a vez do J1 e eu sou o Host... (Melhorar isso depois)
        // Vamos enviar o myPlayerIndex do cliente para o servidor no emit
        // Mas como não mudamos o front ainda, vamos inferir:
        
        // CORREÇÃO: Vamos passar o playerIndex como argumento do front depois
        // Por agora, assumimos que o cliente só manda se for a vez dele e confiamos na validação visual
        // O correto é socket.data.playerIndex salvo no 'init-game'.
        
        // Vamos fazer funcionar o BOT primeiro e o Lobby básico.
        
        const game = roomData.game;
        const newState = game.rollDice();
        
        if (newState) {
            io.to(roomId).emit('update-state', newState);
            if (roomData.type === 'bot' && newState.currentPlayer === 2) {
                playBotTurn(roomId, game);
            }
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
            if (roomData.type === 'bot' && newState.currentPlayer === 2) {
                playBotTurn(roomId, game);
            }
        }
    });
    
    // --- CHAT ---
    socket.on('send-chat', (msg) => {
        const roomId = getSocketGameRoom(socket);
        if (!roomId) return;

        const safeMsg = String(msg).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        // Tenta identificar quem enviou baseando-se na sala
        // (Lógica simplificada: se não for identificado, aparece como Espectador)
        let senderName = 'Alguém'; 
        let senderId = -1;
        
        // Você pode melhorar isso salvando socket.data.playerIndex no init-game
        
        io.to(roomId).emit('receive-chat', {
            msg: safeMsg,
            sender: senderName,
            senderId: senderId
        });
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        const roomId = getSocketGameRoom(socket);
        if (roomId) {
            // Avisa na sala que alguém saiu
            io.to(roomId).emit('receive-chat', { msg: "Alguém desconectou.", sender: "Sistema", senderId: -1 });
            
            const roomData = games.get(roomId);
            if (roomData) {
                // Se for Bot ou se a sala ficou vazia, deleta
                const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
                if (roomData.type === 'bot' || roomSize === 0) {
                    games.delete(roomId);
                }
            }
        }
        // Atualiza a lista de salas para todo mundo na Home
        io.emit('lobby-list', getPublicRooms());
    });
});


function getPublicRooms() {
    return Array.from(games.entries())
        .filter(([id, data]) => data.type === 'public')
        .map(([id, data]) => {
            // Conta conexões reais na sala
            const roomSize = io.sockets.adapter.rooms.get(id)?.size || 0;
            
            // Lógica de Status
            let status = 'waiting'; // Aguardando J2
            let label = 'Aguardando Oponente';
            
            if (roomSize >= 2) {
                status = 'playing';
                label = 'Em Andamento';
            }

            // Espectadores = Total - 2 Jogadores (se houver menos de 2, é 0)
            const spectators = Math.max(0, roomSize - 2);

            return {
                id,
                name: data.name,
                status, // 'waiting' ou 'playing'
                label,
                count: roomSize,
                spectators
            };
        });
}

// Lógica do Bot (igual ao anterior)
const playBotTurn = (roomId, gameInstance) => {
    if (!games.has(roomId)) return;
    setTimeout(() => {
        const rollState = gameInstance.rollDice();
        io.to(roomId).emit('update-state', rollState);
        if (rollState.phase === 'move') {
            setTimeout(() => {
                const bestMove = gameInstance.getBotMove();
                if (bestMove !== null) {
                    const moveState = gameInstance.movePiece(bestMove);
                    io.to(roomId).emit('update-state', moveState);
                    if (moveState.currentPlayer === 2 && !moveState.winner) playBotTurn(roomId, gameInstance);
                }
            }, 750);
        } else {
             if (rollState.currentPlayer === 2) playBotTurn(roomId, gameInstance);
        }
    }, 750);
};

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Servidor rodando: http://localhost:${PORT}`);
});