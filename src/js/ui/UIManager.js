export class UIManager {
    constructor(gameState) {
        this.gameState = gameState;
        this.elements = {
            rollBtn: document.getElementById("roll-btn"),
            endTurnBtn: document.getElementById("end-turn-btn"),
            diceEl: document.getElementById("dice"),
            turnStatus: document.getElementById("turn-status"),
            currentPlayerEl: document.getElementById("current-player"),
            scoresContainer: document.getElementById("scores-container")
        };

        this.initialize();
    }

    initialize() {
        if (this.elements.rollBtn) this.elements.rollBtn.disabled = true;
        if (this.elements.endTurnBtn) this.elements.endTurnBtn.disabled = true;
        this.updateScoresTable();
        this.updatePlayerPanel();
    }

    updateDiceDisplay(rolling = false) {
        const { diceEl } = this.elements;
        if (!diceEl) return;

        if (rolling) {
            diceEl.textContent = "...";
            diceEl.classList.add("rolling");
        } else {
            diceEl.textContent = this.gameState.diceResult || "?";
            diceEl.classList.remove("rolling");
            diceEl.classList.add("pulse-effect");
            setTimeout(() => diceEl.classList.remove("pulse-effect"), 400);
        }
    }

    updateTurnStatus(message) {
        if (this.elements.turnStatus) {
            this.elements.turnStatus.textContent = message;
        }
    }

    updatePlayerPanel() {
        const { currentPlayerEl } = this.elements;
        if (!currentPlayerEl) return;

        const colors = ["player-1", "player-2", "player-3", "player-4"];
        currentPlayerEl.classList.remove(...colors);
        currentPlayerEl.classList.add(colors[this.gameState.currentPlayer - 1]);
        currentPlayerEl.textContent = `Игрок ${this.gameState.currentPlayer}`;
    }

    updateScoresTable(onTerritoryClick) {
        const { scoresContainer } = this.elements;
        if (!scoresContainer) return;

        scoresContainer.innerHTML = "";
        for (let p = 1; p <= 4; p++) {
            const div = document.createElement("div");
            div.className = "player-score";
            div.setAttribute('role', 'button');
            div.setAttribute('tabindex', '0');
            div.setAttribute('aria-label', `Показать старт Игрока ${p}`);

            const marker = document.createElement('span');
            Object.assign(marker.style, {
                display: 'inline-block',
                width: '12px',
                height: '12px',
                backgroundColor: this.gameState.getPlayerColor(p),
                marginRight: '8px',
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.5)',
                verticalAlign: 'middle',
                flexShrink: '0'
            });

            div.appendChild(marker);
            div.appendChild(document.createTextNode(`Игрок ${p}: ${this.gameState.playerScores[p]}`));

            if (onTerritoryClick) {
                div.addEventListener('click', () => {
                    const id = this.gameState.playerStartTerritories[p];
                    if (id) onTerritoryClick(id);
                });

                div.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        div.click();
                    }
                });
            }

            scoresContainer.appendChild(div);
        }
    }

    setButtonsState(rollEnabled, endTurnEnabled) {
        if (this.elements.rollBtn) this.elements.rollBtn.disabled = !rollEnabled;
        if (this.elements.endTurnBtn) this.elements.endTurnBtn.disabled = !endTurnEnabled;
    }

    highlightAvailableTerritories(svgDoc, canCaptureTerritory) {
        if (!svgDoc || !this.gameState.canCaptureCountry) return;

        // Сначала убираем все подсветки
        svgDoc.querySelectorAll("path[id]").forEach(path => {
            path.classList.remove('available-territory', 'unavailable-territory');
        });

        Object.keys(this.gameState.countryOwners).forEach(territoryId => {
            if (this.gameState.countryOwners[territoryId] === 0) {
                const path = svgDoc.getElementById(territoryId);
                if (path) {
                    if (canCaptureTerritory(territoryId)) {
                        path.classList.add('available-territory');
                    } else {
                        path.classList.add('unavailable-territory');
                    }
                }
            }
        });
    }

    applyEndGameStyles(svgDoc, winnerPlayer = null) {
        if (!svgDoc) return;
        
        svgDoc.querySelectorAll("path[id]").forEach(path => {
            const owner = this.gameState.countryOwners[path.id];
            path.classList.remove('highlight', 'dimmed', 'no-interaction');
            path.classList.add('no-interaction');
            
            if (winnerPlayer !== null) {
                if (owner === winnerPlayer) {
                    path.classList.add('highlight');
                } else {
                    path.classList.add('dimmed');
                }
            } else {
                path.classList.add('dimmed');
            }
        });
    }
} 