/**
 * Reverse Desmos - Milestone 2.1: Locked Straight-Line Adjustment
 * 
 * State Machine:
 * 1. 'idle'          -> Waiting for user interaction.
 * 2. 'drawing'       -> User is actively drawing a freehand stroke with hold timer running.
 * 3. 'adjustingLine' -> Stroke recognized as a straight line. The start endpoint is locked,
 *                       and dragging smoothly adjusts the line's length and angle.
 */

// ==========================================
// 1. CONSTANTS & CONFIGURATION
// ==========================================
const DOMAIN = { min: -10, max: 10 };
const RANGE = { min: -10, max: 10 };

// Configuration for draw-and-hold recognition & adjustment
const SNAP_CONFIG = {
  holdDurationMs: 600,       // Duration pointer must stay still to trigger snap (ms)
  holdTolerancePx: 5,        // Max movement radius allowed while holding still (CSS pixels)
  minStrokeLengthPx: 30,     // Minimum straight-line span required to attempt snapping (CSS pixels)
  maxRmsDeviationPx: 6,      // Maximum allowed Root Mean Square perpendicular error (CSS pixels)
  maxPeakDeviationPx: 14,    // Maximum allowed single-point perpendicular error (CSS pixels)
  maxPathToSpanRatio: 1.25   // Rejects curves/loops (total stroke path length vs straight span)
};

// Visual styling constants for grid, strokes, and line preview
const STYLES = {
  gridBackground: '#ffffff',
  gridLine: '#e2e8f0',          // Subtle grey for 1-unit increments
  gridLineBold: '#cbd5e1',      // Medium grey for 5-unit increments
  axisLine: '#334155',          // Dark slate for major X & Y axes (x=0, y=0)
  axisText: '#64748b',          // Text color for numbers and labels
  strokeColor: '#2563eb',       // Royal blue for freehand strokes
  snapPreviewColor: '#0284c7',  // Cyan-blue for snapped & adjusted line
  endpointDotColor: '#0284c7',  // Highlight dot for line endpoints during adjustment
  strokeWidth: 3,               // Line thickness in CSS pixels
  fontFamily: 'Inter, system-ui, sans-serif'
};

// ==========================================
// 2. STATE MANAGEMENT
// ==========================================
// Explicit interaction state: 'idle' | 'drawing' | 'adjustingLine'
let appState = 'idle';

// List of all completed strokes. Each stroke is an array of {x, y} in graph coordinates.
let strokes = [];

// The raw freehand stroke currently being drawn by the user (in graph coordinates)
let currentStroke = null;

// Preserved copy of raw points at the moment recognition succeeds
let rawStrokeBackup = null;

// Snapped line segment: [fixedStartPoint, adjustableEndPoint] in graph coordinates
let snappedStroke = null;

// Flag to prevent immediate micro-tremors from displacing the fitted line until user moves > tolerance
let isAdjustingActively = false;

// Hold detection timer reference
let holdTimer = null;

// Anchor position in canvas CSS pixels where the user started holding
let holdAnchor = null;

// Active pointer ID to prevent multi-touch interference
let activePointerId = null;

// Display dimensions (in CSS pixels)
let displayWidth = 0;
let displayHeight = 0;

// ==========================================
// 3. DOM ELEMENT REFERENCES
// ==========================================
const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clear-btn');
const strokeCountDisplay = document.getElementById('stroke-count');
const statusBanner = document.getElementById('status-banner');
const statusText = document.getElementById('status-text');

// ==========================================
// 4. COORDINATE CONVERSION FUNCTIONS
// ==========================================

/**
 * Converts a point from Canvas CSS pixels (top-left is [0, 0], y goes DOWN)
 * to Mathematical Graph units (center is [0, 0], y goes UP).
 * 
 * @param {number} canvasX - Horizontal position in CSS pixels (0 to width)
 * @param {number} canvasY - Vertical position in CSS pixels (0 to height)
 * @param {number} width   - Current canvas width in CSS pixels
 * @param {number} height  - Current canvas height in CSS pixels
 * @returns {{x: number, y: number}} Point in graph coordinates
 */
function canvasToGraph(canvasX, canvasY, width, height) {
  const normX = canvasX / width;
  const normY = canvasY / height;

  const graphX = DOMAIN.min + normX * (DOMAIN.max - DOMAIN.min);
  const graphY = RANGE.max - normY * (RANGE.max - RANGE.min);

  return { x: graphX, y: graphY };
}

/**
 * Converts a point from Mathematical Graph units ([-10, 10])
 * to Canvas CSS pixels ([0, width], [0, height]).
 * 
 * @param {number} graphX - X coordinate in graph units
 * @param {number} graphY - Y coordinate in graph units
 * @param {number} width  - Current canvas width in CSS pixels
 * @param {number} height - Current canvas height in CSS pixels
 * @returns {{x: number, y: number}} Point in canvas CSS pixels
 */
function graphToCanvas(graphX, graphY, width, height) {
  const normX = (graphX - DOMAIN.min) / (DOMAIN.max - DOMAIN.min);
  const normY = (RANGE.max - graphY) / (RANGE.max - RANGE.min);

  const canvasX = normX * width;
  const canvasY = normY * height;

  return { x: canvasX, y: canvasY };
}

// ==========================================
// 5. CANVAS SIZING & HIGH-DPI (RETINA) SUPPORT
// ==========================================

/**
 * Resizes internal canvas pixel buffer to match devicePixelRatio,
 * ensuring crisp rendering on Retina screens, then re-renders the scene.
 */
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  // Cancel hold timer on resize
  cancelHoldTimer();

  const dpr = window.devicePixelRatio || 1;
  displayWidth = rect.width;
  displayHeight = rect.height;

  // Set buffer resolution scaled by DPR
  canvas.width = Math.round(displayWidth * dpr);
  canvas.height = Math.round(displayHeight * dpr);

  // Scale context so drawing commands use CSS pixel values
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  render();
}

// ==========================================
// 6. TOTAL LEAST SQUARES LINE RECOGNITION
// ==========================================

/**
 * Fits a 2D line using Total Least Squares (Orthogonal Distance Regression).
 * Symmetrically handles horizontal, vertical, and diagonal strokes.
 * 
 * @param {Array<{x: number, y: number}>} points - Points in CSS pixel space
 * @returns {{meanX: number, meanY: number, dirX: number, dirY: number, normX: number, normY: number}|null}
 */
function fitLineTLS(points) {
  const n = points.length;
  if (n < 2) return null;

  // 1. Calculate centroid (mean)
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += points[i].x;
    sumY += points[i].y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  // 2. Covariance matrix elements relative to centroid
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const u = points[i].x - meanX;
    const v = points[i].y - meanY;
    sxx += u * u;
    syy += v * v;
    sxy += u * v;
  }

  // 3. Principal angle theta
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);

  const dirX = Math.cos(theta);
  const dirY = Math.sin(theta);
  const normX = -Math.sin(theta);
  const normY = Math.cos(theta);

  return { meanX, meanY, dirX, dirY, normX, normY };
}

/**
 * Evaluates whether a stroke is roughly straight.
 * If valid, projects first and last points onto the fitted line and returns them in graph space.
 * 
 * @param {Array<{x: number, y: number}>} graphPoints - Stroke points in graph coordinates
 * @param {number} width  - Canvas display width
 * @param {number} height - Canvas display height
 * @returns {Array<{x: number, y: number}>|null} [fixedStartPoint, initialEndPoint] or null
 */
function recognizeStraightLine(graphPoints, width, height) {
  if (!graphPoints || graphPoints.length < 2) return null;

  const pixelPoints = graphPoints.map(pt => graphToCanvas(pt.x, pt.y, width, height));
  const firstPt = pixelPoints[0];
  const lastPt = pixelPoints[pixelPoints.length - 1];

  // 1. Minimum span distance check (rejects short clicks/taps < 30px)
  const spanDistance = Math.hypot(lastPt.x - firstPt.x, lastPt.y - firstPt.y);
  if (spanDistance < SNAP_CONFIG.minStrokeLengthPx) {
    return null;
  }

  // 2. Cumulative path length vs straight span check (rejects loops/curves)
  let totalPathLength = 0;
  for (let i = 1; i < pixelPoints.length; i++) {
    totalPathLength += Math.hypot(
      pixelPoints[i].x - pixelPoints[i - 1].x,
      pixelPoints[i].y - pixelPoints[i - 1].y
    );
  }
  if (totalPathLength / spanDistance > SNAP_CONFIG.maxPathToSpanRatio) {
    return null;
  }

  // 3. Fit line via Total Least Squares
  const fit = fitLineTLS(pixelPoints);
  if (!fit) return null;

  // 4. Calculate perpendicular deviations
  let sumSqDev = 0;
  let maxDev = 0;
  for (let i = 0; i < pixelPoints.length; i++) {
    const u = pixelPoints[i].x - fit.meanX;
    const v = pixelPoints[i].y - fit.meanY;
    const perpDist = Math.abs(u * fit.normX + v * fit.normY);
    sumSqDev += perpDist * perpDist;
    if (perpDist > maxDev) maxDev = perpDist;
  }

  const rmsDev = Math.sqrt(sumSqDev / pixelPoints.length);
  if (rmsDev > SNAP_CONFIG.maxRmsDeviationPx || maxDev > SNAP_CONFIG.maxPeakDeviationPx) {
    return null;
  }

  // 5. Project first and last points onto the fitted line
  const uStart = firstPt.x - fit.meanX;
  const vStart = firstPt.y - fit.meanY;
  const tStart = uStart * fit.dirX + vStart * fit.dirY;

  const uEnd = lastPt.x - fit.meanX;
  const vEnd = lastPt.y - fit.meanY;
  const tEnd = uEnd * fit.dirX + vEnd * fit.dirY;

  const startPixel = {
    x: fit.meanX + tStart * fit.dirX,
    y: fit.meanY + tStart * fit.dirY
  };
  const endPixel = {
    x: fit.meanX + tEnd * fit.dirX,
    y: fit.meanY + tEnd * fit.dirY
  };

  const startGraph = canvasToGraph(startPixel.x, startPixel.y, width, height);
  const endGraph = canvasToGraph(endPixel.x, endPixel.y, width, height);

  return [startGraph, endGraph];
}

// ==========================================
// 7. RENDERING FUNCTIONS
// ==========================================

/**
 * Draws the coordinate grid and labels.
 */
function drawGrid(ctx, width, height) {
  ctx.fillStyle = STYLES.gridBackground;
  ctx.fillRect(0, 0, width, height);

  // Vertical grid lines
  for (let x = DOMAIN.min; x <= DOMAIN.max; x++) {
    const { x: cx } = graphToCanvas(x, 0, width, height);
    if (x === 0) continue;

    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.strokeStyle = (x % 5 === 0) ? STYLES.gridLineBold : STYLES.gridLine;
    ctx.lineWidth = (x % 5 === 0) ? 1.5 : 1;
    ctx.stroke();
  }

  // Horizontal grid lines
  for (let y = RANGE.min; y <= RANGE.max; y++) {
    const { y: cy } = graphToCanvas(0, y, width, height);
    if (y === 0) continue;

    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.strokeStyle = (y % 5 === 0) ? STYLES.gridLineBold : STYLES.gridLine;
    ctx.lineWidth = (y % 5 === 0) ? 1.5 : 1;
    ctx.stroke();
  }

  // Prominent X and Y axes
  const origin = graphToCanvas(0, 0, width, height);
  ctx.strokeStyle = STYLES.axisLine;
  ctx.lineWidth = 2;

  // X Axis
  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(width, origin.y);
  ctx.stroke();

  // Y Axis
  ctx.beginPath();
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, height);
  ctx.stroke();

  // Ticks & Numerical Labels
  ctx.fillStyle = STYLES.axisText;
  ctx.font = `11px ${STYLES.fontFamily}`;

  // X Axis numbers
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let x = DOMAIN.min; x <= DOMAIN.max; x += 2) {
    if (x === 0) continue;
    const pos = graphToCanvas(x, 0, width, height);
    ctx.beginPath();
    ctx.moveTo(pos.x, origin.y - 3);
    ctx.lineTo(pos.x, origin.y + 3);
    ctx.stroke();
    ctx.fillText(x.toString(), pos.x, origin.y + 6);
  }

  // Y Axis numbers
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let y = RANGE.min; y <= RANGE.max; y += 2) {
    if (y === 0) continue;
    const pos = graphToCanvas(0, y, width, height);
    ctx.beginPath();
    ctx.moveTo(origin.x - 3, pos.y);
    ctx.lineTo(origin.x + 3, pos.y);
    ctx.stroke();
    ctx.fillText(y.toString(), origin.x - 6, pos.y);
  }

  // Axis labels ('x' and 'y')
  ctx.font = `bold 12px ${STYLES.fontFamily}`;
  ctx.fillStyle = STYLES.axisLine;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('x', width - 8, origin.y - 6);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('y', origin.x + 8, 8);
}

/**
 * Draws a single stroke or line segment.
 */
function drawSingleStroke(ctx, strokePoints, width, height, customColor = null) {
  if (!strokePoints || strokePoints.length === 0) return;

  const color = customColor || STYLES.strokeColor;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = STYLES.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (strokePoints.length === 1) {
    const pt = graphToCanvas(strokePoints[0].x, strokePoints[0].y, width, height);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, STYLES.strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  const startPt = graphToCanvas(strokePoints[0].x, strokePoints[0].y, width, height);
  ctx.moveTo(startPt.x, startPt.y);

  for (let i = 1; i < strokePoints.length; i++) {
    const pt = graphToCanvas(strokePoints[i].x, strokePoints[i].y, width, height);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
}

/**
 * Renders all committed strokes and the active preview or drawing stroke.
 */
function drawStrokes(ctx, allStrokes, activeFreehand, activeAdjusting, state, width, height) {
  // 1. Draw all committed strokes
  for (const stroke of allStrokes) {
    drawSingleStroke(ctx, stroke, width, height);
  }

  // 2. Draw active in-progress state
  if (state === 'adjustingLine' && activeAdjusting) {
    // Draw the straight line preview
    drawSingleStroke(ctx, activeAdjusting, width, height, STYLES.snapPreviewColor);

    // Draw endpoint handle dots for clear visual feedback
    const startPt = graphToCanvas(activeAdjusting[0].x, activeAdjusting[0].y, width, height);
    const endPt = graphToCanvas(activeAdjusting[1].x, activeAdjusting[1].y, width, height);

    ctx.fillStyle = STYLES.endpointDotColor;
    ctx.beginPath();
    ctx.arc(startPt.x, startPt.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(endPt.x, endPt.y, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (state === 'drawing' && activeFreehand) {
    drawSingleStroke(ctx, activeFreehand, width, height);
  }
}

/**
 * Master render function.
 */
function render() {
  if (displayWidth === 0 || displayHeight === 0) return;
  drawGrid(ctx, displayWidth, displayHeight);
  drawStrokes(ctx, strokes, currentStroke, snappedStroke, appState, displayWidth, displayHeight);
}

// ==========================================
// 8. HOLD DETECTION & SNAP CONTROLS
// ==========================================

function cancelHoldTimer() {
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function startHoldTimer() {
  cancelHoldTimer();
  holdTimer = setTimeout(triggerHoldSnap, SNAP_CONFIG.holdDurationMs);
}

/**
 * Fired when the user pauses and holds their pointer still for holdDurationMs.
 */
function triggerHoldSnap() {
  holdTimer = null;
  if (appState !== 'drawing' || !currentStroke || currentStroke.length < 2) return;

  const recognized = recognizeStraightLine(currentStroke, displayWidth, displayHeight);
  if (recognized) {
    // Preserve raw points separately and transition to 'adjustingLine'
    rawStrokeBackup = [...currentStroke];
    snappedStroke = recognized; // [fixedStartPoint, initialEndPoint]
    appState = 'adjustingLine';
    isAdjustingActively = false; // preserve fitted endpoint until motion > tolerance

    updateStatusUI();
    render();
  }
}

function updateStatusUI(customState = null) {
  if (!statusBanner || !statusText) return;

  statusBanner.classList.remove('is-snapped', 'is-adjusting');

  const effectiveState = customState || appState;

  switch (effectiveState) {
    case 'drawing':
      statusText.textContent = 'Hold pointer still at endpoint to straighten...';
      break;
    case 'adjustingLine':
      statusBanner.classList.add('is-adjusting');
      statusText.textContent = '✨ Line snapped! Drag to adjust length & angle; release to finish.';
      break;
    case 'committed-snap':
      statusBanner.classList.add('is-snapped');
      statusText.textContent = 'Straight segment saved.';
      break;
    case 'committed-freehand':
      statusText.textContent = 'Freehand stroke saved.';
      break;
    case 'cleared':
      statusText.textContent = 'Canvas cleared.';
      break;
    case 'idle':
    default:
      statusText.textContent = 'Draw a line and hold to straighten. Keep dragging to adjust its length and angle; release to finish.';
      break;
  }
}

// ==========================================
// 9. POINTER EVENT HANDLING
// ==========================================

function getCanvasPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    canvasX: event.clientX - rect.left,
    canvasY: event.clientY - rect.top
  };
}

/**
 * Handles pointerdown: starts freehand stroke and begins hold detection timer.
 */
function handlePointerDown(event) {
  // Reject secondary mouse buttons (only allow primary left click)
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  // Protect against simultaneous pointers
  if (activePointerId !== null) return;

  activePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);

  const { canvasX, canvasY } = getCanvasPointerPosition(event);
  const graphPoint = canvasToGraph(canvasX, canvasY, displayWidth, displayHeight);

  appState = 'drawing';
  currentStroke = [graphPoint];
  snappedStroke = null;
  rawStrokeBackup = null;
  isAdjustingActively = false;

  holdAnchor = { x: canvasX, y: canvasY };
  startHoldTimer();

  updateStatusUI();
  render();
}

/**
 * Handles pointermove: continues freehand drawing or dynamically updates line ending endpoint.
 */
function handlePointerMove(event) {
  if (activePointerId !== event.pointerId) return;

  const { canvasX, canvasY } = getCanvasPointerPosition(event);

  if (appState === 'drawing' && currentStroke) {
    const graphPoint = canvasToGraph(canvasX, canvasY, displayWidth, displayHeight);
    currentStroke.push(graphPoint);

    const moveDist = Math.hypot(canvasX - holdAnchor.x, canvasY - holdAnchor.y);
    if (moveDist > SNAP_CONFIG.holdTolerancePx) {
      holdAnchor = { x: canvasX, y: canvasY };
      startHoldTimer();
    }
    render();
  } else if (appState === 'adjustingLine' && snappedStroke) {
    // In adjustingLine state: keep starting endpoint fixed, update ending endpoint
    const moveDist = Math.hypot(canvasX - holdAnchor.x, canvasY - holdAnchor.y);
    if (moveDist > SNAP_CONFIG.holdTolerancePx) {
      isAdjustingActively = true;
    }

    if (isAdjustingActively) {
      const currentGraphPoint = canvasToGraph(canvasX, canvasY, displayWidth, displayHeight);
      // Update ending endpoint only (snappedStroke[0] remains locked)
      snappedStroke[1] = currentGraphPoint;
      render();
    }
  }
}

/**
 * Handles pointerup: commits adjusted straight line or raw freehand stroke.
 */
function handlePointerUp(event) {
  if (activePointerId !== event.pointerId) return;

  cancelHoldTimer();

  if (appState === 'adjustingLine' && snappedStroke) {
    // Commit the adjusted straight line segment
    strokes.push(snappedStroke);
    updateStatusUI('committed-snap');
  } else if (appState === 'drawing' && currentStroke && currentStroke.length > 0) {
    // Commit the freehand stroke
    strokes.push(currentStroke);
    updateStatusUI('committed-freehand');
  }

  // Reset to idle state
  appState = 'idle';
  currentStroke = null;
  snappedStroke = null;
  rawStrokeBackup = null;
  holdAnchor = null;
  isAdjustingActively = false;

  if (canvas.hasPointerCapture(event.pointerId)) {
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (_) {}
  }
  activePointerId = null;

  updateStrokeCountUI();
  render();
}

/**
 * Handles pointer cancelation or lost capture.
 */
function handlePointerCancel(event) {
  if (activePointerId !== null && event && event.pointerId !== undefined && activePointerId !== event.pointerId) {
    return;
  }

  cancelHoldTimer();
  appState = 'idle';
  currentStroke = null;
  snappedStroke = null;
  rawStrokeBackup = null;
  holdAnchor = null;
  isAdjustingActively = false;

  if (activePointerId !== null && canvas.hasPointerCapture(activePointerId)) {
    try {
      canvas.releasePointerCapture(activePointerId);
    } catch (_) {}
  }
  activePointerId = null;

  updateStatusUI('idle');
  render();
}

// ==========================================
// 10. UI ACTIONS & LISTENERS
// ==========================================

function updateStrokeCountUI() {
  if (strokeCountDisplay) {
    strokeCountDisplay.textContent = strokes.length.toString();
  }
}

function handleClear() {
  cancelHoldTimer();
  if (activePointerId !== null && canvas.hasPointerCapture(activePointerId)) {
    try {
      canvas.releasePointerCapture(activePointerId);
    } catch (_) {}
  }
  activePointerId = null;

  strokes = [];
  currentStroke = null;
  snappedStroke = null;
  rawStrokeBackup = null;
  appState = 'idle';
  holdAnchor = null;
  isAdjustingActively = false;

  updateStrokeCountUI();
  updateStatusUI('cleared');
  render();
}

// Pointer event listeners
canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointercancel', handlePointerCancel);
canvas.addEventListener('lostpointercapture', handlePointerCancel);

// Button listener
clearBtn.addEventListener('click', handleClear);

// Window and Container Resize Handling
window.addEventListener('resize', resizeCanvas);
const resizeObserver = new ResizeObserver(() => {
  resizeCanvas();
});
resizeObserver.observe(canvas.parentElement);

// Initial Canvas Setup
resizeCanvas();
updateStatusUI('idle');
