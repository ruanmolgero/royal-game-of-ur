// A lógica principal do seu jogo, agora dentro de uma função chamada iniciarJogo
const iniciarJogo = () => {
    
    // TODO O SEU CÓDIGO ANTERIOR VEM AQUI DENTRO
    // ===============================================

    const boardElement = document.getElementById('game-board');
    const rollDiceBtn = document.getElementById('roll-dice-btn');
    const playerTurnElement = document.getElementById('current-player');
    const diceRollElement = document.getElementById('dice-roll');
    const p1PiecesContainer = document.getElementById('p1-pieces');
    const p2PiecesContainer = document.getElementById('p2-pieces');

    const NUM_PIECES = 7;
    const BOARD_LAYOUT = [
        'p1-4', 'p1-3', 'p1-2', 'p1-1', null, null, 'p2-2', 'p2-3',
        'c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6', 'c-7', 'c-8',
        'p1-5', 'p1-6', 'p1-7', 'p1-8', null, null, 'p2-5', 'p2-6'
    ];
    
    const player1Path = [3, 2, 1, 0,     8, 9, 10, 11, 12, 13, 14, 15, 7, 6];
    const player2Path = [19, 18, 17, 16, 8, 9, 10, 11, 12, 13, 14, 15, 23, 22];
    const rosetteCells = ['p1-4', 'p2-2', 'c-4', 'p1-5', 'p2-5'];

    let gameState = {};

    function initializeGame() {
        gameState = {
            currentPlayer: 1,
            diceResult: 0,
            player1: { pieces: Array(NUM_PIECES).fill(-1), completed: 0 },
            player2: { pieces: Array(NUM_PIECES).fill(-1), completed: 0 },
            board: new Map(),
            phase: 'roll'
        };
        renderFullUI();
        updateStatus();
    }
    
    function renderFullUI() {
        boardElement.innerHTML = '';
        p1PiecesContainer.innerHTML = '';
        p2PiecesContainer.innerHTML = '';
        gameState.board.clear();

        mapBoardPieces();

        BOARD_LAYOUT.forEach(cellId => {
            const cell = document.createElement('div');
            if (cellId) {
                cell.classList.add('cell');
                cell.dataset.id = cellId;
                if (rosetteCells.includes(cellId)) cell.classList.add('rosette');
                
                if (gameState.board.has(cellId)) {
                    const pieceInfo = gameState.board.get(cellId);
                    const piece = createPieceElement(pieceInfo.player, pieceInfo.pieceIndex);
                    cell.appendChild(piece);
                }
            } else {
                cell.classList.add('empty-space');
            }
            boardElement.appendChild(cell);
        });

        renderWaitingPieces(1, gameState.player1, p1PiecesContainer);
        renderWaitingPieces(2, gameState.player2, p2PiecesContainer);

        if (gameState.phase === 'move') {
            highlightValidMoves();
        }
    }

    function mapBoardPieces() {
        for (let player = 1; player <= 2; player++) {
            const playerData = player === 1 ? gameState.player1 : gameState.player2;
            const path = player === 1 ? player1Path : player2Path;
            playerData.pieces.forEach((pos, pieceIndex) => {
                if (pos >= 0 && pos < path.length) {
                    const cellId = BOARD_LAYOUT[path[pos]];
                    gameState.board.set(cellId, { player, pieceIndex });
                }
            });
        }
    }

    function createPieceElement(player, pieceIndex) {
        const piece = document.createElement('div');
        piece.classList.add('piece', `player${player}`);
        piece.dataset.player = player;
        piece.dataset.pieceIndex = pieceIndex;
        piece.addEventListener('click', handlePieceClick);
        return piece;
    }

    function renderWaitingPieces(player, playerData, container) {
        playerData.pieces.forEach((pos, pieceIndex) => {
            if (pos === -1) {
                const piece = createPieceElement(player, pieceIndex);
                container.appendChild(piece);
            }
        });
    }

    function updateStatus() {
        playerTurnElement.textContent = gameState.currentPlayer;
        diceRollElement.textContent = gameState.diceResult > 0 ? gameState.diceResult : '';
        rollDiceBtn.disabled = gameState.phase !== 'roll';
    }

    function rollDice() {
        return Math.floor(Math.random() * 5); 
    }

    function handleRollDice() {
        if (gameState.phase !== 'roll') return;
        gameState.diceResult = rollDice();

        if (gameState.diceResult === 0) {
            diceRollElement.textContent = '0 - Perdeu a vez!';
            setTimeout(switchPlayer, 1500);
            return;
        }

        gameState.phase = 'move';
        const validMoves = getValidMoves();
        if (validMoves.length === 0) {
            diceRollElement.textContent = `${gameState.diceResult} - Sem jogadas!`;
            setTimeout(switchPlayer, 1500);
        } else {
            renderFullUI();
            updateStatus();
        }
    }

    function getValidMoves() {
        const playerState = gameState.currentPlayer === 1 ? gameState.player1 : gameState.player2;
        const playerPath = gameState.currentPlayer === 1 ? player1Path : player2Path;
        const validMoves = [];

        playerState.pieces.forEach((currentPos, pieceIndex) => {
            const newPos = currentPos === -1 ? gameState.diceResult - 1 : currentPos + gameState.diceResult;

            if (newPos > playerPath.length) return;
            if (newPos === playerPath.length) {
                validMoves.push(pieceIndex);
                return;
            }
            
            const isOccupiedBySelf = playerState.pieces.some(p => p === newPos);
            if (isOccupiedBySelf) return;

            const targetCellId = BOARD_LAYOUT[playerPath[newPos]];
            if (rosetteCells.includes(targetCellId) && gameState.board.has(targetCellId)) {
                const pieceOnCell = gameState.board.get(targetCellId);
                if (pieceOnCell.player !== gameState.currentPlayer) return;
            }

            validMoves.push(pieceIndex);
        });
        return validMoves;
    }

    function highlightValidMoves() {
        const validMoves = getValidMoves();
        validMoves.forEach(pieceIndex => {
            document.querySelectorAll(`.player${gameState.currentPlayer}`).forEach(pieceEl => {
                if (parseInt(pieceEl.dataset.pieceIndex) === pieceIndex) {
                    pieceEl.classList.add('movable');
                }
            });
        });
    }

    function handlePieceClick(event) {
        const piece = event.currentTarget;
        if (gameState.phase !== 'move' || !piece.classList.contains('movable')) return;

        const pieceIndex = parseInt(piece.dataset.pieceIndex);
        movePiece(pieceIndex);
    }
    
    function movePiece(pieceIndex) {
        const playerState = gameState.currentPlayer === 1 ? gameState.player1 : gameState.player2;
        const opponentState = gameState.currentPlayer === 1 ? gameState.player2 : gameState.player1;
        const playerPath = gameState.currentPlayer === 1 ? player1Path : player2Path;
        const currentPos = playerState.pieces[pieceIndex];
        
        const newPos = currentPos === -1
            ? gameState.diceResult - 1
            : currentPos + gameState.diceResult;

        if (newPos >= playerPath.length) {
            playerState.pieces[pieceIndex] = -2;
            playerState.completed++;
        } else {
             const targetCellId = BOARD_LAYOUT[playerPath[newPos]];
             if (targetCellId && gameState.board.has(targetCellId)) {
                const captured = gameState.board.get(targetCellId);
                if (captured.player !== gameState.currentPlayer) {
                    opponentState.pieces[captured.pieceIndex] = -1;
                }
            }
            playerState.pieces[pieceIndex] = newPos;
        }

        if (playerState.completed === NUM_PIECES) {
            alert(`Jogador ${gameState.currentPlayer} venceu!`);
            initializeGame();
            return;
        }

        const newCellId = newPos < playerPath.length ? BOARD_LAYOUT[playerPath[newPos]] : null;
        if (newCellId && rosetteCells.includes(newCellId)) {
            gameState.phase = 'roll';
        } else {
            switchPlayer();
        }

        renderFullUI();
        updateStatus();
    }
    
    function switchPlayer() {
        gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
        gameState.phase = 'roll';
        gameState.diceResult = 0;
        renderFullUI();
        updateStatus();
    }

    rollDiceBtn.addEventListener('click', handleRollDice);
    initializeGame();

    // ===============================================
    // FIM DO SEU CÓDIGO ANTERIOR
};

// ESTRUTURA DE INICIALIZAÇÃO NOVA E MAIS ROBUSTA
// Verifica se a página já carregou. Se sim, roda o jogo. Se não, espera o evento.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarJogo);
} else {
    iniciarJogo();
}