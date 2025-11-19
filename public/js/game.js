const socket = io();
let myPlayerIndex = null;
let currentState = null;

// Elementos DOM
const boardElement = document.getElementById('game-board');
const rollDiceBtn = document.getElementById('roll-dice-btn');
const playerTurnElement = document.getElementById('current-player');
const diceRollElement = document.getElementById('dice-roll');
const p1PiecesContainer = document.getElementById('p1-pieces');
const p2PiecesContainer = document.getElementById('p2-pieces');
const statusMsg = document.getElementById('game-status-msg');

const BOARD_LAYOUT = [
    'p1-4', 'c-1', 'p2-4',
    'p1-3', 'c-2', 'p2-3',
    'p1-2', 'c-3', 'p2-2',
    'p1-1', 'c-4', 'p2-1',
    null,   'c-5', null,
    null,   'c-6', null,
    'p1-6', 'c-7', 'p2-6',
    'p1-5', 'c-8', 'p2-5'
];
const rosetteCells = ['p1-4', 'p2-4', 'c-4', 'p1-6', 'p2-6'];

// --- SOCKET LISTENERS ---

// 1. Entrando na sala
socket.on('init-game', (data) => {
    myPlayerIndex = data.playerIndex;
    if (myPlayerIndex === -1) {
        alert('Modo Espectador (Sala Cheia)');
        document.title = `Royal Game of Ur - Espectador`;
    } else {
        alert(`Você é o Jogador ${myPlayerIndex}`);
        document.title = `Royal Game of Ur - Jogador ${myPlayerIndex}`;
    }
    renderGame(data.gameState);
});

// 2. Recebendo atualização do servidor
socket.on('update-state', (newState) => {
    renderGame(newState);
});

// --- INTERAÇÃO DO USUÁRIO ---

// Botão de Dados
rollDiceBtn.addEventListener('click', () => {
    // Não calculamos nada aqui, só pedimos ao servidor
    socket.emit('roll-dice');
});

// Clique na Peça
function handlePieceClick(event) {
    const pieceIndex = parseInt(event.currentTarget.dataset.pieceIndex);
    const playerOwner = parseInt(event.currentTarget.dataset.player);

    // Validação visual básica: só envia se for minha peça e minha vez
    if (playerOwner === myPlayerIndex && currentState.phase === 'move') {
        socket.emit('move-piece', pieceIndex);
    }
}

// --- RENDERIZAÇÃO (DESENHAR O ESTADO) ---

function renderGame(state) {
    currentState = state;

    // Atualiza HUD
    playerTurnElement.textContent = state.currentPlayer;
    diceRollElement.textContent = state.diceResult;

    // Se existir lastAction, mostra. Se não, limpa.
    const msgElement = document.getElementById('game-message');
    if (msgElement) {
        msgElement.textContent = state.lastAction || '';
    }

    // Habilita/Desabilita Botão
    const isMyTurn = (myPlayerIndex === state.currentPlayer);
    rollDiceBtn.disabled = !(isMyTurn && state.phase === 'roll');

    // Mensagem de vitória
    if (state.winner) {
        alert(`JOGADOR ${state.winner} VENCEU!`);
    }

    // Renderiza Tabuleiro
    boardElement.innerHTML = '';
    p1PiecesContainer.innerHTML = '';
    p2PiecesContainer.innerHTML = '';

    // Cria células
    BOARD_LAYOUT.forEach(cellId => {
        const cell = document.createElement('div');
        if (cellId) {
            cell.classList.add('cell');
            if (rosetteCells.includes(cellId)) cell.classList.add('rosette');
            
            // Verifica se tem peça nessa célula no estado do servidor
            if (state.board[cellId]) {
                const pieceInfo = state.board[cellId];
                const piece = createPieceElement(pieceInfo.player, pieceInfo.pieceIndex, state);
                cell.appendChild(piece);
            }
        } else {
            cell.classList.add('empty-space');
        }
        boardElement.appendChild(cell);
    });

    // Renderiza peças na base (que ainda não entraram: valor -1)
    renderWaitingPieces(1, state.player1, p1PiecesContainer, state);
    renderWaitingPieces(2, state.player2, p2PiecesContainer, state);
}

function createPieceElement(player, pieceIndex, state) {
    const piece = document.createElement('div');
    piece.classList.add('piece', `player${player}`);
    piece.dataset.player = player;
    piece.dataset.pieceIndex = pieceIndex;

    // Verifica se a peça pode se mover para dar highlight
    // (Lógica visual: se é minha vez, fase de movimento, e é minha peça)
    if (state.phase === 'move' && 
        state.currentPlayer === player && 
        state.currentPlayer === myPlayerIndex &&
        state.validMoves && state.validMoves.includes(pieceIndex)) {
            
        piece.classList.add('movable'); 
        piece.addEventListener('click', handlePieceClick);
    }

    return piece;
}

function renderWaitingPieces(player, playerData, container, state) {
    playerData.pieces.forEach((pos, pieceIndex) => {
        if (pos === -1) { // -1 significa na base
            const piece = createPieceElement(player, pieceIndex, state);
            container.appendChild(piece);
        }
    });
}

// --- LÓGICA DE TEMA (Mantida do passo anterior) ---
const themeBtn = document.getElementById('theme-toggle');
const body = document.body;
if (localStorage.getItem('theme') === 'dark') body.classList.add('dark-mode');
if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
    });
}