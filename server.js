const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const authRoutes = require('./src/routes/auth');
const RoyalGameOfUr = require('./src/gameLogic');
const User = require('./src/models/User');
const Match = require('./src/models/Match');

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
app.get('/game', async (req, res) => {
    // Verifica permissão (Bot, Sala ou Login)
    if (req.query.mode === 'bot' || req.query.room || req.session.userId) {
        
        let user = null;
        if (req.session.userId) {
            user = await User.findById(req.session.userId);
        }
        
        // Manda o usuário para o front (se existir)
        return res.render('game.html', { user });
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
    const roomIdParam = socket.handshake.query.roomId;
    const username = socket.handshake.query.username;
    
    socket.data.username = username;

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
        const roomData = games.get(roomIdParam);
        
        if (roomData) {
            socket.join(roomIdParam);
            
            // Pega o nome que salvamos no início da conexão
            const userName = socket.data.username || 'Visitante';
            const numClients = io.sockets.adapter.rooms.get(roomIdParam)?.size || 0;
            
            if (numClients === 1) {
                // J1 Re-entrando ou Host
                if (!roomData.j1Socket) roomData.j1Socket = socket.id; 
                
                socket.emit('init-game', { playerIndex: 1, gameState: roomData.game.getState() });
                
                // Avisa se for reconexão (opcional) ou apenas entrada
                // Geralmente J1 cria a sala, então não precisa avisar "entrou", 
                // mas se ele caiu e voltou, é bom avisar.
                io.to(roomIdParam).emit('receive-chat', { 
                    msg: `${userName} (J1) conectou.`, 
                    senderName: "Sistema", 
                    username: "System" 
                });
                
            } else if (numClients === 2) {
                // J2 Entrando
                roomData.j2Socket = socket.id;
                
                socket.emit('init-game', { playerIndex: 2, gameState: roomData.game.getState() });
                
                // AVISO PERSONALIZADO
                io.to(roomIdParam).emit('receive-chat', { 
                    msg: `${userName} entrou como Desafiante!`, 
                    senderName: "Sistema", 
                    username: "System" 
                });

            } else {
                // Espectador
                socket.emit('init-game', { playerIndex: -1, gameState: roomData.game.getState() });
                
                // AVISO PERSONALIZADO PARA ESPECTADOR
                io.to(roomIdParam).emit('receive-chat', { 
                    msg: `${userName} está assistindo.`, 
                    senderName: "Sistema", 
                    username: "System" 
                });
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
            hostId: socket.id,
            j1Socket: socket.id
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

            if (newState.winner) {
                handleGameEnd(roomId, newState, roomData);
            }
            else if (roomData.type === 'bot' && newState.currentPlayer === 2) {
                playBotTurn(roomId, game);
            }
        }
    });
    
    // --- CHAT ---
    socket.on('send-chat', (msg) => {
        const roomId = getSocketGameRoom(socket);
        if (!roomId) return;

        const safeMsg = String(msg).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        // Nome de Exibição (Pode ser "Jogador 1", "Ruan", etc)
        // Tenta pegar o username salvo, ou usa "Anônimo"
        const username = socket.data.username || 'Anônimo';
        
        // Identifica se é J1, J2 ou Espectador para fins de exibição no chat
        let displayLabel = username; 

        io.to(roomId).emit('receive-chat', {
            msg: safeMsg,
            senderName: displayLabel, // O nome que aparece escrito
            username: username        // O ID único para saber se fui eu
        });
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        const roomId = getSocketGameRoom(socket);
        const userName = socket.data.username || 'Alguém';

        if (roomId) {
            // AVISO PERSONALIZADO DE SAÍDA
            io.to(roomId).emit('receive-chat', { 
                msg: `${userName} saiu da sala.`, 
                senderName: "Sistema", 
                username: "System" 
            });
            
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

// Lógica do Bot (IA)
const playBotTurn = (roomId, gameInstance) => {
    // 1. Segurança: Verifica se a sala ainda existe
    if (!games.has(roomId)) return;

    // Delay inicial para rolar os dados (simula "pensar")
    setTimeout(() => {
        // Verifica novamente antes de agir (caso a sala tenha sido deletada no delay)
        if (!games.has(roomId)) return;

        const rollState = gameInstance.rollDice();
        io.to(roomId).emit('update-state', rollState);

        // Se o bot puder mover (fase 'move')
        if (rollState.phase === 'move') {
            
            // Delay secundário para escolher a peça
            setTimeout(() => {
                if (!games.has(roomId)) return;

                const bestMove = gameInstance.getBotMove();
                
                if (bestMove !== null) {
                    const moveState = gameInstance.movePiece(bestMove);
                    io.to(roomId).emit('update-state', moveState);
                    
                    // --- VERIFICAÇÃO DE VITÓRIA (CRUCIAL) ---
                    if (moveState.winner) {
                        const roomData = games.get(roomId);
                        handleGameEnd(roomId, moveState, roomData);
                        return; // Para a execução aqui, o jogo acabou
                    }

                    // Se caiu na Roseta (ainda é a vez dele), joga de novo
                    if (moveState.currentPlayer === 2) {
                        playBotTurn(roomId, gameInstance); // Recursão
                    }
                }
            }, 1000); // Delay do movimento (1 segundo)
        } else {
             // Se tirou 0 ou não tem movimentos válidos
             // Se por acaso ainda for a vez dele (ex: regra específica), tenta de novo
             if (rollState.currentPlayer === 2) {
                 playBotTurn(roomId, gameInstance);
             }
        }
    }, 1000); // Delay dos dados (1 segundo)
};

async function handleGameEnd(roomId, gameState, roomData) {
    if (!gameState.winner) return;

    console.log(`🏆 Jogo ${roomId} acabou! Vencedor: Jogador ${gameState.winner}`);

    // 1. Identificar nomes dos jogadores
    // (Em produção, buscaríamos os User Objects reais pelos socket IDs)
    // Aqui vamos usar os nomes que salvamos no socket.data se possível, ou genéricos
    
    // Precisamos acessar os sockets conectados na sala para pegar os nomes
    const sockets = await io.in(roomId).fetchSockets();
    let p1Name = "Jogador 1";
    let p2Name = roomData.type === 'bot' ? "Robô" : "Jogador 2";

    sockets.forEach(s => {
        if (s.id === roomData.j1Socket) p1Name = s.data.username;
        if (s.id === roomData.j2Socket) p2Name = s.data.username;
    });

    const winnerName = gameState.winner === 1 ? p1Name : p2Name;

    // 2. Salvar no MongoDB
    try {
        const match = new Match({
            player1: p1Name,
            player2: p2Name,
            winner: winnerName,
            mode: roomData.type
        });
        await match.save();
        console.log("✅ Partida salva no histórico!");

        // 3. Atualizar status dos usuários (Opcional/Avançado)
        // Se p1Name for um usuário real, User.findOneAndUpdate(...)
        // Vamos fazer isso se o nome não for "Visitante_..."
        if (!p1Name.startsWith('Visitante')) {
            await User.findOneAndUpdate({ username: p1Name }, { 
                $inc: { matchesPlayed: 1, matchesWon: (gameState.winner === 1 ? 1 : 0) } 
            });
        }
        if (!p2Name.startsWith('Visitante') && roomData.type !== 'bot') {
             await User.findOneAndUpdate({ username: p2Name }, { 
                $inc: { matchesPlayed: 1, matchesWon: (gameState.winner === 2 ? 1 : 0) } 
            });
        }

    } catch (err) {
        console.error("Erro ao salvar partida:", err);
    }
    
    // Não deletamos a sala imediatamente para eles verem a mensagem de vitória
    // Mas removemos da lista pública para ninguém mais entrar
    if (roomData.type === 'public') {
        roomData.type = 'finished'; // Tira da lista do lobby
        io.emit('lobby-list', getPublicRooms());
    }
}

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Servidor rodando: http://localhost:${PORT}`);
});