class RoyalGameOfUr {
    constructor() {
        this.NUM_PIECES = 7;

        this.BOARD_LAYOUT = [
            'p1-4', 'c-1', 'p2-4',  // Linha 1 (Topo)
            'p1-3', 'c-2', 'p2-3',
            'p1-2', 'c-3', 'p2-2',
            'p1-1', 'c-4', 'p2-1',
            null,   'c-5', null,
            null,   'c-6', null,
            'p1-6', 'c-7', 'p2-6',
            'p1-5', 'c-8', 'p2-5'   // Linha 8 (Base)
        ];
        
        // Caminhos atualizados para bater com os novos índices do array acima
        this.player1Path = [9, 6, 3, 0, 1, 4, 7, 10, 13, 16, 19, 22, 21, 18];
        this.player2Path = [11, 8, 5, 2, 1, 4, 7, 10, 13, 16, 19, 22, 23, 20];
        
        this.rosetteCells = ['p1-4', 'p2-4', 'c-4', 'p1-6', 'p2-6'];

        this.resetGame();
    }

    resetGame() {
        this.state = {
            currentPlayer: 1,
            diceResult: 0,
            // -1 = fora, 0..13 = no tabuleiro, 14 = finalizado
            player1: { pieces: Array(this.NUM_PIECES).fill(-1), completed: 0 },
            player2: { pieces: Array(this.NUM_PIECES).fill(-1), completed: 0 },
            board: {}, // Mapeamento { cellId: { player: 1, pieceIndex: 0 } }
            phase: 'roll', // 'roll' ou 'move'
            winner: null,
            lastAction: 'Jogo iniciado',
            validMoves: [],
            moveDiagnostics: {}
        };
        this.updateBoardMap();
    }

    // Reconstrói o mapa do tabuleiro baseado nas posições das peças
    updateBoardMap() {
        this.state.board = {};
        const mapPlayer = (pNum, pData, path) => {
            pData.pieces.forEach((pos, idx) => {
                if (pos >= 0 && pos < path.length) {
                    const cellId = this.BOARD_LAYOUT[path[pos]];
                    if (cellId) {
                        this.state.board[cellId] = { player: pNum, pieceIndex: idx };
                    }
                }
            });
        };
        mapPlayer(1, this.state.player1, this.player1Path);
        mapPlayer(2, this.state.player2, this.player2Path);
    }

    calculateValidMoves() {
        const pData = this.state.currentPlayer === 1 ? this.state.player1 : this.state.player2;
        this.state.moveDiagnostics = {};
        return pData.pieces
            .map((pos, idx) => {
                const isValid = this.validateMove(idx);
                if (isValid) {
                    return idx;
                } else {
                    const reason = this.getInvalidReason(idx);
                    if (reason) {
                        this.state.moveDiagnostics[idx] = reason;
                    }
                    return null;
                }
            })
            .filter(idx => idx !== null);
    }

    getInvalidReason(pieceIndex) {
        const pNum = this.state.currentPlayer;
        const pData = pNum === 1 ? this.state.player1 : this.state.player2;
        const path = pNum === 1 ? this.player1Path : this.player2Path;
        const currentPos = pData.pieces[pieceIndex];

        // 1. Peça já finalizada
        if (currentPos === -2) return null; // Não exibe erro, peça já saiu

        const newPos = currentPos === -1 ? this.state.diceResult - 1 : currentPos + this.state.diceResult;

        // 2. Saída Exata
        if (newPos > path.length) return "Saída: Precisa tirar o número exato.";

        // 3. Casa Ocupada
        const targetCellId = this.BOARD_LAYOUT[path[newPos]];
        if (newPos < path.length) { // Se não for saída
            const cellContent = this.state.board[targetCellId];

            if (cellContent) {
                // Bloqueio Amigo
                if (cellContent.player === pNum) return "Bloqueado: Você já tem uma peça que ocupa a casa destino.";
                
                // Roseta Segura do Inimigo
                if (this.rosetteCells.includes(targetCellId)) {
                    return "Roseta Segura: Você não pode atacar com essa peça a roseta segura.";
                }
            }
        }
        
        return null;
    }

    rollDice() {
        if (this.state.phase !== 'roll') return null;
        
        let total = 0;
        for (let i = 0; i < 4; i++) {
            if (Math.random() > 0.5) { // 50% de chance
                total++;
            }
        }
        this.state.diceResult = total;
        
        this.state.lastAction = `Tirou ${this.state.diceResult}`;

        if (this.state.diceResult === 0) {
           this.state.lastAction = "0 - Passou a vez!";
           this.state.validMoves = [];
            this.switchPlayer();
        } else {
            if (!this.hasValidMoves()) {
                this.state.lastAction = `${this.state.diceResult} - Sem movimentos!`;
                this.state.validMoves = [];
                this.switchPlayer();
            } else {
                this.state.phase = 'move';
                this.state.lastAction = `Tirou ${this.state.diceResult} - Mova uma peça`;

                this.state.validMoves = this.calculateValidMoves();
            }
        }
        return this.state;
    }

    hasValidMoves() {
        const pData = this.state.currentPlayer === 1 ? this.state.player1 : this.state.player2;
        // Tenta mover cada peça hipoteticamente
        return pData.pieces.some((pos, idx) => this.validateMove(idx));
    }

    validateMove(pieceIndex) {
        const pNum = this.state.currentPlayer;
        const pData = pNum === 1 ? this.state.player1 : this.state.player2;
        const path = pNum === 1 ? this.player1Path : this.player2Path;
        const currentPos = pData.pieces[pieceIndex];

        // Peça já finalizada não move
        if (currentPos === -2) return false; // -2 usaremos para "Finalizado/Safe"

        const newPos = currentPos === -1 ? this.state.diceResult - 1 : currentPos + this.state.diceResult;

        // Movimento exato para sair (14 casas no total, indices 0..13. Sair = 14)
        if (newPos === path.length) return true; 
        // Passou do tabuleiro
        if (newPos > path.length) return false;

        // Verificar ocupação
        const targetCellId = this.BOARD_LAYOUT[path[newPos]];
        const cellContent = this.state.board[targetCellId];

        if (cellContent) {
            // Não pode cair na própria peça
            if (cellContent.player === pNum) return false;
            // Não pode comer peça na Roseta
            if (this.rosetteCells.includes(targetCellId)) return false;
        }

        return true;
    }

    movePiece(pieceIndex) {
        if (this.state.phase !== 'move') return false;
        if (!this.validateMove(pieceIndex)) return false;

        const pNum = this.state.currentPlayer;
        const pData = pNum === 1 ? this.state.player1 : this.state.player2;
        const opponentData = pNum === 1 ? this.state.player2 : this.state.player1;
        const path = pNum === 1 ? this.player1Path : this.player2Path;

        const currentPos = pData.pieces[pieceIndex];
        const newPos = currentPos === -1 ? this.state.diceResult - 1 : currentPos + this.state.diceResult;

        // Verifica captura (antes de atualizar o mapa)
        if (newPos < path.length) {
            const targetCellId = this.BOARD_LAYOUT[path[newPos]];
            const cellContent = this.state.board[targetCellId];
            if (cellContent && cellContent.player !== pNum) {
                // Captura! Manda o oponente para o início (-1)
                opponentData.pieces[cellContent.pieceIndex] = -1;
                this.state.lastAction = `Jogador ${pNum} capturou uma peça!`;
            }
        }

        // Move a peça
        if (newPos === path.length) {
            // Saiu do tabuleiro
            pData.pieces[pieceIndex] = -2; // -2 = Completed
            pData.completed++;
            this.state.lastAction = `Jogador ${pNum} pontuou!`;
        } else {
            pData.pieces[pieceIndex] = newPos;
        }

        this.updateBoardMap();

        // Verifica Vitória
        if (pData.completed >= this.NUM_PIECES) {
            this.state.winner = pNum;
            this.state.lastAction = `JOGADOR ${pNum} VENCEU!`;
            return this.state;
        }

        // Regra da Roseta (Joga de novo)
        let landedOnRosette = false;
        if (newPos < path.length) {
            const cellId = this.BOARD_LAYOUT[path[newPos]];
            if (this.rosetteCells.includes(cellId)) landedOnRosette = true;
        }

        if (landedOnRosette) {
            this.state.phase = 'roll';
            this.state.diceResult = 0;
            this.state.lastAction = "ROSETA! Jogue novamente!";
        } else {
            this.switchPlayer();
            if (!this.state.winner) this.state.lastAction = "Aguardando...";
        }

        return this.state;
    }

    switchPlayer() {
        this.state.currentPlayer = this.state.currentPlayer === 1 ? 2 : 1;
        this.state.phase = 'roll';
        this.state.diceResult = 0;
    }

    getState() {
        return this.state;
    }

    getBotMove() {
        const validMoves = this.calculateValidMoves();
        
        if (validMoves.length === 0) return null;

        // Lógica Simples: Escolhe um movimento aleatório
        // Futuro: Priorizar capturas ou rosetas aqui
        const randomIndex = Math.floor(Math.random() * validMoves.length);
        return validMoves[randomIndex];
    }
}

module.exports = RoyalGameOfUr;