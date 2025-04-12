import { GameConfig } from '../config/gameConfig.js';
import { Map } from '../components/Map.js';
import { Dice } from '../components/Dice.js';
import { ScoreBoard } from '../components/ScoreBoard.js';
import { EventEmitter } from '../utils/EventEmitter.js';

export class Game extends EventEmitter {
    constructor() {
        super();
        this.map = null;
        this.dice = null;
        this.scoreBoard = null;
        this.currentPlayer = 1;
        this.canCaptureCountry = false;
        this.gameOver = false;
        this.debugMode = GameConfig.DEBUG_MODE;
    }

    async init() {
        try {
            // Инициализация компонентов
            const svgObject = document.getElementById("svgMap");
            const diceElement = document.getElementById("dice");
            const scoresContainer = document.getElementById("scores-container");
            
            if (!svgObject || !diceElement || !scoresContainer) {
                throw new Error("Required DOM elements not found");
            }

            this.map = new Map(svgObject);
            this.dice = new Dice(diceElement);
            this.scoreBoard = new ScoreBoard(scoresContainer);

            // Настройка обработчиков событий
            this.setupEventListeners();

            // Ожидаем загрузку карты
            await new Promise(resolve => {
                this.map.on('ready', resolve);
                this.map.on('error', (error) => {
                    console.error('Map loading error:', error);
                    this.emit('error', error);
                });
            });

            // Инициализация начального состояния
            this.assignStartingTerritories();
            this.updateUI();
            this.emit('ready');

        } catch (error) {
            console.error('Game initialization failed:', error);
            this.emit('error', error);
        }
    }

    setupEventListeners() {
        // Обработка кликов по территориям
        this.map.on('territoryClick', (territory) => {
            if (this.gameOver) return;
            
            if (this.canCaptureCountry) {
                this.handleTerritoryCapture(territory);
            } else {
                this.showTerritoryInfo(territory);
            }
        });

        // Обработка результатов броска кубика
        this.dice.on('rollComplete', (value) => {
            this.handleDiceRoll(value);
        });

        // Настройка фокусировки на территории из таблицы очков
        this.scoreBoard.setTerritoryFocusCallback((territoryId) => {
            this.map.focusOnTerritory(territoryId);
        });
    }

    assignStartingTerritories() {
        const territories = this.map.getAllTerritories();
        const neutralTerritories = territories.filter(t => t.isNeutral());
        
        if (neutralTerritories.length < GameConfig.PLAYERS_COUNT * GameConfig.STARTING_TERRITORIES_PER_PLAYER) {
            throw new Error("Not enough territories for starting assignment");
        }

        // Перемешиваем территории
        for (let i = neutralTerritories.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [neutralTerritories[i], neutralTerritories[j]] = [neutralTerritories[j], neutralTerritories[i]];
        }

        // Назначаем стартовые территории
        let territoryIndex = 0;
        for (let player = 1; player <= GameConfig.PLAYERS_COUNT; player++) {
            for (let i = 0; i < GameConfig.STARTING_TERRITORIES_PER_PLAYER; i++) {
                const territory = neutralTerritories[territoryIndex++];
                territory.setOwner(player);
                if (i === 0) {
                    this.scoreBoard.setStartTerritory(player, territory.id);
                }
                this.scoreBoard.incrementScore(player);
            }
        }
    }

    handleDiceRoll(value) {
        this.map.resetStyles();
        
        if (value === 6) {
            const hasFreeCountries = this.map.getAllTerritories().some(t => t.isNeutral());
            if (hasFreeCountries) {
                this.canCaptureCountry = true;
                this.highlightAvailableTerritories();
                this.emit('message', "Выпала 6! Кликните по СВОБОДНОЙ стране для захвата или завершите ход.");
            } else {
                this.emit('message', "Выпала 6, но нет свободных стран! Завершите ход.");
            }
        } else {
            this.emit('message', `Выпало ${value}. Завершите ход.`);
        }
    }

    handleTerritoryCapture(territory) {
        if (!this.canCaptureCountry || this.gameOver || !territory.isNeutral()) {
            return;
        }

        // Проверяем возможность захвата
        if (!this.canCaptureTerritoryCheck(territory)) {
            this.emit('message', 'Вы можете захватить только территорию, граничащую с вашими владениями!');
            return;
        }

        // Захватываем территорию
        territory.setOwner(this.currentPlayer);
        this.scoreBoard.incrementScore(this.currentPlayer);
        this.canCaptureCountry = false;
        this.map.resetStyles();
        
        this.emit('message', `Игрок ${this.currentPlayer} захватил ${territory.id}! Завершите ход.`);
        this.checkWinCondition();
    }

    canCaptureTerritoryCheck(territory) {
        // Если это первый ход игрока, разрешаем захват любой территории
        if (this.scoreBoard.getScore(this.currentPlayer) === 0) {
            return true;
        }

        // Проверяем наличие смежных территорий, принадлежащих игроку
        return territory.adjacentTerritories.some(id => {
            const adjTerritory = this.map.getTerritory(id);
            return adjTerritory && adjTerritory.isOwnedBy(this.currentPlayer);
        });
    }

    highlightAvailableTerritories() {
        this.map.getAllTerritories().forEach(territory => {
            if (territory.isNeutral()) {
                if (this.canCaptureTerritoryCheck(territory)) {
                    territory.markAsAvailable();
                } else {
                    territory.markAsUnavailable();
                }
            }
        });
    }

    showTerritoryInfo(territory) {
        const message = territory.isNeutral()
            ? `Страна ${territory.id} нейтральна. Выбросите 6 для захвата.`
            : `Страна ${territory.id} принадлежит Игроку ${territory.owner}. Ваш счет: ${this.scoreBoard.getScore(this.currentPlayer)}.`;
        
        this.emit('message', message);
    }

    endTurn() {
        if (this.gameOver) return;

        this.map.resetStyles();
        this.currentPlayer = (this.currentPlayer % GameConfig.PLAYERS_COUNT) + 1;
        this.canCaptureCountry = false;
        this.dice.reset();
        
        this.updateUI();
        this.emit('message', `Ход Игрока ${this.currentPlayer}. Бросьте кубик!`);
    }

    checkWinCondition() {
        // Проверка на победу по количеству территорий
        if (this.scoreBoard.getScore(this.currentPlayer) >= GameConfig.WIN_THRESHOLD) {
            this.endGame(`ИГРОК ${this.currentPlayer} ПОБЕДИЛ`, this.currentPlayer);
            return;
        }

        // Проверка на захват всех территорий
        const territories = this.map.getAllTerritories();
        const totalTerritories = territories.length;
        const capturedTerritories = territories.filter(t => !t.isNeutral()).length;

        if (totalTerritories > 0 && capturedTerritories >= totalTerritories) {
            // Определяем победителя по очкам
            let maxScore = -1;
            let winners = [];
            
            for (let player = 1; player <= GameConfig.PLAYERS_COUNT; player++) {
                const score = this.scoreBoard.getScore(player);
                if (score > maxScore) {
                    maxScore = score;
                    winners = [player];
                } else if (score === maxScore) {
                    winners.push(player);
                }
            }

            if (winners.length === 1 && maxScore >= 0) {
                this.endGame(`ИГРОК ${winners[0]} ПОБЕДИЛ ПО ОЧКАМ (${maxScore} стран)`, winners[0]);
            } else {
                const txt = winners.length > 0 ? ` Лидеры по ${maxScore}.` : "";
                this.endGame(`НИЧЬЯ! Все страны захвачены.${txt}`);
            }
        }
    }

    endGame(message, winnerPlayer = null) {
        if (this.gameOver) return;
        
        this.gameOver = true;
        this.canCaptureCountry = false;
        this.emit('message', `=== ${message} ===`);
        this.emit('gameOver', { message, winner: winnerPlayer });

        // Применяем стили окончания игры
        this.map.getAllTerritories().forEach(territory => {
            if (winnerPlayer !== null) {
                if (territory.isOwnedBy(winnerPlayer)) {
                    territory.highlight();
                } else {
                    territory.dim();
                }
            } else {
                territory.dim();
            }
        });
    }

    updateUI() {
        this.emit('updateUI', {
            currentPlayer: this.currentPlayer,
            canRoll: !this.gameOver,
            canEndTurn: !this.gameOver && this.dice.getValue() > 0
        });
    }
} 