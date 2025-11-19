const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const authRoutes = require('./src/routes/auth'); // Rotas de Auth
const RoyalGameOfUr = require('./src/gameLogic');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const game = new RoyalGameOfUr();

// --- 1. MIDDLEWARES ---

// Ler dados de formulários (Login/Cadastro)
app.use(express.urlencoded({ extended: true })); 
app.use(express.json());

// Configuração de Sessão
app.use(session({
    secret: 'segredo-super-secreto-royal-ur',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // False para localhost (HTTP)
}));

// Arquivos Estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Configuração de Views
app.set('views', path.join(__dirname, 'src/views'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

// --- 2. ROTAS ---

// Rotas de Autenticação (Login/Register)
app.use('/auth', authRoutes);

// Home
app.get('/', (req, res) => res.render('index.html'));

// Tela de Login
app.get('/login', (req, res) => res.render('login.html'));

// Tela do Jogo (Com Proteção Condicional)
app.get('/game', (req, res) => {
    // REGRA 1: Se for modo Bot, deixa entrar (Livre)
    if (req.query.mode === 'bot') {
        return res.render('game.html');
    }

    // REGRA 2: Se for Multiplayer, EXIGE login
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    // Se logado, entra
    res.render('game.html');
});

// --- 3. BANCO DE DADOS ---
mongoose.connect('mongodb://127.0.0.1/royal_ur_db')
    .then(() => console.log('📦 MongoDB Conectado!'))
    .catch(err => console.error('❌ Erro Mongo:', err));

// --- 4. SOCKET.IO E LÓGICA DO JOGO ---
let players = { 1: null, 2: null };
let isBotMode = false;

io.on('connection', (socket) => {
    const mode = socket.handshake.query.mode; 
    if (mode === 'bot') {
        isBotMode = true;
    }

    console.log(`User connected: ${socket.id} | Mode: ${mode}`);

    // Lógica de Vagas
    let playerIndex = null;
    if (players[1] === null) {
        players[1] = socket.id;
        playerIndex = 1;
    } else if (players[2] === null && !isBotMode) {
        players[2] = socket.id;
        playerIndex = 2;
    }

    // Envia estado inicial
    if (playerIndex !== null) {
        socket.emit('init-game', { 
            playerIndex: playerIndex, 
            gameState: game.getState() 
        });
    } else {
        socket.emit('init-game', { playerIndex: -1, gameState: game.getState() });
    }

    // Eventos do Jogo
    socket.on('roll-dice', () => {
        if (game.getState().currentPlayer !== playerIndex) return;
        const newState = game.rollDice();
        if (newState) {
            io.emit('update-state', newState);
            if (isBotMode && newState.currentPlayer === 2) playBotTurn();
        }
    });

    socket.on('move-piece', (pieceIndex) => {
        if (game.getState().currentPlayer !== playerIndex) return;
        const newState = game.movePiece(pieceIndex);
        if (newState) {
            io.emit('update-state', newState);
            if (isBotMode && newState.currentPlayer === 2) playBotTurn();
        }
    });

    socket.on('send-chat', (msg) => {
        // Se o usuário não estiver logado (Bot mode), usa "Visitante"
        // Como o socket não tem acesso direto à sessão aqui sem config extra,
        // vamos manter a lógica simples baseada no playerIndex por enquanto.
        const safeMsg = String(msg).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const senderName = playerIndex ? `Jogador ${playerIndex}` : 'Espectador';
        
        io.emit('receive-chat', {
            msg: safeMsg,
            sender: senderName,
            senderId: playerIndex
        });
    });

    socket.on('disconnect', () => {
        if (players[1] === socket.id) players[1] = null;
        if (players[2] === socket.id) players[2] = null;
    });
});

// Lógica do Bot (Fora do io.on)
const playBotTurn = () => {
    if (!isBotMode || game.getState().currentPlayer !== 2) return;
    
    setTimeout(() => {
        const rollState = game.rollDice();
        io.emit('update-state', rollState);

        if (rollState.phase === 'move') {
            setTimeout(() => {
                const bestMove = game.getBotMove();
                if (bestMove !== null) {
                    const moveState = game.movePiece(bestMove);
                    io.emit('update-state', moveState);
                    if (moveState.currentPlayer === 2 && !moveState.winner) playBotTurn();
                }
            }, 1500);
        } else {
             if (rollState.currentPlayer === 2) playBotTurn();
        }
    }, 1500);
};

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Servidor rodando em: http://localhost:${PORT}`);
});
