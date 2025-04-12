import { PLAYER_COLORS } from '../config/colors.js';

export class Territory {
    constructor(id, element) {
        this.id = id;
        this.element = element;
        this.owner = 0;
        this.adjacentTerritories = [];
    }

    setOwner(playerId) {
        this.owner = playerId;
        this.updateAppearance();
    }

    updateAppearance() {
        if (!this.element) return;
        this.element.style.fill = PLAYER_COLORS[this.owner] || PLAYER_COLORS.NEUTRAL;
        this.element.style.opacity = 1;
        this.element.style.fillOpacity = 1;
    }

    setAdjacent(territories) {
        this.adjacentTerritories = territories;
    }

    isAdjacentTo(territoryId) {
        return this.adjacentTerritories.includes(territoryId);
    }

    isOwnedBy(playerId) {
        return this.owner === playerId;
    }

    isNeutral() {
        return this.owner === 0;
    }

    highlight() {
        this.element?.classList.add('highlight');
    }

    dim() {
        this.element?.classList.add('dimmed');
    }

    resetStyles() {
        if (!this.element) return;
        this.element.classList.remove('highlight', 'dimmed', 'available-territory', 'unavailable-territory');
    }

    markAsAvailable() {
        this.element?.classList.add('available-territory');
    }

    markAsUnavailable() {
        this.element?.classList.add('unavailable-territory');
    }
} 