const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const RoyalGameOfUr = require('./src/gameLogic');

const game = new RoyalGameOfUr();

// 1. Configuração do Front-End (Arquivos Estáticos)
// Diz pro Express: "Tudo que estiver na pasta public, pode entregar pro navegador"
app.use(express.static(path.join(__dirname, 'public')));

// 2. Configuração das Views (HTML)
// Diz pro Express onde estão seus arquivos HTML
app.set('views', path.join(__dirname, 'src/views'));
// Diz pro Express usar HTML simples como "engine" (para não precisarmos renomear para .ejs agora)
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

// --- ROUTES ---
app.get('/', (req, res) => res.render('index.html'));
app.get('/game', (req, res) => res.render('game.html'));

// --- GAME ROOM STATE ---
let players = { 1: null, 2: null };

// Socket.io Logic (Communication)
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. Gerenciamento de Vagas (Igual antes)
    let playerIndex = null;
    if (players[1] === null) {
        players[1] = socket.id;
        playerIndex = 1;
    } else if (players[2] === null) {
        players[2] = socket.id;
        playerIndex = 2;
    }

    // 2. Informa o jogador quem ele é e o ESTADO ATUAL do jogo
    if (playerIndex !== null) {
        socket.emit('init-game', { 
            playerIndex: playerIndex, 
            gameState: game.getState() // Manda o estado atual para quem entrou renderizar
        });
    } else {
        socket.emit('init-game', { playerIndex: -1, gameState: game.getState() });
    }

    // 3. Eventos do Jogo (Recebe intenções, processa e devolve estado)
    
    socket.on('roll-dice', () => {
        // Segurança: Só deixa jogar se for a vez de quem pediu
        if (game.getState().currentPlayer !== playerIndex) return;
        
        const newState = game.rollDice();
        if (newState) {
            io.emit('update-state', newState); // Avisa TODOS que o estado mudou
        }
    });

    socket.on('move-piece', (pieceIndex) => {
        // Segurança: Só deixa mover se for a vez de quem pediu
        if (game.getState().currentPlayer !== playerIndex) return;

        const newState = game.movePiece(pieceIndex);
        if (newState) {
            io.emit('update-state', newState);
        }
    });

    socket.on('reset-game', () => {
        // Útil para debug ou reiniciar partida
        game.resetGame();
        io.emit('update-state', game.getState());
    });

    // 4. Disconnect
    socket.on('disconnect', () => {
        if (players[1] === socket.id) players[1] = null;
        if (players[2] === socket.id) players[2] = null;
        console.log(`Player ${playerIndex} disconnected`);
    });
});

// 4. Iniciar o Servidor
const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Servidor rodando em: http://localhost:${PORT}`);
});
