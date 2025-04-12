import { Game } from './core/Game.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Инициализация игры
    const game = new Game();
    
    // Получение элементов UI
    const rollBtn = document.getElementById("roll-btn");
    const endTurnBtn = document.getElementById("end-turn-btn");
    const turnStatus = document.getElementById("turn-status");
    const currentPlayerEl = document.getElementById("current-player");

    // Отключаем кнопки до полной инициализации
    rollBtn.disabled = true;
    endTurnBtn.disabled = true;

    // Обработчики событий кнопок
    rollBtn.addEventListener("click", () => {
        if (!game.gameOver && !rollBtn.disabled) {
            game.dice.roll(game.debugMode);
            rollBtn.disabled = true;
            endTurnBtn.disabled = true;
        }
    });

    endTurnBtn.addEventListener("click", () => {
        if (!game.gameOver && !endTurnBtn.disabled) {
            game.endTurn();
        }
    });

    // Обработчики событий игры
    game.on('message', (message) => {
        if (turnStatus) {
            turnStatus.textContent = message;
        }
    });

    game.on('updateUI', ({ currentPlayer, canRoll, canEndTurn }) => {
        if (currentPlayerEl) {
            currentPlayerEl.className = `player-${currentPlayer}`;
            currentPlayerEl.textContent = `Игрок ${currentPlayer}`;
        }
        
        if (rollBtn) rollBtn.disabled = !canRoll;
        if (endTurnBtn) endTurnBtn.disabled = !canEndTurn;
    });

    game.on('error', (error) => {
        console.error('Game error:', error);
        if (turnStatus) {
            turnStatus.textContent = `Ошибка: ${error.message}. Обновите страницу.`;
        }
        if (rollBtn) rollBtn.disabled = true;
        if (endTurnBtn) endTurnBtn.disabled = true;
    });

    // Запуск игры
    try {
        await game.init();
    } catch (error) {
        console.error('Failed to initialize game:', error);
    }
}); 