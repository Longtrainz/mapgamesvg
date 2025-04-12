export function findAdjacentTerritories(path1, path2) {
    try {
        const bbox1 = path1.getBBox();
        const bbox2 = path2.getBBox();
        
        // Проверяем пересечение bounding boxes с небольшим допуском
        const tolerance = 1;
        return !(bbox1.x > bbox2.x + bbox2.width + tolerance ||
                bbox1.x + bbox1.width < bbox2.x - tolerance ||
                bbox1.y > bbox2.y + bbox2.height + tolerance ||
                bbox1.y + bbox1.height < bbox2.y - tolerance);
    } catch (e) {
        console.error("Error checking adjacency:", e);
        return false;
    }
}

export function getSVGPoint(svgRoot, screenX, screenY) {
    if (!svgRoot) return { x: 0, y: 0 };
    
    const pt = svgRoot.createSVGPoint();
    pt.x = screenX;
    pt.y = screenY;
    
    try {
        const ctm = svgRoot.getScreenCTM();
        if (!ctm) {
            console.warn("getScreenCTM is null in getSVGPoint");
            const svgRect = svgRoot.getBoundingClientRect();
            return { 
                x: screenX - svgRect.left, 
                y: screenY - svgRect.top 
            };
        }
        return pt.matrixTransform(ctm.inverse());
    } catch (e) {
        console.error("Matrix transform error:", e);
        const svgRect = svgRoot.getBoundingClientRect();
        return { 
            x: screenX - svgRect.left, 
            y: screenY - svgRect.top 
        };
    }
}

export function clampTransform(svgRoot, transformGroup, contentBBox, currentScale, translate) {
    if (!svgRoot || !transformGroup || !contentBBox || contentBBox.width === 0 || contentBBox.height === 0) {
        return translate;
    }

    const viewWidth = svgRoot.clientWidth;
    const viewHeight = svgRoot.clientHeight;
    const scaledContentWidth = contentBBox.width * currentScale;
    const scaledContentHeight = contentBBox.height * currentScale;

    let { x: currentTranslateX, y: currentTranslateY } = translate;

    // Вычисляем ограничения для смещения
    let maxTx = (scaledContentWidth > viewWidth) 
        ? -contentBBox.x * currentScale 
        : (viewWidth - (contentBBox.x + contentBBox.width) * currentScale);
    
    let maxTy = (scaledContentHeight > viewHeight) 
        ? -contentBBox.y * currentScale 
        : (viewHeight - (contentBBox.y + contentBBox.height) * currentScale);

    let minTx = viewWidth - (contentBBox.x + contentBBox.width) * currentScale;
    let minTy = viewHeight - (contentBBox.y + contentBBox.height) * currentScale;

    // Корректируем ограничения для маленьких масштабов
    if (scaledContentWidth < viewWidth) {
        minTx = -contentBBox.x * currentScale;
        maxTx = viewWidth - (contentBBox.x + contentBBox.width) * currentScale;
    }
    
    if (scaledContentHeight < viewHeight) {
        minTy = -contentBBox.y * currentScale;
        maxTy = viewHeight - (contentBBox.y + contentBBox.height) * currentScale;
    }

    // Применяем ограничения
    return {
        x: Math.max(minTx, Math.min(maxTx, currentTranslateX)),
        y: Math.max(minTy, Math.min(maxTy, currentTranslateY))
    };
}

export function applyTransform(transformGroup, translate, scale) {
    if (!transformGroup) return;
    const transform = `translate(${translate.x}, ${translate.y}) scale(${scale})`;
    transformGroup.setAttribute('transform', transform);
} 