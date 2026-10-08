/**
 * Reverse Desmos - Milestone 3: Mathematical Equations for Recognized Shapes
 * 
 * Manages:
 * 1. Tool Modes: 'draw' (freehand & draw-and-hold snapping) and 'edit' (select & transform).
 * 2. Shape Data Model: typed shapes (line, circle, ellipse, rectangle, square, triangle, polygon, star, freehand).
 * 3. Exact Mathematical Equations: Live derivation and KaTeX display of equations directly from graph geometry.
 * 4. Stable Shape Badges: Canvas badges matched to collapsible equation cards in the results panel.
 * 5. Non-destructive preview and live locked adjustment with real-time equation updating.
 * 6. Post-commit shape selection, manipulation handles, and Clear operations.
 * 7. Development-only Debug Diagnostics Telemetry overlay.
 */

// ==========================================
// 1. CONSTANTS & CONFIGURATION
// ==========================================
const DOMAIN = { min: -10, max: 10 };
const RANGE = { min: -10, max: 10 };

const SNAP_CONFIG = {
  holdDurationMs: 600,       // Duration pointer must pause to trigger recognition (ms)
  holdTolerancePx: 5         // Movement jitter radius allowed while holding still (CSS pixels)
};

const STYLES = {
  gridBackground: '#ffffff',
  gridLine: '#e2e8f0',          // Subtle grey for 1-unit increments
  gridLineBold: '#cbd5e1',      // Medium grey for 5-unit increments
  axisLine: '#334155',          // Dark slate for major X & Y axes (x=0, y=0)
  axisText: '#64748b',          // Coordinate labels
  strokeColor: '#2563eb',       // Royal blue for freehand strokes and shapes
  snapPreviewColor: '#0284c7',  // Vibrant cyan for live snapped shape preview
  selectedColor: '#7c3aed',     // Purple outline for selected shapes in Edit mode
  handleColor: '#0ea5e9',       // Cyan-blue for adjustment & transform handles
  centerDotColor: '#e11d48',    // Rose dot for center of closed shapes
  debugCornerColor: '#f59e0b',  // Amber dot for detected corners in debug mode
  strokeWidth: 3,               // Base stroke width in CSS pixels
  fontFamily: 'Inter, system-ui, sans-serif'
};

// ==========================================
// 2. STATE MANAGEMENT
// ==========================================
let toolMode = 'draw';          // 'draw' | 'edit'
let appState = 'idle';          // 'idle' | 'drawing' | 'adjustingShape' | 'transformingShape'
let isDebugVisible = false;     // Debug diagnostics panel visibility

let shapes = [];                // Committed shapes list in graph coordinates
let currentStroke = null;       // Freehand stroke points in graph coordinates
let rawStrokeBackup = null;

let snappedShape = null;        // Snapped preview shape in graph coordinates
let isAdjustingActively = false; // Prevents micro-tremors from shifting shape immediately upon snap
let snapAnchor = null;          // Canvas pixel anchor at moment of snap

let selectedShapeId = null;     // Selected shape in Edit mode
let activeHandle = null;
let handleDragStart = null;

let holdTimer = null;
let holdAnchor = null;
let activePointerId = null;

let displayWidth = 0;
let displayHeight = 0;
let shapeIdCounter = 1;

// ==========================================
// 3. DOM ELEMENT REFERENCES
// ==========================================
const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clear-btn');
const strokeCountDisplay = document.getElementById('stroke-count');
const statusBanner = document.getElementById('status-banner');
const statusText = document.getElementById('status-text');
const modeDrawBtn = document.getElementById('mode-draw-btn');
const modeEditBtn = document.getElementById('mode-edit-btn');
const debugToggleBtn = document.getElementById('debug-toggle-btn');
const debugPanel = document.getElementById('debug-panel');
const debugWinnerBadge = document.getElementById('debug-winner-badge');
const debugContent = document.getElementById('debug-content');
const debugCopyBtn = document.getElementById('debug-copy-btn');
const debugReplayToggleBtn = document.getElementById('debug-replay-toggle-btn');
const debugReplayBox = document.getElementById('debug-replay-box');
const debugReplayInput = document.getElementById('debug-replay-input');
const debugRunReplayBtn = document.getElementById('debug-run-replay-btn');

// Milestone 3: Equations DOM Elements
const equationsCard = document.getElementById('equations-card');
const equationsList = document.getElementById('equations-list');
const equationCountBadge = document.getElementById('equation-count-badge');

// ==========================================
// 4. COORDINATE CONVERSION FUNCTIONS
// ==========================================

function canvasToGraph(canvasX, canvasY, width, height) {
  const normX = canvasX / width;
  const normY = canvasY / height;
  const graphX = DOMAIN.min + normX * (DOMAIN.max - DOMAIN.min);
  const graphY = RANGE.max - normY * (RANGE.max - RANGE.min);
  return { x: graphX, y: graphY };
}

function graphToCanvas(graphX, graphY, width, height) {
  const normX = (graphX - DOMAIN.min) / (DOMAIN.max - DOMAIN.min);
  const normY = (RANGE.max - graphY) / (RANGE.max - RANGE.min);
  const canvasX = normX * width;
  const canvasY = normY * height;
  return { x: canvasX, y: canvasY };
}

// ==========================================
// 5. CANVAS SIZING & HIGH-DPI SUPPORT
// ==========================================

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  cancelHoldTimer();

  const dpr = window.devicePixelRatio || 1;
  displayWidth = rect.width;
  displayHeight = rect.height;

  canvas.width = Math.round(displayWidth * dpr);
  canvas.height = Math.round(displayHeight * dpr);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  render();
}

// ==========================================
// 6. SHAPE RENDERING & CANVAS LABELS
// ==========================================

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

  // Major Axes
  const origin = graphToCanvas(0, 0, width, height);
  ctx.strokeStyle = STYLES.axisLine;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(width, origin.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, height);
  ctx.stroke();

  // Ticks & Labels
  ctx.fillStyle = STYLES.axisText;
  ctx.font = `11px ${STYLES.fontFamily}`;

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

  ctx.font = `bold 12px ${STYLES.fontFamily}`;
  ctx.fillStyle = STYLES.axisLine;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('x', width - 8, origin.y - 6);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('y', origin.x + 8, 8);
}

function drawShape(ctx, shape, isSelected = false, customColor = null) {
  const { type, geometry } = shape;
  const color = isSelected ? STYLES.selectedColor : (customColor || STYLES.strokeColor);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = isSelected ? STYLES.strokeWidth + 1 : STYLES.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (type) {
    case 'freehand': {
      const pts = geometry.points;
      if (!pts || pts.length === 0) break;
      if (pts.length === 1) {
        const p = graphToCanvas(pts[0].x, pts[0].y, displayWidth, displayHeight);
        ctx.beginPath();
        ctx.arc(p.x, p.y, STYLES.strokeWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        const p0 = graphToCanvas(pts[0].x, pts[0].y, displayWidth, displayHeight);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
          const p = graphToCanvas(pts[i].x, pts[i].y, displayWidth, displayHeight);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      break;
    }

    case 'line': {
      const p1 = graphToCanvas(geometry.p1.x, geometry.p1.y, displayWidth, displayHeight);
      const p2 = graphToCanvas(geometry.p2.x, geometry.p2.y, displayWidth, displayHeight);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      break;
    }

    case 'circle': {
      const c = graphToCanvas(geometry.center.x, geometry.center.y, displayWidth, displayHeight);
      const r = (geometry.radius / 20) * displayWidth;
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(0.5, r), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'ellipse': {
      const c = graphToCanvas(geometry.center.x, geometry.center.y, displayWidth, displayHeight);
      const rx = (geometry.radiusX / 20) * displayWidth;
      const ry = (geometry.radiusY / 20) * displayHeight;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, Math.max(0.5, rx), Math.max(0.5, ry), geometry.rotation || 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'rectangle':
    case 'square': {
      const c = graphToCanvas(geometry.center.x, geometry.center.y, displayWidth, displayHeight);
      const w = (geometry.width / 20) * displayWidth;
      const h = (geometry.height / 20) * displayHeight;
      ctx.translate(c.x, c.y);
      ctx.rotate(geometry.rotation || 0);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      break;
    }

    case 'triangle': {
      const v = geometry.vertices.map(pt => graphToCanvas(pt.x, pt.y, displayWidth, displayHeight));
      if (v.length === 3) {
        ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y);
        ctx.lineTo(v[1].x, v[1].y);
        ctx.lineTo(v[2].x, v[2].y);
        ctx.closePath();
        ctx.stroke();
      }
      break;
    }

    case 'polygon': {
      const c = graphToCanvas(geometry.center.x, geometry.center.y, displayWidth, displayHeight);
      const r = (geometry.radius / 20) * displayWidth;
      const sides = geometry.sides || 5;
      const rot = geometry.rotation || 0;

      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = rot + (i % sides) * (Math.PI * 2 / sides);
        const px = c.x + r * Math.cos(a);
        const py = c.y + r * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 'star': {
      const c = graphToCanvas(geometry.center.x, geometry.center.y, displayWidth, displayHeight);
      const r1 = (geometry.outerRadius / 20) * displayWidth;
      const r2 = (geometry.innerRadius / 20) * displayWidth;
      const rot = geometry.rotation || 0;

      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = rot + (i % 10) * (Math.PI / 5);
        const r = (i % 2 === 0) ? r1 : r2;
        const px = c.x + r * Math.cos(a);
        const py = c.y + r * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

function drawShapeHandles(ctx, shape) {
  const { type, geometry } = shape;
  ctx.save();

  if (type === 'line') {
    const p1 = graphToCanvas(geometry.p1.x, geometry.p1.y, displayWidth, displayHeight);
    const p2 = graphToCanvas(geometry.p2.x, geometry.p2.y, displayWidth, displayHeight);

    ctx.fillStyle = STYLES.centerDotColor;
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = STYLES.handleColor;
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (type === 'triangle' && geometry.center && geometry.vertices) {
    const c = graphToCanvas(geometry.center.x, geometry.center.y, displayWidth, displayHeight);

    // Center handle
    ctx.fillStyle = STYLES.centerDotColor;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Resize/rotate handle at vertex 0
    if (geometry.vertices.length > 0) {
      const v0 = graphToCanvas(geometry.vertices[0].x, geometry.vertices[0].y, displayWidth, displayHeight);
      ctx.fillStyle = STYLES.handleColor;
      ctx.beginPath();
      ctx.arc(v0.x, v0.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  } else if (geometry.center) {
    const c = graphToCanvas(geometry.center.x, geometry.center.y, displayWidth, displayHeight);

    ctx.fillStyle = STYLES.centerDotColor;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
    ctx.fill();

    let handlePos = null;
    if (type === 'circle') {
      const r = (geometry.radius / 20) * displayWidth;
      handlePos = { x: c.x + r, y: c.y };
    } else if (type === 'ellipse') {
      const rx = (geometry.radiusX / 20) * displayWidth;
      const rot = geometry.rotation || 0;
      handlePos = { x: c.x + rx * Math.cos(rot), y: c.y + rx * Math.sin(rot) };
    } else if (type === 'rectangle' || type === 'square') {
      const w = (geometry.width / 20) * displayWidth;
      const h = (geometry.height / 20) * displayHeight;
      const rot = geometry.rotation || 0;
      const cornerX = w / 2, cornerY = h / 2;
      handlePos = {
        x: c.x + (cornerX * Math.cos(rot) - cornerY * Math.sin(rot)),
        y: c.y + (cornerX * Math.sin(rot) + cornerY * Math.cos(rot))
      };
    } else if (type === 'polygon' || type === 'star') {
      const r = ((geometry.radius || geometry.outerRadius) / 20) * displayWidth;
      const rot = geometry.rotation || 0;
      handlePos = { x: c.x + r * Math.cos(rot), y: c.y + r * Math.sin(rot) };
    }

    if (handlePos) {
      ctx.fillStyle = STYLES.handleColor;
      ctx.beginPath();
      ctx.arc(handlePos.x, handlePos.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Calculates optimal label anchor position on canvas for any shape.
 */
function getShapeLabelPosition(shape) {
  const { type, geometry } = shape;
  if (!geometry) return { x: 30, y: 30 };

  let anchorCanvas = { x: 30, y: 30 };

  switch (type) {
    case 'line': {
      const p1 = graphToCanvas(geometry.p1.x, geometry.p1.y, displayWidth, displayHeight);
      const p2 = graphToCanvas(geometry.p2.x, geometry.p2.y, displayWidth, displayHeight);
      anchorCanvas = {
        x: (p1.x + p2.x) / 2,
        y: Math.min(p1.y, p2.y) - 14
      };
      break;
    }
    case 'circle': {
      const c = graphToCanvas(geometry.center.x, geometry.center.y, displayWidth, displayHeight);
      const r = (geometry.radius / 20) * displayWidth;
      anchorCanvas = {
        x: c.x,
        y: c.y - r - 12
      };
      break;
    }
    case 'ellipse': {
      const c = graphToCanvas(geometry.center.x, geometry.center.y, displayWidth, displayHeight);
      const maxR = (Math.max(geometry.radiusX || 1, geometry.radiusY || 1) / 20) * Math.max(displayWidth, displayHeight);
      anchorCanvas = {
        x: c.x,
        y: c.y - maxR - 12
      };
      break;
    }
    case 'rectangle':
    case 'square': {
      const c = graphToCanvas(geometry.center.x, geometry.center.y, displayWidth, displayHeight);
      const diag = (Math.hypot(geometry.width || 1, geometry.height || 1) / 2 / 20) * displayWidth;
      anchorCanvas = {
        x: c.x,
        y: c.y - diag - 12
      };
      break;
    }
    case 'triangle': {
      if (geometry.vertices && geometry.vertices.length >= 3) {
        const pts = geometry.vertices.map(v => graphToCanvas(v.x, v.y, displayWidth, displayHeight));
        const minX = Math.min(...pts.map(p => p.x));
        const maxX = Math.max(...pts.map(p => p.x));
        const minY = Math.min(...pts.map(p => p.y));
        anchorCanvas = {
          x: (minX + maxX) / 2,
          y: minY - 12
        };
      }
      break;
    }
    case 'polygon':
    case 'star': {
      const c = graphToCanvas(geometry.center.x, geometry.center.y, displayWidth, displayHeight);
      const r = ((geometry.radius || geometry.outerRadius || 2) / 20) * displayWidth;
      anchorCanvas = {
        x: c.x,
        y: c.y - r - 12
      };
      break;
    }
    case 'freehand': {
      if (geometry.points && geometry.points.length > 0) {
        const pts = geometry.points.map(p => graphToCanvas(p.x, p.y, displayWidth, displayHeight));
        const minX = Math.min(...pts.map(p => p.x));
        const maxX = Math.max(...pts.map(p => p.x));
        const minY = Math.min(...pts.map(p => p.y));
        anchorCanvas = {
          x: (minX + maxX) / 2,
          y: minY - 12
        };
      }
      break;
    }
  }

  // Keep labels comfortably within canvas bounds
  const padX = 40;
  const padY = 16;
  return {
    x: Math.max(padX, Math.min(displayWidth - padX, anchorCanvas.x)),
    y: Math.max(padY, Math.min(displayHeight - padY, anchorCanvas.y))
  };
}

/**
 * Draws crisp matching shape labels directly on the canvas near each shape.
 */
function drawShapeCanvasLabels(ctx) {
  const shapesToLabel = [...shapes];
  if (appState === 'adjustingShape' && snappedShape) {
    shapesToLabel.push(snappedShape);
  }

  if (shapesToLabel.length === 0) return;

  ctx.save();
  ctx.font = `600 11px ${STYLES.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const shape of shapesToLabel) {
    const isSelected = (toolMode === 'edit' && shape.id === selectedShapeId);
    const isPreview = (shape === snappedShape);
    const labelText = shape.label || `${capitalize(shape.type)} ${shape.id}`;
    const pos = getShapeLabelPosition(shape);

    const textWidth = ctx.measureText(labelText).width;
    const badgeW = textWidth + 14;
    const badgeH = 20;
    const radius = 5;

    // Badge Background
    ctx.beginPath();
    ctx.roundRect(pos.x - badgeW / 2, pos.y - badgeH / 2, badgeW, badgeH, radius);
    if (isSelected) {
      ctx.fillStyle = '#7c3aed';
      ctx.strokeStyle = '#c4b5fd';
    } else if (isPreview) {
      ctx.fillStyle = '#0284c7';
      ctx.strokeStyle = '#7dd3fc';
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#475569';
    }
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    // Badge Text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, pos.x, pos.y + 0.5);
  }

  ctx.restore();
}

/**
 * Draws debug corner markers if debug mode is active.
 */
function drawDebugCorners(ctx) {
  if (!isDebugVisible || !lastRecognitionDebug.cleanedCorners) return;

  ctx.save();
  ctx.fillStyle = STYLES.debugCornerColor;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;

  for (const c of lastRecognitionDebug.cleanedCorners) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function render() {
  if (displayWidth === 0 || displayHeight === 0) return;

  drawGrid(ctx, displayWidth, displayHeight);

  for (const shape of shapes) {
    const isSelected = (toolMode === 'edit' && shape.id === selectedShapeId);
    drawShape(ctx, shape, isSelected);

    if (isSelected) {
      drawShapeHandles(ctx, shape);
    }
  }

  if (appState === 'adjustingShape' && snappedShape) {
    drawShape(ctx, snappedShape, false, STYLES.snapPreviewColor);
    drawShapeHandles(ctx, snappedShape);
  } else if (appState === 'drawing' && currentStroke) {
    drawShape(ctx, { type: 'freehand', geometry: { points: currentStroke } });
  }

  drawShapeCanvasLabels(ctx);
  drawDebugCorners(ctx);
}

// ==========================================
// 7. MATHEMATICAL EQUATIONS UI & FORMATTING
// ==========================================

function getShapeIcon(type) {
  switch (type) {
    case 'line': return '📏';
    case 'circle': return '⭕';
    case 'ellipse': return '⬭';
    case 'rectangle': return '▭';
    case 'square': return '◻️';
    case 'triangle': return '📐';
    case 'polygon': return '⬡';
    case 'star': return '⭐';
    case 'freehand': return '✏️';
    default: return '📐';
  }
}

/**
 * Generates stable, readable labels such as "Circle 1" or "Triangle 2".
 */
function generateShapeLabel(type, sides = null) {
  let prefix = 'Shape';
  switch (type) {
    case 'line': prefix = 'Line'; break;
    case 'circle': prefix = 'Circle'; break;
    case 'ellipse': prefix = 'Ellipse'; break;
    case 'rectangle': prefix = 'Rectangle'; break;
    case 'square': prefix = 'Square'; break;
    case 'triangle': prefix = 'Triangle'; break;
    case 'polygon': prefix = `${sides || 5}-gon`; break;
    case 'star': prefix = 'Star'; break;
    case 'freehand': prefix = 'Freehand'; break;
  }
  const count = shapes.filter(s => s.type === type).length + 1;
  return `${prefix} ${count}`;
}

function renderLatexToElement(latex, container, isDisplay = true) {
  if (window.katex) {
    try {
      window.katex.render(latex, container, {
        throwOnError: false,
        displayMode: isDisplay
      });
      return;
    } catch (e) {
      console.warn('KaTeX render error:', e);
    }
  }
  container.textContent = latex;
}

function copyTextToClipboard(text, btnElement) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btnElement.textContent;
    btnElement.textContent = '✅ Copied!';
    btnElement.style.color = '#38bdf8';
    setTimeout(() => {
      btnElement.textContent = orig;
      btnElement.style.color = '';
    }, 1500);
  }).catch(() => {
    prompt('Copy equation below:', text);
  });
}

/**
 * Constructs an interactive, accessible card for a shape's mathematical equations.
 */
function createEquationCard(shape, eqData, isSelected, isPreview) {
  const card = document.createElement('div');
  card.className = `equation-item ${isSelected ? 'is-selected' : ''}`;
  card.dataset.shapeId = shape.id;

  // Header
  const header = document.createElement('div');
  header.className = 'equation-item-header';

  const titleTag = document.createElement('div');
  titleTag.className = 'equation-shape-tag';
  titleTag.innerHTML = `<span class="equation-shape-icon">${getShapeIcon(shape.type)}</span><span>${eqData.title}</span>`;

  if (isPreview) {
    const previewBadge = document.createElement('span');
    previewBadge.className = 'badge';
    previewBadge.style.fontSize = '0.65rem';
    previewBadge.style.backgroundColor = 'rgba(2, 132, 199, 0.2)';
    previewBadge.style.color = '#38bdf8';
    previewBadge.style.marginLeft = '0.4rem';
    previewBadge.textContent = 'Previewing...';
    titleTag.appendChild(previewBadge);
  }
  header.appendChild(titleTag);

  // Copy Actions
  if (!eqData.isFreehand) {
    const actions = document.createElement('div');
    actions.className = 'equation-actions';

    const copyLatexBtn = document.createElement('button');
    copyLatexBtn.type = 'button';
    copyLatexBtn.className = 'btn-copy-eq';
    copyLatexBtn.title = 'Copy LaTeX equation to clipboard';
    copyLatexBtn.textContent = 'Copy LaTeX';
    copyLatexBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      let latexToCopy = eqData.primaryEquation || '';
      if (eqData.isMultiEdge && eqData.edges) {
        latexToCopy = eqData.edges.map(ed => `\\text{Edge } ${ed.edgeIndex}: ${ed.latex}`).join('\n');
      }
      copyTextToClipboard(latexToCopy, copyLatexBtn);
    });

    const copyTextBtn = document.createElement('button');
    copyTextBtn.type = 'button';
    copyTextBtn.className = 'btn-copy-eq';
    copyTextBtn.title = 'Copy Plain Text equation to clipboard';
    copyTextBtn.textContent = 'Copy Text';
    copyTextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      let textToCopy = eqData.primaryText || '';
      if (eqData.isMultiEdge && eqData.edges) {
        textToCopy = eqData.edges.map(ed => `Edge ${ed.edgeIndex}: ${ed.text}`).join('\n');
      }
      copyTextToClipboard(textToCopy, copyTextBtn);
    });

    actions.appendChild(copyLatexBtn);
    actions.appendChild(copyTextBtn);
    header.appendChild(actions);
  }

  card.appendChild(header);

  // Content Box
  if (eqData.isFreehand) {
    const freehandBox = document.createElement('div');
    freehandBox.className = 'equation-math-box';
    freehandBox.style.fontSize = '0.825rem';
    freehandBox.style.color = '#94a3b8';
    freehandBox.textContent = eqData.note || 'Freehand stroke (Mathematical curve fitting coming in a future milestone).';
    card.appendChild(freehandBox);
  } else if (eqData.isMultiEdge) {
    // Polygon / Closed multi-edge shape
    const summaryBox = document.createElement('div');
    summaryBox.className = 'equation-math-box';

    const summaryText = document.createElement('div');
    summaryText.style.fontSize = '0.85rem';
    summaryText.style.fontWeight = '500';
    summaryText.style.color = '#f8fafc';
    summaryText.textContent = `Piecewise Boundary (${eqData.edgeCount} Edges)`;
    summaryBox.appendChild(summaryText);

    const details = document.createElement('details');
    details.className = 'equation-edges-details';
    details.open = true;

    const summary = document.createElement('summary');
    summary.textContent = `Boundary Edge Equations (${eqData.edgeCount})`;
    details.appendChild(summary);

    const table = document.createElement('table');
    table.className = 'edges-table';
    const tbody = document.createElement('tbody');

    eqData.edges.forEach(edge => {
      const tr = document.createElement('tr');
      const tdNum = document.createElement('td');
      tdNum.className = 'edge-num';
      tdNum.textContent = `Edge ${edge.edgeIndex}`;

      const tdEq = document.createElement('td');
      tdEq.className = 'edge-eq';
      renderLatexToElement(edge.latex, tdEq, false);

      tr.appendChild(tdNum);
      tr.appendChild(tdEq);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    details.appendChild(table);
    summaryBox.appendChild(details);
    card.appendChild(summaryBox);
  } else {
    // Single equation shape (Line, Circle, Ellipse)
    const mathBox = document.createElement('div');
    mathBox.className = 'equation-math-box';

    const formulaDiv = document.createElement('div');
    formulaDiv.className = 'equation-formula';
    renderLatexToElement(eqData.primaryEquation, formulaDiv, true);
    mathBox.appendChild(formulaDiv);

    if (eqData.transformDefinitions) {
      const transBox = document.createElement('div');
      transBox.className = 'equation-transforms-box';

      const uDiv = document.createElement('div');
      renderLatexToElement(eqData.transformDefinitions.uLatex, uDiv, false);
      const vDiv = document.createElement('div');
      renderLatexToElement(eqData.transformDefinitions.vLatex, vDiv, false);

      transBox.appendChild(uDiv);
      transBox.appendChild(vDiv);
      mathBox.appendChild(transBox);
    }

    if (eqData.detailsLatex) {
      const detailsDiv = document.createElement('div');
      detailsDiv.className = 'equation-details-sub';
      renderLatexToElement(eqData.detailsLatex, detailsDiv, false);
      mathBox.appendChild(detailsDiv);
    }

    card.appendChild(mathBox);
  }

  // Click card to select shape in Edit mode
  card.addEventListener('click', () => {
    if (toolMode === 'edit' && shape.id) {
      selectedShapeId = (selectedShapeId === shape.id) ? null : shape.id;
      updateStatusUI(selectedShapeId ? 'edit-selected' : 'idle');
      updateEquationsUI();
      render();
    }
  });

  return card;
}

/**
 * Updates the Mathematical Equations panel with all committed & live-adjusting shapes.
 */
function updateEquationsUI() {
  if (!equationsList || !equationCountBadge) return;

  const activeItems = [...shapes];
  let previewItem = null;
  if (appState === 'adjustingShape' && snappedShape) {
    activeItems.push(snappedShape);
    previewItem = snappedShape;
  }

  const mathShapeCount = activeItems.filter(s => s.type !== 'freehand').length;
  equationCountBadge.textContent = `${mathShapeCount} ${mathShapeCount === 1 ? 'Shape' : 'Shapes'}`;

  if (activeItems.length === 0) {
    equationsList.innerHTML = `
      <div class="equations-empty-state">
        <span class="empty-icon">📐</span>
        <p>No recognized shapes yet.</p>
        <span class="empty-subtext">Draw and hold a line, circle, ellipse, rectangle, triangle, polygon, or star to see its exact mathematical equations.</span>
      </div>
    `;
    return;
  }

  equationsList.innerHTML = '';

  for (const shape of activeItems) {
    const isPreview = (shape === previewItem);
    const isSelected = (toolMode === 'edit' && shape.id === selectedShapeId);
    const eqData = deriveShapeEquations(shape);
    if (!eqData) continue;

    const card = createEquationCard(shape, eqData, isSelected, isPreview);
    equationsList.appendChild(card);
  }
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

function triggerHoldSnap() {
  holdTimer = null;
  if (appState !== 'drawing' || !currentStroke || currentStroke.length < 3) return;

  const recognized = recognizeGeometricShape(
    currentStroke,
    displayWidth,
    displayHeight,
    graphToCanvas,
    canvasToGraph
  );

  updateDebugUI();

  if (recognized) {
    rawStrokeBackup = [...currentStroke];
    const initialDragGraph = canvasToGraph(holdAnchor.x, holdAnchor.y, displayWidth, displayHeight);
    const shapeLabel = generateShapeLabel(recognized.type, recognized.geometry?.sides);
    snappedShape = {
      id: shapeIdCounter++,
      label: shapeLabel,
      type: recognized.type,
      geometry: recognized.geometry,
      baseGeometry: JSON.parse(JSON.stringify(recognized.geometry)),
      initialDragGraph,
      initialDragCanvas: { x: holdAnchor.x, y: holdAnchor.y },
      rawPoints: rawStrokeBackup
    };

    appState = 'adjustingShape';
    isAdjustingActively = false;
    snapAnchor = holdAnchor;

    updateStatusUI();
    updateEquationsUI();
    render();
  }
}

function updateStatusUI(customState = null) {
  if (!statusBanner || !statusText) return;

  statusBanner.classList.remove('is-snapped', 'is-adjusting');

  const effectiveState = customState || appState;

  switch (effectiveState) {
    case 'drawing':
      statusText.textContent = 'Hold pointer still at the end to snap shape...';
      break;
    case 'adjustingShape':
      statusBanner.classList.add('is-adjusting');
      statusText.textContent = `✨ ${capitalize(snappedShape?.type || 'Shape')} snapped! Drag to adjust size & angle; release to save.`;
      break;
    case 'committed-shape':
      statusBanner.classList.add('is-snapped');
      statusText.textContent = 'Shape saved to grid with mathematical equations.';
      break;
    case 'committed-freehand':
      statusText.textContent = 'Freehand stroke saved.';
      break;
    case 'cleared':
      statusText.textContent = 'Canvas cleared.';
      break;
    case 'edit-selected':
      statusBanner.classList.add('is-adjusting');
      statusText.textContent = 'Shape selected. Drag handles to transform, or click empty space to deselect.';
      break;
    case 'idle':
    default:
      if (toolMode === 'edit') {
        statusText.textContent = 'Edit Mode: Click any shape to select and transform it.';
      } else {
        statusText.textContent = 'Draw a line, circle, ellipse, rectangle, triangle, polygon, or star and hold to snap.';
      }
      break;
  }
}

function updateDebugUI() {
  if (!debugContent || !debugWinnerBadge) return;

  const d = lastRecognitionDebug;
  if (!d || !d.strokeMetrics) {
    debugWinnerBadge.textContent = 'No Attempts';
    debugContent.innerHTML = '<p class="debug-placeholder">Draw and hold a stroke on the canvas to inspect diagnostics.</p>';
    return;
  }

  debugWinnerBadge.textContent = d.winner ? capitalize(d.winner) : 'Freehand';
  debugWinnerBadge.style.backgroundColor = d.winner ? 'rgba(56, 189, 248, 0.2)' : 'rgba(148, 163, 184, 0.2)';
  debugWinnerBadge.style.color = d.winner ? '#38bdf8' : '#94a3b8';

  let candidatesHtml = '';
  if (d.candidates && d.candidates.length > 0) {
    candidatesHtml = `
      <table class="debug-table">
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Raw Err</th>
            <th>Penalty</th>
            <th>Total Score</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${d.candidates.map(c => `
            <tr class="${c.type === d.winner ? 'winner-row' : ''}">
              <td>${c.type === d.winner ? '⭐ ' : ''}${capitalize(c.type)}</td>
              <td>${c.rawError.toFixed(3)}</td>
              <td>+${c.complexityPenalty.toFixed(3)}</td>
              <td><strong>${c.normalizedError.toFixed(3)}</strong></td>
              <td>${c.details || 'OK'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    candidatesHtml = '<p style="color: #94a3b8; font-size: 0.75rem; margin: 0.25rem 0;">No candidate shapes passed initial structural gates.</p>';
  }

  debugContent.innerHTML = `
    <div class="debug-reason">
      <strong>Decision:</strong> ${d.selectionReason}
    </div>
    <div style="font-size: 0.75rem; color: #94a3b8;">
      <strong>Stroke:</strong> ${d.strokeMetrics.pointsCount} points, Length: ${d.strokeMetrics.pathLength}px, Span: ${d.strokeMetrics.diagonal}px | 
      <strong>Corners:</strong> ${d.rawCorners.length} raw -> ${d.cleanedCorners.length} cleaned
    </div>
    ${candidatesHtml}
  `;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
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

function handlePointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (activePointerId !== null) return;

  activePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);

  const { canvasX, canvasY } = getCanvasPointerPosition(event);
  const graphPoint = canvasToGraph(canvasX, canvasY, displayWidth, displayHeight);

  if (toolMode === 'edit') {
    handleEditPointerDown(canvasX, canvasY, graphPoint);
    return;
  }

  appState = 'drawing';
  currentStroke = [graphPoint];
  snappedShape = null;
  rawStrokeBackup = null;
  isAdjustingActively = false;

  holdAnchor = { x: canvasX, y: canvasY };
  startHoldTimer();

  updateStatusUI();
  render();
}

function handlePointerMove(event) {
  if (activePointerId !== event.pointerId) return;

  const { canvasX, canvasY } = getCanvasPointerPosition(event);

  if (toolMode === 'edit' && appState === 'transformingShape') {
    handleEditPointerMove(canvasX, canvasY);
    return;
  }

  if (appState === 'drawing' && currentStroke) {
    const graphPoint = canvasToGraph(canvasX, canvasY, displayWidth, displayHeight);
    currentStroke.push(graphPoint);

    const moveDist = Math.hypot(canvasX - holdAnchor.x, canvasY - holdAnchor.y);
    if (moveDist > SNAP_CONFIG.holdTolerancePx) {
      holdAnchor = { x: canvasX, y: canvasY };
      startHoldTimer();
    }
    render();
  } else if (appState === 'adjustingShape' && snappedShape) {
    // Jitter protection: do not displace fitted geometry until movement exceeds tolerance
    if (!isAdjustingActively && snapAnchor) {
      const distFromSnap = Math.hypot(canvasX - snapAnchor.x, canvasY - snapAnchor.y);
      if (distFromSnap > SNAP_CONFIG.holdTolerancePx) {
        isAdjustingActively = true;
      }
    }

    if (isAdjustingActively) {
      adjustLiveShapeGeometry(snappedShape, canvasX, canvasY);
      updateEquationsUI();
      render();
    }
  }
}

function adjustLiveShapeGeometry(shape, canvasX, canvasY) {
  const { type } = shape;
  const currentGraph = canvasToGraph(canvasX, canvasY, displayWidth, displayHeight);
  const baseGeom = shape.baseGeometry || shape.geometry;

  if (type === 'line') {
    shape.geometry.p2 = currentGraph;
  } else if (type === 'triangle' && baseGeom.center && baseGeom.vertices) {
    const baseCenter = baseGeom.center;
    const baseVertices = baseGeom.vertices;
    const anchorGraph = shape.initialDragGraph || baseVertices[0];

    let d0x = anchorGraph.x - baseCenter.x;
    let d0y = anchorGraph.y - baseCenter.y;
    let r0 = Math.hypot(d0x, d0y);
    let a0 = Math.atan2(d0y, d0x);

    if (r0 < 0.2 && baseVertices.length > 0) {
      d0x = baseVertices[0].x - baseCenter.x;
      d0y = baseVertices[0].y - baseCenter.y;
      r0 = Math.hypot(d0x, d0y);
      a0 = Math.atan2(d0y, d0x);
    }

    const dtx = currentGraph.x - baseCenter.x;
    const dty = currentGraph.y - baseCenter.y;
    const rt = Math.hypot(dtx, dty);
    const at = Math.atan2(dty, dtx);

    const scale = Math.max(0.1, rt / (r0 || 1));
    const deltaTheta = at - a0;
    const cosD = Math.cos(deltaTheta);
    const sinD = Math.sin(deltaTheta);

    shape.geometry.vertices = baseVertices.map(v => {
      const ux = v.x - baseCenter.x;
      const uy = v.y - baseCenter.y;
      const rx = scale * (ux * cosD - uy * sinD);
      const ry = scale * (ux * sinD + uy * cosD);
      return { x: baseCenter.x + rx, y: baseCenter.y + ry };
    });
    shape.geometry.center = { x: baseCenter.x, y: baseCenter.y };
  } else if (baseGeom.center) {
    const centerCanvas = graphToCanvas(baseGeom.center.x, baseGeom.center.y, displayWidth, displayHeight);
    const dx = canvasX - centerCanvas.x;
    const dy = canvasY - centerCanvas.y;
    const distPx = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    if (type === 'circle') {
      shape.geometry.radius = Math.max(0.5, (distPx / displayWidth) * 20);
      shape.geometry.center = { ...baseGeom.center };
    } else if (type === 'ellipse') {
      const baseRatio = (baseGeom.radiusY || 1) / (baseGeom.radiusX || 1);
      const newRx = Math.max(0.5, (distPx / displayWidth) * 20);
      shape.geometry.radiusX = newRx;
      shape.geometry.radiusY = Math.max(0.5, newRx * baseRatio);
      shape.geometry.rotation = angle;
      shape.geometry.center = { ...baseGeom.center };
    } else if (type === 'rectangle' || type === 'square') {
      if (type === 'square') {
        const side = Math.max(0.5, (distPx / displayWidth) * 20 * Math.SQRT2);
        shape.geometry.width = side;
        shape.geometry.height = side;
        shape.geometry.rotation = baseGeom.rotation || 0;
      } else {
        if (baseGeom.rotation === 0) {
          shape.geometry.width = Math.max(0.5, (Math.abs(dx) * 2 / displayWidth) * 20);
          shape.geometry.height = Math.max(0.5, (Math.abs(dy) * 2 / displayHeight) * 20);
          shape.geometry.rotation = 0;
        } else {
          const baseRatio = (baseGeom.height || 1) / (baseGeom.width || 1);
          const newW = Math.max(0.5, (distPx / displayWidth) * 20 * Math.SQRT2);
          shape.geometry.width = newW;
          shape.geometry.height = Math.max(0.5, newW * baseRatio);
          shape.geometry.rotation = angle;
        }
      }
      shape.geometry.center = { ...baseGeom.center };
    } else if (type === 'polygon' || type === 'star') {
      const newRadius = Math.max(0.5, (distPx / displayWidth) * 20);
      if (type === 'polygon') {
        shape.geometry.radius = newRadius;
      } else {
        const ratio = (baseGeom.innerRadius || 1) / (baseGeom.outerRadius || 1);
        shape.geometry.outerRadius = newRadius;
        shape.geometry.innerRadius = newRadius * (ratio || 0.45);
      }
      shape.geometry.rotation = angle;
      shape.geometry.center = { ...baseGeom.center };
    }
  }
}

function handlePointerUp(event) {
  if (activePointerId !== event.pointerId) return;

  cancelHoldTimer();

  if (toolMode === 'draw') {
    if (appState === 'adjustingShape' && snappedShape) {
      shapes.push(snappedShape);
      updateStatusUI('committed-shape');
    } else if (appState === 'drawing' && currentStroke && currentStroke.length > 0) {
      const freehandLabel = generateShapeLabel('freehand');
      shapes.push({
        id: shapeIdCounter++,
        label: freehandLabel,
        type: 'freehand',
        geometry: { points: currentStroke },
        rawPoints: currentStroke
      });
      updateStatusUI('committed-freehand');
    }
  }

  appState = 'idle';
  currentStroke = null;
  snappedShape = null;
  rawStrokeBackup = null;
  holdAnchor = null;
  snapAnchor = null;
  isAdjustingActively = false;
  activeHandle = null;
  handleDragStart = null;

  if (canvas.hasPointerCapture(event.pointerId)) {
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (_) {}
  }
  activePointerId = null;

  updateStrokeCountUI();
  updateEquationsUI();
  render();
}

function handlePointerCancel() {
  cancelHoldTimer();

  // If cancelling during an edit drag, restore original geometry
  if (handleDragStart && selectedShapeId) {
    const selected = shapes.find(s => s.id === selectedShapeId);
    if (selected && handleDragStart.baseGeometry) {
      selected.geometry = JSON.parse(JSON.stringify(handleDragStart.baseGeometry));
    }
  }

  appState = 'idle';
  currentStroke = null;
  snappedShape = null;
  rawStrokeBackup = null;
  holdAnchor = null;
  snapAnchor = null;
  isAdjustingActively = false;
  activeHandle = null;
  handleDragStart = null;

  if (activePointerId !== null && canvas.hasPointerCapture(activePointerId)) {
    try {
      canvas.releasePointerCapture(activePointerId);
    } catch (_) {}
  }
  activePointerId = null;

  updateStatusUI('idle');
  updateEquationsUI();
  render();
}

// ==========================================
// 10. EDIT MODE INTERACTION (SELECT & TRANSFORM)
// ==========================================

function handleEditPointerDown(canvasX, canvasY, graphPoint) {
  const selected = shapes.find(s => s.id === selectedShapeId);
  if (selected) {
    const handle = findHitHandle(selected, canvasX, canvasY);
    if (handle) {
      activeHandle = handle;
      appState = 'transformingShape';
      handleDragStart = {
        canvasX,
        canvasY,
        graphPoint,
        baseGeometry: JSON.parse(JSON.stringify(selected.geometry))
      };
      render();
      return;
    }
  }

  const hitShape = findHitShape(canvasX, canvasY);
  if (hitShape) {
    selectedShapeId = hitShape.id;
    appState = 'idle';
    updateStatusUI('edit-selected');
  } else {
    selectedShapeId = null;
    appState = 'idle';
    updateStatusUI('idle');
  }
  updateEquationsUI();
  render();
}

function handleEditPointerMove(canvasX, canvasY) {
  const selected = shapes.find(s => s.id === selectedShapeId);
  if (!selected || !activeHandle || !handleDragStart) return;

  const currentGraph = canvasToGraph(canvasX, canvasY, displayWidth, displayHeight);

  if (activeHandle === 'center') {
    const dx = currentGraph.x - handleDragStart.graphPoint.x;
    const dy = currentGraph.y - handleDragStart.graphPoint.y;
    if (selected.geometry.center) {
      selected.geometry.center = {
        x: handleDragStart.baseGeometry.center.x + dx,
        y: handleDragStart.baseGeometry.center.y + dy
      };
    }
    if (selected.type === 'triangle' && selected.geometry.vertices) {
      selected.geometry.vertices = handleDragStart.baseGeometry.vertices.map(v => ({
        x: v.x + dx,
        y: v.y + dy
      }));
    }
  } else {
    const tempShape = {
      type: selected.type,
      geometry: selected.geometry,
      baseGeometry: handleDragStart.baseGeometry,
      initialDragGraph: handleDragStart.graphPoint
    };
    adjustLiveShapeGeometry(tempShape, canvasX, canvasY);
  }
  updateEquationsUI();
  render();
}

function findHitHandle(shape, canvasX, canvasY) {
  const { type, geometry } = shape;
  const threshold = 12;

  if (geometry.center) {
    const c = graphToCanvas(geometry.center.x, geometry.center.y, displayWidth, displayHeight);
    if (Math.hypot(canvasX - c.x, canvasY - c.y) <= threshold) {
      return 'center';
    }
  }

  if (type === 'triangle' && geometry.vertices && geometry.vertices.length > 0) {
    const v0 = graphToCanvas(geometry.vertices[0].x, geometry.vertices[0].y, displayWidth, displayHeight);
    if (Math.hypot(canvasX - v0.x, canvasY - v0.y) <= threshold) {
      return 'scale';
    }
  }

  return 'scale';
}

function sign(p1, p2, p3) {
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

function isPointInTriangle(pt, v1, v2, v3) {
  const d1 = sign(pt, v1, v2);
  const d2 = sign(pt, v2, v3);
  const d3 = sign(pt, v3, v1);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

function findHitShape(canvasX, canvasY) {
  const threshold = 16;
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.type === 'triangle' && s.geometry.vertices && s.geometry.vertices.length === 3) {
      const v0 = graphToCanvas(s.geometry.vertices[0].x, s.geometry.vertices[0].y, displayWidth, displayHeight);
      const v1 = graphToCanvas(s.geometry.vertices[1].x, s.geometry.vertices[1].y, displayWidth, displayHeight);
      const v2 = graphToCanvas(s.geometry.vertices[2].x, s.geometry.vertices[2].y, displayWidth, displayHeight);
      if (isPointInTriangle({ x: canvasX, y: canvasY }, v0, v1, v2) ||
          distToSegment({ x: canvasX, y: canvasY }, v0, v1) <= threshold ||
          distToSegment({ x: canvasX, y: canvasY }, v1, v2) <= threshold ||
          distToSegment({ x: canvasX, y: canvasY }, v2, v0) <= threshold) {
        return s;
      }
    } else if (s.geometry.center) {
      const c = graphToCanvas(s.geometry.center.x, s.geometry.center.y, displayWidth, displayHeight);
      const r = ((s.geometry.radius || s.geometry.outerRadius || s.geometry.width || 2) / 20) * displayWidth;
      if (Math.hypot(canvasX - c.x, canvasY - c.y) <= r + threshold) {
        return s;
      }
    } else if (s.geometry.p1 && s.geometry.p2) {
      const p1 = graphToCanvas(s.geometry.p1.x, s.geometry.p1.y, displayWidth, displayHeight);
      const p2 = graphToCanvas(s.geometry.p2.x, geometry.p2.y, displayWidth, displayHeight);
      if (distToSegment({ x: canvasX, y: canvasY }, p1, p2) <= threshold) {
        return s;
      }
    } else if (s.type === 'freehand' && s.geometry.points) {
      for (const pt of s.geometry.points) {
        const cp = graphToCanvas(pt.x, pt.y, displayWidth, displayHeight);
        if (Math.hypot(canvasX - cp.x, canvasY - cp.y) <= threshold) {
          return s;
        }
      }
    }
  }
  return null;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ==========================================
// 11. UI ACTIONS & LISTENERS
// ==========================================

function updateStrokeCountUI() {
  if (strokeCountDisplay) {
    strokeCountDisplay.textContent = shapes.length.toString();
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

  shapes = [];
  currentStroke = null;
  snappedShape = null;
  rawStrokeBackup = null;
  selectedShapeId = null;
  snapAnchor = null;
  isAdjustingActively = false;
  appState = 'idle';

  lastRecognitionDebug = {
    timestamp: 0,
    strokeMetrics: null,
    rawCorners: [],
    cleanedCorners: [],
    candidates: [],
    winner: null,
    selectionReason: 'Canvas cleared.',
    rawStrokeExport: null
  };

  updateStrokeCountUI();
  updateStatusUI('cleared');
  updateDebugUI();
  updateEquationsUI();
  render();
}

function setToolMode(mode) {
  toolMode = mode;
  selectedShapeId = null;
  appState = 'idle';

  if (mode === 'draw') {
    modeDrawBtn.classList.add('active');
    modeEditBtn.classList.remove('active');
    canvas.style.cursor = 'crosshair';
  } else {
    modeEditBtn.classList.add('active');
    modeDrawBtn.classList.remove('active');
    canvas.style.cursor = 'default';
  }

  updateStatusUI('idle');
  updateEquationsUI();
  render();
}

function toggleDebugPanel() {
  isDebugVisible = !isDebugVisible;
  if (isDebugVisible) {
    debugPanel.classList.remove('hidden');
    debugToggleBtn.classList.add('active');
    updateDebugUI();
  } else {
    debugPanel.classList.add('hidden');
    debugToggleBtn.classList.remove('active');
  }
  render();
}

function handleCopyStrokeJSON() {
  const data = lastRecognitionDebug.rawStrokeExport || (currentStroke ? currentStroke.map(p => ({ x: Number(p.x.toFixed(4)), y: Number(p.y.toFixed(4)) })) : null);
  if (!data || data.length === 0) {
    alert('No stroke points recorded yet. Draw a stroke on the canvas first!');
    return;
  }
  const json = JSON.stringify(data);
  navigator.clipboard.writeText(json).then(() => {
    if (debugCopyBtn) {
      const originalText = debugCopyBtn.textContent;
      debugCopyBtn.textContent = '✅ Copied!';
      setTimeout(() => { debugCopyBtn.textContent = originalText; }, 1500);
    }
  }).catch(() => {
    prompt('Copy stroke JSON below:', json);
  });
}

function handleToggleReplayBox() {
  if (!debugReplayBox) return;
  debugReplayBox.classList.toggle('hidden');
}

function handleRunReplay() {
  if (!debugReplayInput) return;
  const raw = debugReplayInput.value.trim();
  if (!raw) return;
  try {
    const pts = JSON.parse(raw);
    if (!Array.isArray(pts) || pts.length < 3) {
      alert('Invalid stroke JSON: Must be an array with at least 3 points [{x, y}, ...].');
      return;
    }
    const recognized = recognizeGeometricShape(
      pts,
      displayWidth,
      displayHeight,
      graphToCanvas,
      canvasToGraph
    );
    updateDebugUI();
    if (recognized) {
      const shapeLabel = generateShapeLabel(recognized.type, recognized.geometry?.sides);
      shapes.push({
        id: shapeIdCounter++,
        label: shapeLabel,
        type: recognized.type,
        geometry: recognized.geometry,
        baseGeometry: JSON.parse(JSON.stringify(recognized.geometry)),
        rawPoints: pts
      });
      updateStatusUI('committed-shape');
      updateStrokeCountUI();
      updateEquationsUI();
      render();
    } else {
      const freehandLabel = generateShapeLabel('freehand');
      updateStatusUI('committed-freehand');
      shapes.push({
        id: shapeIdCounter++,
        label: freehandLabel,
        type: 'freehand',
        geometry: { points: pts },
        rawPoints: pts
      });
      updateStrokeCountUI();
      updateEquationsUI();
      render();
    }
  } catch (err) {
    alert('Error parsing JSON: ' + err.message);
  }
}

// Button Listeners
modeDrawBtn.addEventListener('click', () => setToolMode('draw'));
modeEditBtn.addEventListener('click', () => setToolMode('edit'));
debugToggleBtn.addEventListener('click', toggleDebugPanel);
clearBtn.addEventListener('click', handleClear);

if (debugCopyBtn) debugCopyBtn.addEventListener('click', handleCopyStrokeJSON);
if (debugReplayToggleBtn) debugReplayToggleBtn.addEventListener('click', handleToggleReplayBox);
if (debugRunReplayBtn) debugRunReplayBtn.addEventListener('click', handleRunReplay);

// Pointer Listeners
canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointercancel', handlePointerCancel);
canvas.addEventListener('lostpointercapture', handlePointerCancel);

// Window & Container Resize
window.addEventListener('resize', resizeCanvas);
const resizeObserver = new ResizeObserver(() => {
  resizeCanvas();
});
resizeObserver.observe(canvas.parentElement);

// Ensure KaTeX equations render if script loaded asynchronously
window.addEventListener('load', () => {
  updateEquationsUI();
});

// Initial setup
resizeCanvas();
updateStatusUI('idle');
updateDebugUI();
updateEquationsUI();
