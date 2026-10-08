/**
 * Reverse Desmos - Milestone 1: Coordinate Grid & Freehand Drawing
 * 
 * This module manages:
 * 1. Fixed coordinate space: [-10, 10] along both X and Y axes.
 * 2. High-DPI (Retina) canvas setup and responsive resizing.
 * 3. Bidirectional coordinate conversion (Canvas CSS pixels <-> Mathematical Graph units).
 * 4. Multi-pointer drawing (mouse, stylus, touch) storing strokes in graph space.
 * 5. Clean separation between grid rendering and stroke rendering.
 */

// ==========================================
// 1. CONSTANTS & CONFIGURATION
// ==========================================
const DOMAIN = { min: -10, max: 10 };
const RANGE = { min: -10, max: 10 };

// Visual styling constants for grid and strokes
const STYLES = {
  gridBackground: '#ffffff',
  gridLine: '#e2e8f0',          // Subtle grey for 1-unit increments
  gridLineBold: '#cbd5e1',      // Medium grey for 5-unit increments
  axisLine: '#334155',          // Dark slate for major X & Y axes (x=0, y=0)
  axisText: '#64748b',          // Text color for numbers and labels
  strokeColor: '#2563eb',       // Vibrant royal blue for user drawings
  strokeWidth: 3,               // Line thickness in CSS pixels
  fontFamily: 'Inter, system-ui, sans-serif'
};

// ==========================================
// 2. STATE MANAGEMENT
// ==========================================
// List of all completed strokes. Each stroke is an array of {x, y} in graph coordinates.
let strokes = [];

// The stroke currently being drawn by the user
let currentStroke = null;

// Track active pointer to prevent multi-touch glitches
let activePointerId = null;

// Cache display dimensions (in CSS pixels)
let displayWidth = 0;
let displayHeight = 0;

// ==========================================
// 3. DOM ELEMENT REFERENCES
// ==========================================
const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clear-btn');
const strokeCountDisplay = document.getElementById('stroke-count');

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
  // Normalize pixel coordinates into 0.0 to 1.0 range
  const normX = canvasX / width;
  const normY = canvasY / height;

  // Map normalized values to the [min, max] domain/range
  const graphX = DOMAIN.min + normX * (DOMAIN.max - DOMAIN.min);
  // Invert Y because canvas Y increases downwards, but math Y increases upwards
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
  // Calculate relative position within domain/range (0.0 to 1.0)
  const normX = (graphX - DOMAIN.min) / (DOMAIN.max - DOMAIN.min);
  // Invert Y mapping for canvas display
  const normY = (RANGE.max - graphY) / (RANGE.max - RANGE.min);

  const canvasX = normX * width;
  const canvasY = normY * height;

  return { x: canvasX, y: canvasY };
}

// ==========================================
// 5. CANVAS SIZING & HIGH-DPI (RETINA) SUPPORT
// ==========================================

/**
 * Resizes the internal canvas pixel buffer to match the screen's device pixel ratio (DPR),
 * ensuring crisp rendering on Retina/HiDPI screens, then re-renders the scene.
 */
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const dpr = window.devicePixelRatio || 1;
  displayWidth = rect.width;
  displayHeight = rect.height;

  // Set internal buffer resolution scaled by DPR
  canvas.width = Math.round(displayWidth * dpr);
  canvas.height = Math.round(displayHeight * dpr);

  // Scale the 2D drawing context so all subsequent draw calls use CSS pixel values
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform before scaling
  ctx.scale(dpr, dpr);

  render();
}

// ==========================================
// 6. RENDERING FUNCTIONS
// ==========================================

/**
 * Draws the mathematical coordinate grid, including:
 * - Clean white background
 * - Minor grid lines (every 1 unit)
 * - Major grid lines (every 5 units)
 * - Main X and Y axes (x=0 and y=0)
 * - Tick marks, numeric values, and axis labels
 * 
 * @param {CanvasRenderingContext2D} ctx 
 * @param {number} width  - Canvas display width in CSS pixels
 * @param {number} height - Canvas display height in CSS pixels
 */
function drawGrid(ctx, width, height) {
  // 1. Clear & draw background
  ctx.fillStyle = STYLES.gridBackground;
  ctx.fillRect(0, 0, width, height);

  // 2. Draw vertical grid lines (constant X)
  for (let x = DOMAIN.min; x <= DOMAIN.max; x++) {
    const { x: cx } = graphToCanvas(x, 0, width, height);
    
    // Skip main Y axis here (we will draw it prominently later)
    if (x === 0) continue;

    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);

    // Major grid lines every 5 units, minor every 1 unit
    ctx.strokeStyle = (x % 5 === 0) ? STYLES.gridLineBold : STYLES.gridLine;
    ctx.lineWidth = (x % 5 === 0) ? 1.5 : 1;
    ctx.stroke();
  }

  // 3. Draw horizontal grid lines (constant Y)
  for (let y = RANGE.min; y <= RANGE.max; y++) {
    const { y: cy } = graphToCanvas(0, y, width, height);

    // Skip main X axis here
    if (y === 0) continue;

    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);

    ctx.strokeStyle = (y % 5 === 0) ? STYLES.gridLineBold : STYLES.gridLine;
    ctx.lineWidth = (y % 5 === 0) ? 1.5 : 1;
    ctx.stroke();
  }

  // 4. Draw prominent X and Y axes (x = 0 and y = 0)
  const origin = graphToCanvas(0, 0, width, height);

  ctx.strokeStyle = STYLES.axisLine;
  ctx.lineWidth = 2;

  // X Axis (horizontal line at y = 0)
  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(width, origin.y);
  ctx.stroke();

  // Y Axis (vertical line at x = 0)
  ctx.beginPath();
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, height);
  ctx.stroke();

  // 5. Draw ticks & numerical coordinate labels
  ctx.fillStyle = STYLES.axisText;
  ctx.font = `11px ${STYLES.fontFamily}`;

  // X Axis numbers (step by 2 for readability)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let x = DOMAIN.min; x <= DOMAIN.max; x += 2) {
    if (x === 0) continue; // Skip origin label to avoid crowding
    const pos = graphToCanvas(x, 0, width, height);
    // Draw tick mark
    ctx.beginPath();
    ctx.moveTo(pos.x, origin.y - 3);
    ctx.lineTo(pos.x, origin.y + 3);
    ctx.stroke();
    // Draw label
    ctx.fillText(x.toString(), pos.x, origin.y + 6);
  }

  // Y Axis numbers (step by 2 for readability)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let y = RANGE.min; y <= RANGE.max; y += 2) {
    if (y === 0) continue; // Skip origin
    const pos = graphToCanvas(0, y, width, height);
    // Draw tick mark
    ctx.beginPath();
    ctx.moveTo(origin.x - 3, pos.y);
    ctx.lineTo(origin.x + 3, pos.y);
    ctx.stroke();
    // Draw label
    ctx.fillText(y.toString(), origin.x - 6, pos.y);
  }

  // 6. Draw axis name labels ("x" and "y")
  ctx.font = `bold 12px ${STYLES.fontFamily}`;
  ctx.fillStyle = STYLES.axisLine;
  
  // 'x' label at the right end of the X axis
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('x', width - 8, origin.y - 6);

  // 'y' label at the top end of the Y axis
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('y', origin.x + 8, 8);
}

/**
 * Draws a single stroke on the canvas.
 * Handles both continuous lines and single-point clicks/dots.
 * 
 * @param {CanvasRenderingContext2D} ctx 
 * @param {Array<{x: number, y: number}>} strokePoints - Points in graph coordinates
 * @param {number} width  - Canvas display width in CSS pixels
 * @param {number} height - Canvas display height in CSS pixels
 */
function drawSingleStroke(ctx, strokePoints, width, height) {
  if (!strokePoints || strokePoints.length === 0) return;

  ctx.strokeStyle = STYLES.strokeColor;
  ctx.fillStyle = STYLES.strokeColor;
  ctx.lineWidth = STYLES.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (strokePoints.length === 1) {
    // Single tap/dot: draw a small circle
    const pt = graphToCanvas(strokePoints[0].x, strokePoints[0].y, width, height);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, STYLES.strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Multi-point stroke: draw connected lines
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
 * Renders all completed strokes as well as the active in-progress stroke.
 * 
 * @param {CanvasRenderingContext2D} ctx 
 * @param {Array<Array<{x: number, y: number}>>} allStrokes 
 * @param {Array<{x: number, y: number}>|null} activeStroke 
 * @param {number} width 
 * @param {number} height 
 */
function drawStrokes(ctx, allStrokes, activeStroke, width, height) {
  for (const stroke of allStrokes) {
    drawSingleStroke(ctx, stroke, width, height);
  }
  if (activeStroke) {
    drawSingleStroke(ctx, activeStroke, width, height);
  }
}

/**
 * Master render function.
 * Clears and redraws the grid, followed by user strokes.
 * (Future milestones will insert fitted curves between grid and strokes or as an overlay).
 */
function render() {
  if (displayWidth === 0 || displayHeight === 0) return;
  drawGrid(ctx, displayWidth, displayHeight);
  drawStrokes(ctx, strokes, currentStroke, displayWidth, displayHeight);
}

// ==========================================
// 7. POINTER EVENT HANDLING (DRAWING LOGIC)
// ==========================================

/**
 * Extracts the pointer's position in CSS canvas pixels from an event.
 * 
 * @param {PointerEvent} event 
 * @returns {{canvasX: number, canvasY: number}}
 */
function getCanvasPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    canvasX: event.clientX - rect.left,
    canvasY: event.clientY - rect.top
  };
}

/**
 * Starts a new stroke when the pointer touches down on the canvas.
 */
function handlePointerDown(event) {
  // Only handle the primary pointer (prevent multi-touch interference)
  if (activePointerId !== null) return;
  
  activePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);

  const { canvasX, canvasY } = getCanvasPointerPosition(event);
  const graphPoint = canvasToGraph(canvasX, canvasY, displayWidth, displayHeight);

  currentStroke = [graphPoint];
  render();
}

/**
 * Adds points to the current stroke as the pointer moves.
 */
function handlePointerMove(event) {
  if (activePointerId !== event.pointerId || !currentStroke) return;

  const { canvasX, canvasY } = getCanvasPointerPosition(event);
  const graphPoint = canvasToGraph(canvasX, canvasY, displayWidth, displayHeight);

  currentStroke.push(graphPoint);
  render();
}

/**
 * Finalizes the active stroke and adds it to the list of completed strokes.
 */
function handlePointerUp(event) {
  if (activePointerId !== event.pointerId) return;

  if (currentStroke && currentStroke.length > 0) {
    strokes.push(currentStroke);
    updateStrokeCountUI();
  }

  currentStroke = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  activePointerId = null;
  render();
}

/**
 * Handles pointer cancelation (e.g., notification popup, device gesture interrupt).
 */
function handlePointerCancel(event) {
  if (activePointerId !== event.pointerId) return;

  // Discard incomplete canceled stroke
  currentStroke = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  activePointerId = null;
  render();
}

// ==========================================
// 8. UI CONTROLS & EVENT LISTENERS
// ==========================================

function updateStrokeCountUI() {
  if (strokeCountDisplay) {
    strokeCountDisplay.textContent = strokes.length.toString();
  }
}

function handleClear() {
  strokes = [];
  currentStroke = null;
  updateStrokeCountUI();
  render();
}

// Attach Pointer Event Listeners
canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointercancel', handlePointerCancel);

// Attach Button Listeners
clearBtn.addEventListener('click', handleClear);

// Handle Window & Container Resize smoothly
window.addEventListener('resize', resizeCanvas);

// Use ResizeObserver for accurate container dimension tracking
const resizeObserver = new ResizeObserver(() => {
  resizeCanvas();
});
resizeObserver.observe(canvas.parentElement);

// Initial setup
resizeCanvas();
