// Captura parametros da URL
const urlParams = new URLSearchParams(window.location.search);
const gameMode = urlParams.get('mode');
const roomId = urlParams.get('room');

// Conecta passando os dados
const socket = io({
    query: {
        mode: gameMode,
        roomId: roomId,
        username: currentUser
    }
});
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

    if (gameMode === 'bot') {
        document.title = `Royal Game of Ur - VS BOT`;
        const p2Title = document.querySelector('#player2-area h3');
        if(p2Title) p2Title.textContent = "ROBÔ (J2)";
    }

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

    // 1. Atualiza Texto Superior
    playerTurnElement.textContent = state.currentPlayer;
    const msgElement = document.getElementById('game-message');
    if (msgElement) msgElement.textContent = state.lastAction || '';

    // 2. MOVER OS CONTROLES (A Mágica acontece aqui)
    const controlsNode = document.getElementById('active-turn-controls');
    const p1Slot = document.getElementById('p1-controls-slot');
    const p2Slot = document.getElementById('p2-controls-slot');

    // Torna visível
    controlsNode.style.display = 'block';

    // Move o nó HTML para o pai correto
    if (state.currentPlayer === 1) {
        p1Slot.appendChild(controlsNode);
    } else {
        p2Slot.appendChild(controlsNode);
    }

    // 3. Atualiza Visual dos Dados
    const diceTotalText = document.getElementById('dice-total-text');
    const totalRolled = state.diceResult !== null ? state.diceResult : '-';
    if (diceTotalText) diceTotalText.textContent = totalRolled;

    const diceElements = document.querySelectorAll('.tetra-die');
    if (state.diceResult !== null) {
        let marks = Array(4).fill(false);
        for(let i = 0; i < state.diceResult; i++) marks[i] = true;
        marks.sort(() => Math.random() - 0.5);

        diceElements.forEach((die, index) => {
            if (marks[index]) die.classList.add('marked');
            else die.classList.remove('marked');
        });
    } else {
        diceElements.forEach(die => die.classList.remove('marked'));
    }

    // 4. Estado do Botão
    // Habilita se for minha vez E fase de rolar
    const isMyTurn = (myPlayerIndex === state.currentPlayer);
    rollDiceBtn.disabled = !(isMyTurn && state.phase === 'roll');

    // Mensagem de vitória
    if (state.winner) alert(`JOGADOR ${state.winner} VENCEU!`);

    // 5. Renderiza Tabuleiro e Peças (Igual antes)
    boardElement.innerHTML = '';
    p1PiecesContainer.innerHTML = '';
    p2PiecesContainer.innerHTML = '';

    BOARD_LAYOUT.forEach(cellId => {
        const cell = document.createElement('div');
        if (cellId) {
            cell.classList.add('cell');
            if (rosetteCells.includes(cellId)) cell.classList.add('rosette');
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

    renderWaitingPieces(1, state.player1, p1PiecesContainer, state);
    renderWaitingPieces(2, state.player2, p2PiecesContainer, state);
}

function createPieceElement(player, pieceIndex, state) {
    const piece = document.createElement('div');
    piece.classList.add('piece', `player${player}`);
    piece.dataset.player = player;
    piece.dataset.pieceIndex = pieceIndex;

    // Lógica de Interação (apenas para o jogador atual e na fase de movimento)
    if (state.phase === 'move' && 
        state.currentPlayer === player && 
        state.currentPlayer === myPlayerIndex) {
            
        // CASO 1: Movimento Válido (Verde)
        if (state.validMoves && state.validMoves.includes(pieceIndex)) {
            piece.classList.add('movable'); 
            piece.addEventListener('click', handlePieceClick);
        } 
        // CASO 2: Movimento Inválido com Razão (Vermelho)
        else if (state.moveDiagnostics && state.moveDiagnostics[pieceIndex]) {
            piece.classList.add('invalid-move');
            
            // Salva a mensagem no elemento para usar no hover
            piece.dataset.errorMsg = state.moveDiagnostics[pieceIndex];
            
            // Eventos do Tooltip
            piece.addEventListener('mouseenter', showTooltip);
            piece.addEventListener('mouseleave', hideTooltip);
            piece.addEventListener('mousemove', moveTooltip); // Para seguir o mouse
        }
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

// ============================================================
// SISTEMA DE CHAT
// ============================================================

const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const chatContainer = document.getElementById('chat-container');
const toggleChatBtn = document.getElementById('toggle-chat');
const chatHeader = document.getElementById('chat-header');

// 1. Enviar mensagem (Do Cliente para o Servidor)
if (chatForm) { // Verifica se o chat existe na página
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Evita recarregar a página
        const text = chatInput.value.trim();
        
        // Só envia se tiver texto
        if (text) {
            socket.emit('send-chat', text);
            chatInput.value = ''; // Limpa o campo
        }
    });
}

// 2. Receber mensagem
socket.on('receive-chat', (data) => {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    
    // Caso especial para Mensagens de Sistema
    if (data.username === "System") {
        msgDiv.classList.add('system');
        msgDiv.textContent = data.msg; // Só o texto, sem "Sistema:" antes
    } 
    // Minha mensagem
    else if (data.username === currentUser) {
        msgDiv.classList.add('my-message');
        msgDiv.textContent = data.msg;
    } 
    // Mensagem dos outros
    else {
        const senderSpan = document.createElement('strong');
        senderSpan.textContent = data.senderName + ': ';
        msgDiv.appendChild(senderSpan);
        msgDiv.appendChild(document.createTextNode(data.msg));
    }

    if (chatMessages) {
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

// 3. Minimizar/Maximizar Janela
function toggleChat() {
    if (chatContainer && toggleChatBtn) {
        chatContainer.classList.toggle('minimized');
        // Muda o ícone entre + e -
        toggleChatBtn.textContent = chatContainer.classList.contains('minimized') ? '+' : '−';
    }
}

// Adiciona cliques para minimizar
if (toggleChatBtn) toggleChatBtn.addEventListener('click', toggleChat);
if (chatHeader) chatHeader.addEventListener('click', toggleChat);

// --- SISTEMA DE TOOLTIP ---
const tooltip = document.getElementById('move-tooltip');

function showTooltip(e) {
    const msg = e.target.dataset.errorMsg;
    if (msg && tooltip) {
        tooltip.textContent = msg;
        tooltip.style.display = 'block';
        moveTooltip(e); // Posiciona imediatamente
    }
}

function hideTooltip() {
    if (tooltip) tooltip.style.display = 'none';
}

function moveTooltip(e) {
    if (tooltip) {
        // Posiciona um pouco acima e a direita do mouse
        tooltip.style.left = e.pageX + 15 + 'px';
        tooltip.style.top = e.pageY + 15 + 'px';
    }
}