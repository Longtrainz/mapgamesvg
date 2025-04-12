import { TOTAL_PLAYERS, PLAYER_COLORS } from '../constants/gameConstants.js';

export class GameState {
    constructor() {
        this.currentPlayer = 1;
        this.diceResult = 0;
        this.gameOver = false;
        this.canCaptureCountry = false;
        this.playerScores = Object.fromEntries(
            Array.from({ length: TOTAL_PLAYERS }, (_, i) => [i + 1, 0])
        );
        this.countryOwners = {};
        this.playerStartTerritories = {};
        this.adjacencyMatrix = {};
    }

    setDiceResult(result) {
        this.diceResult = result;
        this.canCaptureCountry = result === 6;
        return this.canCaptureCountry;
    }

    nextPlayer() {
        this.currentPlayer = (this.currentPlayer % TOTAL_PLAYERS) + 1;
        this.diceResult = 0;
        this.canCaptureCountry = false;
    }

    captureTerritory(territoryId) {
        if (!this.canCaptureCountry || this.gameOver) return false;
        if (this.countryOwners[territoryId] !== 0) return false;

        this.countryOwners[territoryId] = this.currentPlayer;
        this.playerScores[this.currentPlayer]++;
        this.canCaptureCountry = false;
        return true;
    }

    canCaptureTerritoryCheck(territoryId) {
        // Если это первый ход игрока, разрешаем захват любой территории
        if (this.playerScores[this.currentPlayer] === 0) return true;
        
        // Проверяем наличие смежных территорий, принадлежащих игроку
        return this.adjacencyMatrix[territoryId]?.some(neighborId => 
            this.countryOwners[neighborId] === this.currentPlayer
        ) || false;
    }

    setAdjacencyMatrix(matrix) {
        this.adjacencyMatrix = matrix;
    }

    getPlayerColor(player) {
        return PLAYER_COLORS[player];
    }

    checkWinCondition() {
        if (this.playerScores[this.currentPlayer] >= WIN_THRESHOLD) {
            return { gameOver: true, winner: this.currentPlayer, message: `ИГРОК ${this.currentPlayer} ПОБЕДИЛ` };
        }

        const totalCountries = Object.keys(this.countryOwners).filter(id => id).length;
        const totalCaptured = Object.values(this.countryOwners).filter(o => o > 0).length;

        if (totalCountries > 0 && totalCaptured >= totalCountries) {
            let maxScore = -1;
            let winners = [];
            
            for (let p = 1; p <= TOTAL_PLAYERS; p++) {
                if (this.playerScores[p] > maxScore) {
                    maxScore = this.playerScores[p];
                    winners = [p];
                } else if (this.playerScores[p] === maxScore) {
                    winners.push(p);
                }
            }

            if (winners.length === 1 && maxScore >= 0) {
                return { 
                    gameOver: true, 
                    winner: winners[0], 
                    message: `ИГРОК ${winners[0]} ПОБЕДИЛ ПО ОЧКАМ (${maxScore} стран)` 
                };
            } else {
                const txt = winners.length > 0 ? ` Лидеры по ${maxScore}.` : "";
                return { 
                    gameOver: true, 
                    winner: null, 
                    message: `НИЧЬЯ! Все страны захвачены.${txt}` 
                };
            }
        }

        return { gameOver: false };
    }
} 