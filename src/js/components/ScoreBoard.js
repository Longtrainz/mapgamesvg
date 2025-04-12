import { PLAYER_COLORS } from '../config/colors.js';
import { GameConfig } from '../config/gameConfig.js';

export class ScoreBoard {
    constructor(container) {
        this.container = container;
        this.scores = {};
        this.startTerritories = {};
        this.onTerritoryFocus = null;
        this.init();
    }

    init() {
        for (let i = 1; i <= GameConfig.PLAYERS_COUNT; i++) {
            this.scores[i] = 0;
        }
    }

    setStartTerritory(playerId, territoryId) {
        this.startTerritories[playerId] = territoryId;
    }

    updateScore(playerId, score) {
        this.scores[playerId] = score;
        this.render();
    }

    incrementScore(playerId) {
        this.scores[playerId]++;
        this.render();
    }

    getScore(playerId) {
        return this.scores[playerId];
    }

    setTerritoryFocusCallback(callback) {
        this.onTerritoryFocus = callback;
    }

    render() {
        if (!this.container) return;
        
        this.container.innerHTML = "";
        
        for (let playerId = 1; playerId <= GameConfig.PLAYERS_COUNT; playerId++) {
            const div = document.createElement("div");
            div.className = "player-score";
            div.setAttribute('role', 'button');
            div.setAttribute('tabindex', '0');
            div.setAttribute('aria-label', `Показать старт Игрока ${playerId}`);

            // Создаем маркер игрока
            const marker = document.createElement('span');
            Object.assign(marker.style, {
                display: 'inline-block',
                width: '12px',
                height: '12px',
                backgroundColor: PLAYER_COLORS[playerId],
                marginRight: '8px',
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.5)',
                verticalAlign: 'middle',
                flexShrink: '0'
            });

            div.appendChild(marker);
            div.appendChild(document.createTextNode(`Игрок ${playerId}: ${this.scores[playerId]}`));

            // Добавляем обработчики событий
            if (this.onTerritoryFocus) {
                div.addEventListener('click', () => {
                    const territoryId = this.startTerritories[playerId];
                    if (territoryId) {
                        this.onTerritoryFocus(territoryId);
                    }
                });

                div.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        div.click();
                    }
                });
            }

            this.container.appendChild(div);
        }
    }

    reset() {
        this.init();
        this.startTerritories = {};
        this.render();
    }
} 