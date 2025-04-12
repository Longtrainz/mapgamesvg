import { GameConfig } from '../config/gameConfig.js';
import { findAdjacentTerritories, getSVGPoint, clampTransform, applyTransform } from '../utils/svgUtils.js';
import { Territory } from '../core/Territory.js';
import { EventEmitter } from '../utils/EventEmitter.js';

export class Map extends EventEmitter {
    constructor(svgObject) {
        super();
        this.svgObject = svgObject;
        this.svgDoc = null;
        this.svgRoot = null;
        this.transformGroup = null;
        this.territories = new Map();
        this.contentBBox = null;
        
        // Состояние трансформации
        this.currentScale = 1;
        this.currentTranslate = { x: 0, y: 0 };
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };

        this.init();
    }

    async init() {
        try {
            await this.waitForSVGLoad();
            this.setupSVGElements();
            this.initializeTerritories();
            this.setupEventListeners();
            this.emit('ready');
        } catch (error) {
            console.error('Map initialization failed:', error);
            this.emit('error', error);
        }
    }

    async waitForSVGLoad() {
        if (this.svgObject.contentDocument) {
            return;
        }
        
        return new Promise((resolve, reject) => {
            this.svgObject.addEventListener('load', () => resolve(), { once: true });
            this.svgObject.addEventListener('error', (e) => reject(e), { once: true });
        });
    }

    setupSVGElements() {
        this.svgDoc = this.svgObject.contentDocument;
        this.svgRoot = this.svgDoc.querySelector('svg');
        
        if (!this.svgRoot) {
            throw new Error('SVG root element not found');
        }

        this.transformGroup = this.svgDoc.getElementById('map-transform-group');
        if (!this.transformGroup) {
            this.transformGroup = this.createTransformGroup();
        }

        try {
            this.contentBBox = this.transformGroup.getBBox();
        } catch (e) {
            console.error('Error getting content BBox:', e);
            this.contentBBox = { x: 0, y: 0, width: 0, height: 0 };
        }

        this.setupStyles();
    }

    createTransformGroup() {
        const group = this.svgDoc.createElementNS("http://www.w3.org/2000/svg", "g");
        group.id = 'map-transform-group';
        
        // Перемещаем все элементы (кроме style и defs) в группу
        const elementsToMove = Array.from(this.svgRoot.childNodes).filter(node =>
            node.nodeType === 1 &&
            node.nodeName !== 'style' &&
            node.nodeName !== 'defs'
        );
        
        elementsToMove.forEach(el => group.appendChild(el));
        
        // Добавляем группу после style и defs
        const firstElement = this.svgRoot.querySelector(':scope > *:not(style):not(defs)');
        if (firstElement) {
            this.svgRoot.insertBefore(group, firstElement);
        } else {
            this.svgRoot.appendChild(group);
        }
        
        return group;
    }

    setupStyles() {
        let styleElem = this.svgDoc.getElementById('game-style');
        if (!styleElem) {
            styleElem = this.svgDoc.createElementNS("http://www.w3.org/2000/svg", "style");
            styleElem.id = 'game-style';
            this.svgRoot.insertBefore(styleElem, this.svgRoot.firstChild);
        }

        styleElem.textContent = `
            path[id] { 
                stroke: #222; 
                stroke-width: 0.5; 
                cursor: pointer; 
                transition: fill 0.3s ease, opacity 0.3s ease, stroke-width 0.2s ease, stroke 0.2s ease; 
                vector-effect: non-scaling-stroke; 
            }
            path[id]:not(.no-interaction):hover { 
                opacity: 0.7; 
                stroke: #fff; 
                stroke-width: 1; 
            }
            path.highlight { 
                stroke: #FF0 !important; 
                stroke-width: 2 !important; 
                opacity: 1 !important; 
                z-index: 10; 
                position: relative;
            }
            path.dimmed { 
                opacity: 0.4 !important; 
                fill-opacity: 0.4 !important; 
            }
            path.no-interaction { 
                cursor: default; 
                pointer-events: none; 
            }
            path.no-interaction:hover { 
                opacity: inherit; 
                stroke-width: 0.5; 
                stroke: #222; 
            }
            path.available-territory { 
                stroke: #4CAF50; 
                stroke-width: 2; 
                cursor: pointer; 
            }
            path.unavailable-territory { 
                opacity: 0.4; 
                cursor: not-allowed; 
            }
            #map-transform-group { 
                transform-origin: 0 0; 
            }
            svg { 
                user-select: none; 
                -webkit-user-select: none; 
                -moz-user-select: none; 
                -ms-user-select: none; 
            }
        `;
    }

    initializeTerritories() {
        const paths = Array.from(this.svgDoc.querySelectorAll("path[id]"));
        
        // Создаем объекты территорий
        paths.forEach(path => {
            const territory = new Territory(path.id, path);
            this.territories.set(path.id, territory);
            
            path.addEventListener("click", () => {
                this.emit('territoryClick', territory);
            });
        });

        // Строим матрицу смежности
        paths.forEach(path1 => {
            const territory1 = this.territories.get(path1.id);
            const adjacentTerritories = [];

            paths.forEach(path2 => {
                if (path1.id !== path2.id && findAdjacentTerritories(path1, path2)) {
                    adjacentTerritories.push(path2.id);
                }
            });

            territory1.setAdjacent(adjacentTerritories);
        });
    }

    setupEventListeners() {
        // Зум
        this.svgRoot.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        
        // Пан
        this.svgRoot.addEventListener('mousedown', this.startPanning.bind(this));
        this.svgRoot.style.cursor = 'grab';
    }

    handleWheel(event) {
        event.preventDefault();
        
        const zoomFactor = event.deltaY < 0 ? GameConfig.ZOOM.SPEED : 1 / GameConfig.ZOOM.SPEED;
        const oldScale = this.currentScale;
        const newScale = Math.max(
            GameConfig.ZOOM.MIN_SCALE,
            Math.min(GameConfig.ZOOM.MAX_SCALE, this.currentScale * zoomFactor)
        );

        const point = getSVGPoint(this.svgRoot, event.clientX, event.clientY);

        this.currentTranslate = {
            x: point.x - (point.x - this.currentTranslate.x) * (newScale / oldScale),
            y: point.y - (point.y - this.currentTranslate.y) * (newScale / oldScale)
        };
        
        this.currentScale = newScale;
        this.applyTransformation();
    }

    startPanning(event) {
        if (event.button !== 0) return;
        event.preventDefault();
        
        this.isPanning = true;
        this.panStart = { x: event.clientX, y: event.clientY };
        this.svgRoot.style.cursor = 'grabbing';

        const handlePanMove = this.handlePanMove.bind(this);
        const stopPanning = () => this.stopPanning(handlePanMove);

        this.svgRoot.addEventListener('mousemove', handlePanMove);
        this.svgRoot.addEventListener('mouseup', stopPanning, { once: true });
        this.svgRoot.addEventListener('mouseleave', stopPanning, { once: true });
    }

    handlePanMove(event) {
        if (!this.isPanning) return;
        event.preventDefault();

        const dx = event.clientX - this.panStart.x;
        const dy = event.clientY - this.panStart.y;

        this.currentTranslate = {
            x: this.currentTranslate.x + dx / this.currentScale,
            y: this.currentTranslate.y + dy / this.currentScale
        };

        this.applyTransformation();
        this.panStart = { x: event.clientX, y: event.clientY };
    }

    stopPanning(moveHandler) {
        this.isPanning = false;
        this.svgRoot.style.cursor = 'grab';
        this.svgRoot.removeEventListener('mousemove', moveHandler);
    }

    applyTransformation(isFocusing = false) {
        if (!isFocusing) {
            this.currentTranslate = clampTransform(
                this.svgRoot,
                this.transformGroup,
                this.contentBBox,
                this.currentScale,
                this.currentTranslate
            );
        }

        applyTransform(this.transformGroup, this.currentTranslate, this.currentScale);
    }

    focusOnTerritory(territoryId, targetScale = 3) {
        const territory = this.territories.get(territoryId);
        if (!territory || !territory.element) return;

        try {
            let bbox = territory.element.getBBox();
            if (!bbox || bbox.width === 0 || bbox.height === 0) {
                if (territory.element.tagName.toLowerCase() === 'path' && 
                    territory.element.getTotalLength && 
                    territory.element.getTotalLength() > 0) {
                    const point = territory.element.getPointAtLength(0);
                    bbox = { x: point.x, y: point.y, width: 1, height: 1 };
                } else {
                    return;
                }
            }

            const centerX = bbox.x + bbox.width / 2;
            const centerY = bbox.y + bbox.height / 2;
            
            this.currentScale = Math.max(
                GameConfig.ZOOM.MIN_SCALE,
                Math.min(GameConfig.ZOOM.MAX_SCALE, targetScale)
            );

            const viewWidth = this.svgObject.clientWidth;
            const viewHeight = this.svgObject.clientHeight;

            this.currentTranslate = {
                x: viewWidth / 2 - centerX * this.currentScale,
                y: viewHeight / 2 - centerY * this.currentScale
            };

            this.transformGroup.style.transition = 'transform 0.5s ease-out';
            this.applyTransformation(true);

            setTimeout(() => {
                if (this.transformGroup) {
                    this.transformGroup.style.transition = '';
                }
            }, 550);

        } catch (e) {
            console.error(`Error focusing on ${territoryId}:`, e);
        }
    }

    getTerritory(id) {
        return this.territories.get(id);
    }

    getAllTerritories() {
        return Array.from(this.territories.values());
    }

    resetStyles() {
        this.territories.forEach(territory => territory.resetStyles());
    }
} 