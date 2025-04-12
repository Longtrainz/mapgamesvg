import { DICE_CONFIG } from '../config/gameConfig.js';
import { EventEmitter } from '../utils/EventEmitter.js';

export class Dice extends EventEmitter {
    constructor(element) {
        super();
        this.element = element;
        this.value = 0;
        this.isRolling = false;
    }

    roll(debugMode = false) {
        if (this.isRolling) return;
        
        this.isRolling = true;
        this.element.textContent = "...";
        this.element.classList.add("rolling");

        setTimeout(() => {
            this.value = debugMode ? 6 : Math.floor(Math.random() * 6) + 1;
            this.element.textContent = this.value;
            this.element.classList.remove("rolling");
            this.element.classList.add("pulse-effect");

            setTimeout(() => {
                this.element.classList.remove("pulse-effect");
                this.isRolling = false;
                this.emit('rollComplete', this.value);
            }, DICE_CONFIG.RESULT_ANIMATION_TIME);
        }, DICE_CONFIG.ROLL_ANIMATION_TIME);
    }

    reset() {
        this.value = 0;
        this.element.textContent = "?";
        this.element.classList.remove("rolling", "pulse-effect");
    }

    getValue() {
        return this.value;
    }
} 