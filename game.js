// === Проверка режима отладки ===
const urlParams = new URLSearchParams(window.location.search);
const isDebugMode = urlParams.get('debug') === 'true';

if (isDebugMode) {
    console.log("--- РЕЖИМ ОТЛАДКИ АКТИВИРОВАН: Кубик всегда будет показывать 6 ---");
}

// === Глобальные переменные ===
let currentPlayer = 1;
let diceResult = 0;
let gameOver = false;
let canCaptureCountry = false;
let svgDoc = null;
let svgRoot = null;
let transformGroup = null;

const playerScores = { 1: 0, 2: 0, 3: 0, 4: 0 };
let countryOwners = {};
const playerStartTerritories = {};

// === Структура данных для смежных территорий ===
const adjacencyMatrix = {};

// === Функция для определения смежных территорий ===
function findAdjacentTerritories(path1, path2) {
    try {
        const bbox1 = path1.getBBox();
        const bbox2 = path2.getBBox();
        
        // Проверяем пересечение bounding boxes с небольшим допуском
        const tolerance = 1;
        if (!(bbox1.x > bbox2.x + bbox2.width + tolerance ||
              bbox1.x + bbox1.width < bbox2.x - tolerance ||
              bbox1.y > bbox2.y + bbox2.height + tolerance ||
              bbox1.y + bbox1.height < bbox2.y - tolerance)) {
            return true;
        }
    } catch (e) {
        console.error("Error checking adjacency:", e);
    }
    return false;
}

// === Функция для построения матрицы смежности ===
function buildAdjacencyMatrix() {
    if (!svgDoc) return;
    
    const paths = Array.from(svgDoc.querySelectorAll("path[id]"));
    
    paths.forEach(path1 => {
        const id1 = path1.id;
        adjacencyMatrix[id1] = [];
        
        paths.forEach(path2 => {
            const id2 = path2.id;
            if (id1 !== id2 && findAdjacentTerritories(path1, path2)) {
                adjacencyMatrix[id1].push(id2);
            }
        });
    });
    
    console.log("Adjacency matrix built:", adjacencyMatrix);
}

// === Функция проверки возможности захвата территории ===
function canCaptureTerritory(territoryId) {
    // Если это первый ход игрока, разрешаем захват любой незанятой территории
    if (playerScores[currentPlayer] === 0) {
        return countryOwners[territoryId] === 0;
    }
    
    // Проверяем наличие смежных территорий, принадлежащих игроку
    const hasAdjacentOwnTerritory = adjacencyMatrix[territoryId]?.some(neighborId => 
        countryOwners[neighborId] === currentPlayer
    ) || false;

    // Территория должна быть либо незанятой, либо принадлежать другому игроку
    const isValidTarget = countryOwners[territoryId] === 0 || 
                         (countryOwners[territoryId] !== currentPlayer && 
                          countryOwners[territoryId] !== undefined);

    return hasAdjacentOwnTerritory && isValidTarget;
}

// === Функция подсветки доступных территорий ===
function highlightAvailableTerritories() {
    if (!canCaptureCountry || !svgDoc) return;
    
    // Сначала убираем все подсветки
    svgDoc.querySelectorAll("path[id]").forEach(path => {
        path.classList.remove('available-territory', 'unavailable-territory', 'capturable-enemy-territory');
    });
    
    // Проверяем все территории
    Object.keys(countryOwners).forEach(territoryId => {
        const owner = countryOwners[territoryId];
        const path = svgDoc.getElementById(territoryId);
        if (!path) return;

        if (canCaptureTerritory(territoryId)) {
            // Если территория принадлежит другому игроку, подсвечиваем как вражескую
            if (owner !== 0 && owner !== currentPlayer) {
                path.classList.add('capturable-enemy-territory');
            } else if (owner === 0) {
                path.classList.add('available-territory');
            }
        } else if (owner === 0) {
            path.classList.add('unavailable-territory');
        }
    });
}

// === Переменные для зума/панорамирования ===
let currentScale = 1;
let currentTranslateX = 0;
let currentTranslateY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
// Убрали panStartTranslateX/Y, будем использовать дельту напрямую
const MIN_SCALE = 0.5;
const MAX_SCALE = 10;
const ZOOM_SPEED = 1.1;
let contentBBox = null; // Для хранения BBox контента карты

// Цвета игроков
function getPlayerColor(player) { /* ... (без изменений) ... */
    switch (player) {
        case 1: return "#e63946"; case 2: return "#3a86ff";
        case 3: return "#2ec4b6"; case 4: return "#ffbe0b";
        default: return "#cccccc";
    }
}

// Перемешивание массива
function shuffleArray(array) { /* ... (без изменений) ... */
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// *** НОВАЯ ФУНКЦИЯ: Ограничение смещения (Translate) ***
function clampTranslate() {
    if (!svgRoot || !transformGroup || !contentBBox || contentBBox.width === 0 || contentBBox.height === 0) {
        // console.warn("Cannot clamp translate: Missing data or zero bbox size.");
        return; // Не можем ограничить без данных
    }

    const viewWidth = svgRoot.clientWidth;
    const viewHeight = svgRoot.clientHeight;

    // Размеры контента с учетом масштаба
    const scaledContentWidth = contentBBox.width * currentScale;
    const scaledContentHeight = contentBBox.height * currentScale;

    // Максимальное смещение (левый/верхний край контента не правее/ниже левого/верхнего края вьюпорта)
    // Если контент меньше вьюпорта, позволяем центрировать (или любое положение внутри)
    let maxTx = 0;
    let maxTy = 0;
    if (scaledContentWidth < viewWidth) {
         // Позволяем двигать от левого края (0) до правого края (viewWidth - scaledContentWidth)
         maxTx = viewWidth - scaledContentWidth;
    }
     if (scaledContentHeight < viewHeight) {
         maxTy = viewHeight - scaledContentHeight;
     }
     // Начальная точка контента (contentBBox.x/y) должна быть учтена
     // maxTx - это максимальное значение, на которое можно сдвинуть *относительно начала координат*.
     // Реальное ограничение левого края: currentTranslateX должен быть <= -contentBBox.x * currentScale
     // Но если карта меньше вьюпорта, то currentTranslateX должен быть <= viewWidth - (contentBBox.x + contentBBox.width) * currentScale
     maxTx = (scaledContentWidth > viewWidth) ? -contentBBox.x * currentScale : (viewWidth - (contentBBox.x + contentBBox.width) * currentScale);
     maxTy = (scaledContentHeight > viewHeight) ? -contentBBox.y * currentScale : (viewHeight - (contentBBox.y + contentBBox.height) * currentScale);


    // Минимальное смещение (правый/нижний край контента не левее/выше правого/нижнего края вьюпорта)
    // minTx = viewWidth - (contentBBox.x + contentBBox.width) * currentScale;
    let minTx = viewWidth - (contentBBox.x + contentBBox.width) * currentScale;
    let minTy = viewHeight - (contentBBox.y + contentBBox.height) * currentScale;


    // Если контент меньше вьюпорта, минимальное смещение - это 0 (нельзя сдвинуть левее/выше нуля)
    if (scaledContentWidth < viewWidth) {
        minTx = -contentBBox.x * currentScale; // Минимальный сдвиг - это когда левый край карты у левого края экрана
        maxTx = viewWidth - (contentBBox.x + contentBBox.width) * currentScale; // Максимальный - когда правый край карты у правого края экрана
        // Если карта совсем маленькая, можно и центрировать:
        // currentTranslateX = (viewWidth - scaledContentWidth) / 2 - contentBBox.x * currentScale;
    }
     if (scaledContentHeight < viewHeight) {
        minTy = -contentBBox.y * currentScale;
        maxTy = viewHeight - (contentBBox.y + contentBBox.height) * currentScale;
        // currentTranslateY = (viewHeight - scaledContentHeight) / 2 - contentBBox.y * currentScale;
    }

     // Применяем ограничения
     currentTranslateX = Math.max(minTx, Math.min(maxTx, currentTranslateX));
     currentTranslateY = Math.max(minTy, Math.min(maxTy, currentTranslateY));

    // console.log(`Clamped Tx: ${currentTranslateX} (Min: ${minTx}, Max: ${maxTx}), Ty: ${currentTranslateY} (Min: ${minTy}, Max: ${maxTy})`);
}


// Применить трансформацию (с ограничением)
function applyTransform(isFocusing = false) { // Добавим флаг, чтобы при фокусировке не ограничивать сразу
    if (!transformGroup) return;

    // Ограничиваем смещение, только если это не результат фокусировки (даем ей шанс сначала сдвинуть)
     if (!isFocusing) {
        clampTranslate();
     }

    const transform = `translate(${currentTranslateX}, ${currentTranslateY}) scale(${currentScale})`;
    transformGroup.setAttribute('transform', transform);
    // console.log('Applying transform:', transform);
}

// Координаты экрана в SVG
function getSVGPoint(screenX, screenY) { /* ... (без изменений, но проверим CTM) ... */
    if (!svgRoot) return { x: 0, y: 0 };
    const pt = svgRoot.createSVGPoint();
    pt.x = screenX;
    pt.y = screenY;
    try {
        // Используем getScreenCTM() корневого SVG, т.к. события на нем
        const ctm = svgRoot.getScreenCTM();
        if (!ctm) {
             console.warn("getScreenCTM is null in getSVGPoint");
             const svgRect = svgRoot.getBoundingClientRect();
             return { x: screenX - svgRect.left, y: screenY - svgRect.top };
        }
        return pt.matrixTransform(ctm.inverse());
    } catch (e) {
        console.error("Matrix transform error:", e);
        const svgRect = svgRoot.getBoundingClientRect();
        return { x: screenX - svgRect.left, y: screenY - svgRect.top };
    }
}

// Назначение стартовых территорий
function assignStartingTerritories() { /* ... (без изменений) ... */
    if (!svgDoc) { console.error("SVG doc not loaded for assignStart"); return; }
    const numberOfPlayers = 4;
    const startingTerritoriesPerPlayer = 1;
    Object.keys(playerStartTerritories).forEach(p => delete playerStartTerritories[p]);

    const unassignedCountryIDs = Object.keys(countryOwners).filter(id => countryOwners[id] === 0 && id !== "");
    const totalStartingTerritories = numberOfPlayers * startingTerritoriesPerPlayer;

    if (unassignedCountryIDs.length < totalStartingTerritories) {
        console.warn(`Not enough free countries (${unassignedCountryIDs.length})`);
    }

    shuffleArray(unassignedCountryIDs);
    let assignedCountOverall = 0;
    let countryIndex = 0;
    console.log(`Assigning ${startingTerritoriesPerPlayer} start territories...`);

    for (let player = 1; player <= numberOfPlayers; player++) {
        let assignedToCurrentPlayer = 0;
        while (assignedToCurrentPlayer < startingTerritoriesPerPlayer && countryIndex < unassignedCountryIDs.length) {
            const countryIdToAssign = unassignedCountryIDs[countryIndex];
            const countryPath = svgDoc.getElementById(countryIdToAssign);
            countryIndex++;
            if (countryPath && countryOwners[countryIdToAssign] === 0) {
                countryOwners[countryIdToAssign] = player;
                playerScores[player]++;
                if (assignedToCurrentPlayer === 0) {
                    playerStartTerritories[player] = countryIdToAssign;
                    console.log(`Player ${player} starts in ${countryIdToAssign}`);
                }
                assignedToCurrentPlayer++; assignedCountOverall++;
            } else {
                console.error(`Failed to assign ${countryIdToAssign} to Player ${player}. Path found: ${!!countryPath}, Owner: ${countryOwners[countryIdToAssign]}. Trying next.`);
            }
        }
        if (assignedToCurrentPlayer < startingTerritoriesPerPlayer) {
            console.warn(`Failed to assign start territory to Player ${player}.`);
        }
    }
    console.log(`Start territory assignment done. Assigned: ${assignedCountOverall}`);
}

// Фокусировка на элементе
function focusOnElement(elementId, targetScale = 3) { /* ... (Модифицирован вызов applyTransform) ... */
    if (!svgDoc || !transformGroup) return;
    const element = svgDoc.getElementById(elementId);
    if (!element) { console.warn(`Element "${elementId}" not found for focus.`); return; }

    try {
        let bbox = element.getBBox();
        if (!bbox || bbox.width === 0 || bbox.height === 0) { /* ... (фоллбэк на точку path без изменений) ... */
            console.warn(`Invalid BBox for ${elementId}. Trying path point.`);
             if (element.tagName.toLowerCase() === 'path' && element.getTotalLength && element.getTotalLength() > 0) {
                 const point = element.getPointAtLength(0);
                 bbox = { x: point.x, y: point.y, width: 1, height: 1 };
             } else { return; }
        }

        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;
        targetScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));

        const svgObject = document.getElementById("svgMap");
        const viewWidth = svgObject?.clientWidth ?? 600;
        const viewHeight = svgObject?.clientHeight ?? 400;

        currentScale = targetScale;
        currentTranslateX = viewWidth / 2 - centerX * currentScale;
        currentTranslateY = viewHeight / 2 - centerY * currentScale;

        // Ограничиваем смещение ПОСЛЕ расчета центрирования
        clampTranslate(); // Вызываем clamp здесь

        transformGroup.style.transition = 'transform 0.5s ease-out';
        applyTransform(true); // Вызываем applyTransform с флагом isFocusing=true

        setTimeout(() => {
            if (transformGroup) transformGroup.style.transition = '';
        }, 550);

    } catch (e) {
        console.error(`Error focusing on ${elementId}:`, e);
    }
}


// === DOMContentLoaded ===
document.addEventListener("DOMContentLoaded", () => {
    // ... (получение элементов без изменений) ...
    const rollBtn = document.getElementById("roll-btn");
    const endTurnBtn = document.getElementById("end-turn-btn");
    const diceEl = document.getElementById("dice");
    const turnStatus = document.getElementById("turn-status");
    const currentPlayerEl = document.getElementById("current-player");
    const scoresContainer = document.getElementById("scores-container");
    const svgObject = document.getElementById("svgMap");

    rollBtn.disabled = true; endTurnBtn.disabled = true;
    updateScoresTable(); updatePlayerPanel();

    rollBtn.addEventListener("click", rollDice);
    endTurnBtn.addEventListener("click", endTurn);

    svgObject.addEventListener("load", () => {
        console.log("SVG loaded.");
        try {
            svgDoc = svgObject.contentDocument;
            if (!svgDoc) throw new Error("contentDocument is null");
            svgRoot = svgDoc.querySelector("svg");
            if (!svgRoot) throw new Error("<svg> root not found");
            console.log("svgDoc, svgRoot obtained.");

            // --- Группа трансформации ---
            transformGroup = svgDoc.getElementById('map-transform-group');
            if (!transformGroup) {
                console.log("Creating map-transform-group...");
                transformGroup = svgDoc.createElementNS("http://www.w3.org/2000/svg", "g");
                transformGroup.id = 'map-transform-group';
                 const elementsToMove = Array.from(svgRoot.childNodes).filter(node =>
                     node.nodeType === 1 && // Только элементы
                     node.nodeName !== 'style' &&
                     node.nodeName !== 'defs' && // Не перемещаем <defs>
                     node.id !== 'map-transform-group' &&
                     node.id !== 'game-style' // Не перемещаем наш стиль
                 );
                elementsToMove.forEach(el => transformGroup.appendChild(el));
                // Добавляем группу после <defs> и <style>, если они есть
                 const firstElement = svgRoot.querySelector(':scope > *:not(style):not(defs)');
                 if (firstElement) {
                     svgRoot.insertBefore(transformGroup, firstElement);
                 } else {
                     svgRoot.appendChild(transformGroup); // Если нет других элементов
                 }
                console.log(`Moved ${elementsToMove.length} elements into the group.`);
            } else {
                console.log("Found existing map-transform-group.");
            }

             // *** Получаем BBox контента ПОСЛЕ создания группы и перемещения ***
             try {
                 contentBBox = transformGroup.getBBox();
                 console.log("Content BBox:", contentBBox);
                  if(contentBBox.width === 0 || contentBBox.height === 0) {
                       console.warn("Content BBox has zero width or height. Clamping might not work correctly.");
                  }
             } catch (e) {
                 console.error("Error getting BBox of transformGroup:", e);
                 contentBBox = null; // Сбрасываем, если ошибка
             }

            currentScale = 1; currentTranslateX = 0; currentTranslateY = 0;
            applyTransform(); // Применяем начальный сброс
            transformGroup.style.transition = '';

            // --- Инициализация стран ---
            countryOwners = {}; let validCountryCount = 0;
            svgDoc.querySelectorAll("path[id]").forEach(path => { /* ... (без изменений) ... */
                 const id = path.id;
                 countryOwners[id] = 0;
                 path.addEventListener("click", () => handleCountryClick(id, path));
                 validCountryCount++;
             });
            console.log(`Initialized ${validCountryCount} countries.`);
            if (validCountryCount === 0) throw new Error("No countries with valid ID found!");

            // --- Построение матрицы смежности ---
            buildAdjacencyMatrix();

            // --- Стили ---
            let styleElem = svgDoc.getElementById('game-style');
            if (!styleElem) {
                styleElem = svgDoc.createElementNS("http://www.w3.org/2000/svg", "style");
                styleElem.id = 'game-style';
                svgRoot.insertBefore(styleElem, svgRoot.firstChild);
            }
             styleElem.textContent = `
               path[id] { stroke: #222; stroke-width: 0.5; cursor: pointer; transition: fill 0.3s ease, opacity 0.3s ease, stroke-width 0.2s ease, stroke 0.2s ease; vector-effect: non-scaling-stroke; }
               path[id]:not(.no-interaction):hover { opacity: 0.7; stroke: #fff; stroke-width: 1; }
               path.highlight { stroke: #FF0 !important; stroke-width: 2 !important; opacity: 1 !important; z-index: 10; position: relative;}
               path.dimmed { opacity: 0.4 !important; fill-opacity: 0.4 !important; }
               path.no-interaction { cursor: default; pointer-events: none; }
               path.no-interaction:hover { opacity: inherit; stroke-width: 0.5; stroke: #222; }
               path.available-territory { stroke: #4CAF50; stroke-width: 2; cursor: pointer; }
               path.unavailable-territory { opacity: 0.4; cursor: not-allowed; }
               path.capturable-enemy-territory { stroke: #FF0000; stroke-width: 2; cursor: pointer; }
               #map-transform-group { transform-origin: 0 0; }
               svg { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
             `;

            // --- Старт игры ---
            Object.keys(playerScores).forEach(p => playerScores[p] = 0);
            assignStartingTerritories();
            Object.keys(countryOwners).forEach(id => { /* ... (обновление цветов без изменений) ... */
                const path = svgDoc.getElementById(id);
                if(path) { path.style.fill = getPlayerColor(countryOwners[id]); path.classList.remove('highlight', 'dimmed', 'no-interaction'); path.style.opacity = 1; path.style.fillOpacity = 1; }
            });
            updateScoresTable();

            gameOver = false; currentPlayer = 1; canCaptureCountry = false; diceResult = 0;
            if(diceEl) diceEl.textContent = "?"; updatePlayerPanel();

            if(rollBtn) rollBtn.disabled = false; if(endTurnBtn) endTurnBtn.disabled = true;
            if(turnStatus) turnStatus.textContent = `Ход Игрока ${currentPlayer}. Бросьте кубик!`;

            // --- Регистрация обработчиков зума/пана на svgRoot ---
             console.log("Adding map interaction handlers to svgRoot.");
             addMapInteractionHandlers(svgRoot); // Передаем КОРНЕВОЙ ЭЛЕМЕНТ SVG

        } catch (error) { /* ... (обработка ошибок без изменений) ... */
            console.error("Critical error during SVG init:", error);
            if(turnStatus) turnStatus.textContent = `Map Load Error: ${error.message}. Refresh page.`;
            if(rollBtn) rollBtn.disabled = true; if(endTurnBtn) endTurnBtn.disabled = true;
        }
    }); // Конец svgObject.addEventListener("load", ...)

    // --- Обработчики взаимодействия с картой (зум/пан) ---
    function addMapInteractionHandlers(svgElement) {
        if (!svgElement || !transformGroup) {
            console.error("Cannot add map handlers: svgElement or transformGroup is missing.");
            return;
        }

        // -- Зум --
        svgElement.addEventListener('wheel', (event) => {
            // console.log('Wheel event:', event.deltaY);
            event.preventDefault();
            if (!transformGroup) return;

            const zoomFactor = event.deltaY < 0 ? ZOOM_SPEED : 1 / ZOOM_SPEED;
            const oldScale = currentScale;
            const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, currentScale * zoomFactor));

            const point = getSVGPoint(event.clientX, event.clientY);

            currentTranslateX = point.x - (point.x - currentTranslateX) * (newScale / oldScale);
            currentTranslateY = point.y - (point.y - currentTranslateY) * (newScale / oldScale);
            currentScale = newScale;

            transformGroup.style.transition = '';
            applyTransform(); // clampTranslate будет вызван внутри applyTransform
        }, { passive: false });

        // -- Панорамирование --
        svgElement.addEventListener('mousedown', (event) => {
            if (event.button !== 0 || !transformGroup) return; // Только левая кнопка
            event.preventDefault();
             console.log('Pan start'); // DEBUG
            isPanning = true;
            // Сохраняем начальные координаты мыши НА ЭКРАНЕ
            panStartX = event.clientX;
            panStartY = event.clientY;
            svgElement.style.cursor = 'grabbing';

             // !!! Вешаем обработчики на сам svgElement !!!
            svgElement.addEventListener('mousemove', handlePanning);
            svgElement.addEventListener('mouseup', stopPanning);
            svgElement.addEventListener('mouseleave', stopPanning); // Останавливаем, если вышли за пределы SVG
        });

        function handlePanning(event) {
            if (!isPanning) return;
            // console.log('Panning...'); // DEBUG (слишком много)
            event.preventDefault();

             // Смещение мыши на ЭКРАНЕ с начала пана
             const dx = event.clientX - panStartX;
             const dy = event.clientY - panStartY;

             // Применяем смещение к текущему translate, деля на масштаб
             // (смещение в пикселях экрана соответствует меньшему смещению в координатах SVG при увеличении)
             currentTranslateX += dx / currentScale;
             currentTranslateY += dy / currentScale;

            applyTransform(); // clampTranslate будет вызван внутри

            // Обновляем стартовые точки для следующего шага mousemove
            panStartX = event.clientX;
            panStartY = event.clientY;
        }

        function stopPanning(event) {
             // Проверяем, что это левая кнопка (для mouseup) или что isPanning был true
            if (isPanning && (event.type !== 'mouseup' || event.button === 0)) {
                 console.log('Pan stop'); // DEBUG
                 isPanning = false;
                 svgElement.style.cursor = 'grab';
                 // !!! Удаляем обработчики с svgElement !!!
                 svgElement.removeEventListener('mousemove', handlePanning);
                 svgElement.removeEventListener('mouseup', stopPanning);
                 svgElement.removeEventListener('mouseleave', stopPanning);
            }
        }

        svgElement.style.cursor = 'grab';
        console.log("Map interaction handlers added successfully.");
    }


    // --- Остальные функции игры (без изменений) ---
    function handleCountryClick(countryId, pathElem) { /* ... */
        if (gameOver) return;
        if (canCaptureCountry) captureCountry(countryId, pathElem);
        else {
            const owner = countryOwners[countryId];
            if(turnStatus) turnStatus.textContent = owner > 0 ? `Страна ${countryId} принадлежит Игроку ${owner}. Ваш счет: ${playerScores[currentPlayer]}.` : `Страна ${countryId} нейтральна. Выбросите 6 для захвата.`;
            console.log(`Клик ${countryId}. Owner: ${owner}. Захват ${canCaptureCountry}.`);
        }
    }
    function rollDice() {
        if (gameOver || !rollBtn || rollBtn.disabled) return;
        if(diceEl) diceEl.textContent = "...";
        if(diceEl) diceEl.classList.add("rolling");
        rollBtn.disabled = true;
        if(endTurnBtn) endTurnBtn.disabled = true;
        canCaptureCountry = false;
        if(turnStatus) turnStatus.textContent = "Бросаем кубик...";
        
        // Убираем подсветку территорий при броске
        if(svgDoc) {
            svgDoc.querySelectorAll("path[id]").forEach(path => {
                path.classList.remove('available-territory', 'unavailable-territory', 'capturable-enemy-territory');
            });
        }
        
        setTimeout(() => {
            diceResult = isDebugMode ? 6 : Math.floor(Math.random() * 6) + 1;
            if(isDebugMode) console.log("Debug: Force dice = 6");
            if(diceEl) diceEl.textContent = diceResult;
            if(diceEl) {
                diceEl.classList.remove("rolling");
                diceEl.classList.add("pulse-effect");
            }
            
            setTimeout(() => {
                if(diceEl) diceEl.classList.remove("pulse-effect");
                if (diceResult === 6) {
                    const hasFreeCountries = Object.values(countryOwners).some(o => o === 0);
                    if(hasFreeCountries) {
                        canCaptureCountry = true;
                        if(turnStatus) turnStatus.textContent = "Выпала 6! Кликните по СВОБОДНОЙ стране для захвата или завершите ход.";
                        highlightAvailableTerritories(); // Подсвечиваем доступные территории
                    } else {
                        if(turnStatus) turnStatus.textContent = "Выпала 6, но нет свободных стран! Завершите ход.";
                    }
                } else {
                    if(turnStatus) turnStatus.textContent = `Выпало ${diceResult}. Завершите ход.`;
                }
                if (!gameOver && endTurnBtn) endTurnBtn.disabled = false;
            }, 400);
        }, 800);
    }
    function captureCountry(countryId, pathElem) {
        if (!canCaptureCountry || gameOver) return;
        
        // Проверяем возможность захвата территории
        if (!canCaptureTerritory(countryId)) {
            if(turnStatus) turnStatus.textContent = `Вы можете захватить только территорию, граничащую с вашими владениями!`;
            return;
        }

        const previousOwner = countryOwners[countryId];
        
        // Захватываем территорию
        console.log(`Player ${currentPlayer} captures ${countryId} from Player ${previousOwner}`);
        countryOwners[countryId] = currentPlayer;
        playerScores[currentPlayer]++;
        
        // Если территория была захвачена у другого игрока, уменьшаем его счет
        if (previousOwner > 0) {
            playerScores[previousOwner]--;
        }
        
        pathElem.style.fill = getPlayerColor(currentPlayer);
        pathElem.style.opacity = 1;
        pathElem.style.fillOpacity = 1;
        
        if(turnStatus) {
            if (previousOwner > 0) {
                turnStatus.textContent = `Игрок ${currentPlayer} захватил ${countryId} у Игрока ${previousOwner}! Завершите ход.`;
            } else {
                turnStatus.textContent = `Игрок ${currentPlayer} захватил ${countryId}! Завершите ход.`;
            }
        }
        
        canCaptureCountry = false;
        updateScoresTable();
        checkWinCondition();
    }
    function endTurn() {
        if (gameOver || !endTurnBtn || endTurnBtn.disabled) return;
        
        // Убираем подсветку территорий при завершении хода
        if(svgDoc) {
            svgDoc.querySelectorAll("path[id]").forEach(path => {
                path.classList.remove('available-territory', 'unavailable-territory', 'capturable-enemy-territory');
            });
        }
        
        currentPlayer = (currentPlayer % 4) + 1;
        diceResult = 0;
        canCaptureCountry = false;
        if(rollBtn) rollBtn.disabled = false;
        endTurnBtn.disabled = true;
        if(diceEl) diceEl.textContent = "?";
        if(turnStatus) turnStatus.textContent = `Ход Игрока ${currentPlayer}. Бросьте кубик!`;
        updatePlayerPanel();
    }
    function updatePlayerPanel() { /* ... */
        const colors = ["player-1", "player-2", "player-3", "player-4"];
        const playerInfoEl = document.getElementById("current-player");
        if (playerInfoEl) { playerInfoEl.classList.remove(...colors); playerInfoEl.classList.add(colors[currentPlayer - 1]); playerInfoEl.textContent = `Игрок ${currentPlayer}`; }
    }
    function checkWinCondition() { /* ... */
        const winThreshold = 15;
        if (playerScores[currentPlayer] >= winThreshold) { endGame(`ИГРОК ${currentPlayer} ПОБЕДИЛ`, currentPlayer); return; }
        const totalCountriesWithId = Object.keys(countryOwners).filter(id => id).length;
        const totalCaptured = Object.values(countryOwners).filter(o => o > 0).length;
        if (totalCountriesWithId > 0 && totalCaptured >= totalCountriesWithId) {
             console.log(`All ${totalCountriesWithId} countries captured. Checking winner by score.`);
            let maxScore = -1; let winners = [];
            for (let p = 1; p <= 4; p++) { if (playerScores[p] > maxScore) { maxScore = playerScores[p]; winners = [p]; } else if (playerScores[p] === maxScore) { winners.push(p); } }
            if (winners.length === 1 && maxScore >= 0) { endGame(`ИГРОК ${winners[0]} ПОБЕДИЛ ПО ОЧКАМ (${maxScore} стран)`, winners[0]); }
            else { const txt = winners.length > 0 ? ` Лидеры по ${maxScore}.` : ""; endGame(`НИЧЬЯ! Все страны захвачены.${txt}`); }
        }
     }
    function endGame(message, winnerPlayer = null) { /* ... */
        if (gameOver) return; gameOver = true;
        if(turnStatus) turnStatus.textContent = `=== ${message} ===`;
        if(rollBtn) rollBtn.disabled = true; if(endTurnBtn) endTurnBtn.disabled = true;
        canCaptureCountry = false; console.log(`Game Over! ${message}`);
        applyEndGameStyles(winnerPlayer);
     }
    function applyEndGameStyles(winnerPlayer) { /* ... */
        if (!svgDoc) return;
        svgDoc.querySelectorAll("path[id]").forEach(path => {
            const owner = countryOwners[path.id]; path.classList.remove('highlight', 'dimmed', 'no-interaction'); path.classList.add('no-interaction');
            if (winnerPlayer !== null) { if (owner === winnerPlayer) path.classList.add('highlight'); else path.classList.add('dimmed'); }
            else { path.classList.add('dimmed'); }
        });
     }
    function updateScoresTable() { /* ... */
        const scoresContainer = document.getElementById("scores-container"); if (!scoresContainer) return; scoresContainer.innerHTML = "";
        for (let p = 1; p <= 4; p++) {
            const div = document.createElement("div"); div.className = "player-score"; div.setAttribute('role', 'button'); div.setAttribute('tabindex', '0'); div.setAttribute('aria-label', `Показать старт Игрока ${p}`);
            const marker = document.createElement('span'); Object.assign(marker.style, { display: 'inline-block', width: '12px', height: '12px', backgroundColor: getPlayerColor(p), marginRight: '8px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.5)', verticalAlign: 'middle', flexShrink: '0' });
            div.appendChild(marker); div.appendChild(document.createTextNode(`Игрок ${p}: ${playerScores[p]}`));
            div.addEventListener('click', () => { const id = playerStartTerritories[p]; if (id) focusOnElement(id); else console.log(`Start territory for Player ${p} not found.`); });
            div.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); div.click(); } });
            scoresContainer.appendChild(div);
        }
     }

}); // Конец DOMContentLoaded