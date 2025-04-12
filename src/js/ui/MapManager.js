import { MIN_SCALE, MAX_SCALE, ZOOM_SPEED } from '../constants/gameConstants.js';

export class MapManager {
    constructor(svgRoot, transformGroup) {
        this.svgRoot = svgRoot;
        this.transformGroup = transformGroup;
        this.svgDoc = svgRoot.ownerDocument;
        this.currentScale = 1;
        this.currentTranslateX = 0;
        this.currentTranslateY = 0;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.contentBBox = null;

        this.initializeMap();
    }

    initializeMap() {
        if (!this.transformGroup || !this.svgRoot) return;

        try {
            this.contentBBox = this.transformGroup.getBBox();
            this.setupEventListeners();
            this.applyTransform();
        } catch (error) {
            console.error('Error initializing map:', error);
        }
    }

    setupEventListeners() {
        // Zoom handling
        this.svgRoot.addEventListener('wheel', this.handleZoom.bind(this), { passive: false });

        // Pan handling
        this.svgRoot.addEventListener('mousedown', this.startPanning.bind(this));
        this.svgRoot.style.cursor = 'grab';
    }

    handleZoom(event) {
        event.preventDefault();
        if (!this.transformGroup) return;

        const zoomFactor = event.deltaY < 0 ? ZOOM_SPEED : 1 / ZOOM_SPEED;
        const oldScale = this.currentScale;
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.currentScale * zoomFactor));

        const point = this.getSVGPoint(event.clientX, event.clientY);

        this.currentTranslateX = point.x - (point.x - this.currentTranslateX) * (newScale / oldScale);
        this.currentTranslateY = point.y - (point.y - this.currentTranslateY) * (newScale / oldScale);
        this.currentScale = newScale;

        this.transformGroup.style.transition = '';
        this.applyTransform();
    }

    startPanning(event) {
        if (event.button !== 0 || !this.transformGroup) return;
        event.preventDefault();

        this.isPanning = true;
        this.panStartX = event.clientX;
        this.panStartY = event.clientY;
        this.svgRoot.style.cursor = 'grabbing';

        const handlePanMove = this.handlePanning.bind(this);
        const stopPan = this.stopPanning.bind(this);

        this.svgRoot.addEventListener('mousemove', handlePanMove);
        this.svgRoot.addEventListener('mouseup', stopPan);
        this.svgRoot.addEventListener('mouseleave', stopPan);

        // Store handlers for removal
        this._currentPanHandlers = { move: handlePanMove, stop: stopPan };
    }

    handlePanning(event) {
        if (!this.isPanning) return;
        event.preventDefault();

        const dx = event.clientX - this.panStartX;
        const dy = event.clientY - this.panStartY;

        this.currentTranslateX += dx / this.currentScale;
        this.currentTranslateY += dy / this.currentScale;

        this.applyTransform();

        this.panStartX = event.clientX;
        this.panStartY = event.clientY;
    }

    stopPanning(event) {
        if (this.isPanning && (event.type !== 'mouseup' || event.button === 0)) {
            this.isPanning = false;
            this.svgRoot.style.cursor = 'grab';

            // Remove event listeners
            if (this._currentPanHandlers) {
                this.svgRoot.removeEventListener('mousemove', this._currentPanHandlers.move);
                this.svgRoot.removeEventListener('mouseup', this._currentPanHandlers.stop);
                this.svgRoot.removeEventListener('mouseleave', this._currentPanHandlers.stop);
                this._currentPanHandlers = null;
            }
        }
    }

    clampTranslate() {
        if (!this.svgRoot || !this.transformGroup || !this.contentBBox) return;

        const viewWidth = this.svgRoot.clientWidth;
        const viewHeight = this.svgRoot.clientHeight;
        const scaledContentWidth = this.contentBBox.width * this.currentScale;
        const scaledContentHeight = this.contentBBox.height * this.currentScale;

        let maxTx = (scaledContentWidth > viewWidth) 
            ? -this.contentBBox.x * this.currentScale 
            : (viewWidth - (this.contentBBox.x + this.contentBBox.width) * this.currentScale);
        
        let maxTy = (scaledContentHeight > viewHeight) 
            ? -this.contentBBox.y * this.currentScale 
            : (viewHeight - (this.contentBBox.y + this.contentBBox.height) * this.currentScale);

        let minTx = viewWidth - (this.contentBBox.x + this.contentBBox.width) * this.currentScale;
        let minTy = viewHeight - (this.contentBBox.y + this.contentBBox.height) * this.currentScale;

        if (scaledContentWidth < viewWidth) {
            minTx = -this.contentBBox.x * this.currentScale;
            maxTx = viewWidth - (this.contentBBox.x + this.contentBBox.width) * this.currentScale;
        }

        if (scaledContentHeight < viewHeight) {
            minTy = -this.contentBBox.y * this.currentScale;
            maxTy = viewHeight - (this.contentBBox.y + this.contentBBox.height) * this.currentScale;
        }

        this.currentTranslateX = Math.max(minTx, Math.min(maxTx, this.currentTranslateX));
        this.currentTranslateY = Math.max(minTy, Math.min(maxTy, this.currentTranslateY));
    }

    applyTransform(isFocusing = false) {
        if (!this.transformGroup) return;

        if (!isFocusing) {
            this.clampTranslate();
        }

        const transform = `translate(${this.currentTranslateX}, ${this.currentTranslateY}) scale(${this.currentScale})`;
        this.transformGroup.setAttribute('transform', transform);
    }

    getSVGPoint(screenX, screenY) {
        if (!this.svgRoot) return { x: 0, y: 0 };
        
        const pt = this.svgRoot.createSVGPoint();
        pt.x = screenX;
        pt.y = screenY;
        
        try {
            const ctm = this.svgRoot.getScreenCTM();
            if (!ctm) {
                const svgRect = this.svgRoot.getBoundingClientRect();
                return { x: screenX - svgRect.left, y: screenY - svgRect.top };
            }
            return pt.matrixTransform(ctm.inverse());
        } catch (e) {
            console.error("Matrix transform error:", e);
            const svgRect = this.svgRoot.getBoundingClientRect();
            return { x: screenX - svgRect.left, y: screenY - svgRect.top };
        }
    }

    focusOnElement(elementId, targetScale = 3) {
        if (!this.svgDoc || !this.transformGroup) return;
        const element = this.svgDoc.getElementById(elementId);
        if (!element) {
            console.warn(`Element ${elementId} not found for focus`);
            return;
        }

        try {
            let bbox = element.getBBox();
            if (!bbox || bbox.width === 0 || bbox.height === 0) {
                if (element.tagName.toLowerCase() === 'path' && element.getTotalLength && element.getTotalLength() > 0) {
                    const point = element.getPointAtLength(0);
                    bbox = { x: point.x, y: point.y, width: 1, height: 1 };
                } else {
                    console.warn(`Invalid bbox for element ${elementId}`);
                    return;
                }
            }

            const centerX = bbox.x + bbox.width / 2;
            const centerY = bbox.y + bbox.height / 2;
            this.currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));

            const viewWidth = this.svgRoot.clientWidth;
            const viewHeight = this.svgRoot.clientHeight;

            this.currentTranslateX = viewWidth / 2 - centerX * this.currentScale;
            this.currentTranslateY = viewHeight / 2 - centerY * this.currentScale;

            this.clampTranslate();

            this.transformGroup.style.transition = 'transform 0.5s ease-out';
            this.applyTransform(true);

            setTimeout(() => {
                if (this.transformGroup) {
                    this.transformGroup.style.transition = '';
                }
            }, 550);

        } catch (e) {
            console.error(`Error focusing on ${elementId}:`, e);
        }
    }
} 