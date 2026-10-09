/**
 * Reverse Desmos - Milestone 3: Mathematical Equations & Numerical Shape Properties
 * 
 * Manages:
 * 1. Tool Modes: 'draw' (freehand & draw-and-hold snapping) and 'edit' (select & transform).
 * 2. Shape Data Model: typed shapes (line, circle, ellipse, rectangle, square, triangle, polygon, star, freehand).
 * 3. Exact Mathematical Equations: Live derivation and KaTeX display of equations directly from graph geometry.
 * 4. Numerical Shape Properties Panel: Inspect and precisely adjust coordinates and dimensions in graph units.
 * 5. Stable Shape Badges: Canvas badges matched to collapsible equation cards in the results panel.
 * 6. Non-destructive preview and live locked adjustment with real-time equation updating.
 * 7. Post-commit shape selection, manipulation handles, and Clear operations.
 * 8. Development-only Debug Diagnostics Telemetry overlay.
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

// Milestone 4: Backend Equation Fitting Configuration & State
const BACKEND_FIT_URL = 'http://127.0.0.1:8001/fit';
let currentFitRequestId = 0;

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

// Shape Properties Panel DOM Elements
const propertiesCard = document.getElementById('properties-card');
const propertiesShapeBadge = document.getElementById('properties-shape-badge');
const propertiesBody = document.getElementById('properties-body');

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

      // Milestone 4: Fitted Function Curve Overlay (Emerald Green)
      if (shape.fitData && shape.fitData.success && shape.showOverlay !== false) {
        const candidates = shape.fitData.candidates || [];
        const candidateIndex = (shape.selectedCandidateIndex >= 0 && shape.selectedCandidateIndex < candidates.length)
          ? shape.selectedCandidateIndex
          : 0;
        const samples = cand.plot_points || cand.plotting_samples || [];
        if (cand && samples.length > 1) {
          ctx.save();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = isSelected ? STYLES.strokeWidth + 2 : STYLES.strokeWidth + 1.5;
          ctx.beginPath();
          const firstPt = graphToCanvas(samples[0].x, samples[0].y, displayWidth, displayHeight);
          ctx.moveTo(firstPt.x, firstPt.y);
          for (let i = 1; i < samples.length; i++) {
            const pt = graphToCanvas(samples[i].x, samples[i].y, displayWidth, displayHeight);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();

          // Highlight domain boundary endpoints
          const startPt = graphToCanvas(samples[0].x, samples[0].y, displayWidth, displayHeight);
          const endPt = graphToCanvas(samples[samples.length - 1].x, samples[samples.length - 1].y, displayWidth, displayHeight);
          [startPt, endPt].forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#10b981';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          });
          ctx.restore();
        }
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

  if (eqData.isSideways) {
    const orientBadge = document.createElement('span');
    orientBadge.className = 'fit-orient-badge';
    orientBadge.textContent = 'x = g(y)';
    titleTag.appendChild(orientBadge);
  }

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
  if (!eqData.isFreehand || eqData.isFitted) {
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
    if (shape.fitStatus === 'loading') {
      const loadingBox = document.createElement('div');
      loadingBox.className = 'fit-loading-box';
      loadingBox.innerHTML = `
        <div class="fit-spinner"></div>
        <span>Fitting function curve families (Linear, Quadratic, Cubic, Abs, Sine)...</span>
      `;
      card.appendChild(loadingBox);
    } else if (shape.fitStatus === 'error') {
      const errBox = document.createElement('div');
      errBox.className = 'fit-rejection-box';
      errBox.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      errBox.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
      errBox.style.color = '#fca5a5';
      errBox.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 0.25rem;">⚠️ Fitting Service Notice</div>
        <div style="font-size: 0.8rem; line-height: 1.4;">${shape.fitError || 'Cannot connect to Python FastAPI backend at http://127.0.0.1:8001.'}</div>
      `;
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'btn-fit';
      retryBtn.style.marginTop = '0.5rem';
      retryBtn.style.padding = '0.35rem 0.75rem';
      retryBtn.textContent = '🔄 Retry Connection';
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fitFreehandStroke(shape);
      });
      errBox.appendChild(retryBtn);
      card.appendChild(errBox);
    } else if (shape.fitStatus === 'rejected') {
      const rejBox = document.createElement('div');
      rejBox.className = 'fit-rejection-box';
      const isParam = !!shape.fitData?.is_parametric_needed;
      const reason = shape.fitData?.rejection_reason || shape.fitData?.message || 'Curve could not be approximated by supported function families.';
      rejBox.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 0.25rem;">ℹ️ Curve Not Fitted</div>
        <div style="font-size: 0.8rem; line-height: 1.4;">${reason}</div>
      `;
      if (!isParam) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'btn-fit';
        retryBtn.style.marginTop = '0.5rem';
        retryBtn.style.padding = '0.35rem 0.75rem';
        retryBtn.textContent = '🔄 Try Again';
        retryBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          fitFreehandStroke(shape);
        });
        rejBox.appendChild(retryBtn);
      }
      card.appendChild(rejBox);
    } else if (eqData.isFitted) {
      // Poor Fit Warning Banner if forced or inadequate
      if (eqData.isPoorFit) {
        const warnBox = document.createElement('div');
        warnBox.className = 'fit-warning-box';
        warnBox.innerHTML = `<span>⚠️</span><span>${eqData.warning || 'Poor fit: Model does not adequately match stroke geometry.'}</span>`;
        card.appendChild(warnBox);
      }

      // Candidate selector pills
      if (eqData.candidates && eqData.candidates.length > 1) {
        const candContainer = document.createElement('div');
        candContainer.className = 'fit-candidates-container';
        eqData.candidates.forEach((cand, idx) => {
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = `fit-candidate-pill ${idx === eqData.candidateIndex ? 'active' : ''}`;
          const isTop = idx === 0 ? '★ ' : '';
          const orientTag = cand.orientation === 'x_of_y' ? ' [x=g(y)]' : '';
          const errVal = cand.geom_error !== undefined ? cand.geom_error : cand.rmse;
          pill.innerHTML = `<span>${isTop}${cand.family_name}${orientTag}</span> <span class="fit-rmse-tag">Err: ${errVal.toFixed(3)}</span>`;
          pill.addEventListener('click', (e) => {
            e.stopPropagation();
            shape.selectedCandidateIndex = idx;
            updateEquationsUI();
            refreshPropertiesInputsIfSelected(shape.id);
            render();
          });
          candContainer.appendChild(pill);
        });
        card.appendChild(candContainer);
      }

      // Math Box
      const mathBox = document.createElement('div');
      mathBox.className = 'equation-math-box';
      const formulaDiv = document.createElement('div');
      formulaDiv.className = 'equation-formula';
      renderLatexToElement(eqData.primaryEquation, formulaDiv, true);
      mathBox.appendChild(formulaDiv);

      const statsDiv = document.createElement('div');
      statsDiv.className = 'equation-details-sub';
      const errVal = eqData.geomError !== undefined ? eqData.geomError : eqData.rmse;
      const orientText = eqData.isSideways ? 'x = g(y)' : 'y = f(x)';
      statsDiv.innerHTML = `<span>Family: <strong>${eqData.familyName}</strong> (${orientText})</span> <span>R²: <strong>${eqData.rSquared.toFixed(3)}</strong></span> <span>2D Error: <strong>${errVal.toFixed(3)}</strong></span>`;
      mathBox.appendChild(statsDiv);
      card.appendChild(mathBox);

      // Fit Actions Row
      const actionRow = document.createElement('div');
      actionRow.className = 'fit-action-row';

      const overlayBtn = document.createElement('button');
      overlayBtn.type = 'button';
      overlayBtn.className = `btn-toggle-overlay ${shape.showOverlay !== false ? 'active' : ''}`;
      overlayBtn.textContent = shape.showOverlay !== false ? '👁️ Overlay: Visible' : '👁️ Overlay: Hidden';
      overlayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        shape.showOverlay = !(shape.showOverlay !== false);
        overlayBtn.className = `btn-toggle-overlay ${shape.showOverlay ? 'active' : ''}`;
        overlayBtn.textContent = shape.showOverlay ? '👁️ Overlay: Visible' : '👁️ Overlay: Hidden';
        render();
      });
      actionRow.appendChild(overlayBtn);

      const famSelect = document.createElement('select');
      famSelect.className = 'fit-family-select';
      famSelect.title = 'Select a specific curve family to fit';
      famSelect.innerHTML = `
        <option value="">Auto Best Fit</option>
        <option value="linear">Linear</option>
        <option value="quadratic">Quadratic</option>
        <option value="cubic">Cubic</option>
        <option value="absolute_value">Absolute Value</option>
        <option value="sine">Sine Wave</option>
      `;

      const refitBtn = document.createElement('button');
      refitBtn.type = 'button';
      refitBtn.className = 'btn-fit';
      refitBtn.style.padding = '0.35rem 0.65rem';
      refitBtn.style.fontSize = '0.78rem';
      refitBtn.textContent = '🔄 Refit';
      refitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chosen = famSelect.value || null;
        fitFreehandStroke(shape, chosen);
      });

      actionRow.appendChild(famSelect);
      actionRow.appendChild(refitBtn);
      card.appendChild(actionRow);
    } else {
      // Unfitted initial state
      const freehandBox = document.createElement('div');
      freehandBox.className = 'equation-math-box';
      freehandBox.style.fontSize = '0.825rem';
      freehandBox.style.color = '#94a3b8';
      freehandBox.textContent = 'Freehand curve drawn. Click "Fit Curve Equation" to discover the best mathematical model (Linear, Quadratic, Cubic, Absolute Value, or Sine Wave).';
      card.appendChild(freehandBox);

      const actionRow = document.createElement('div');
      actionRow.className = 'fit-action-row';
      const fitBtn = document.createElement('button');
      fitBtn.type = 'button';
      fitBtn.className = 'btn-fit';
      fitBtn.innerHTML = '⚡ Fit Curve Equation';
      fitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fitFreehandStroke(shape);
      });
      actionRow.appendChild(fitBtn);
      card.appendChild(actionRow);
    }
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

  // Click card to select shape and open properties
  card.addEventListener('click', () => {
    selectedShapeId = shape.id;
    setToolMode('edit');
    updateStatusUI('edit-selected');
    updateEquationsUI();
    renderShapePropertiesUI(shape);
    render();
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
    const isSelected = (shape.id === selectedShapeId);
    const eqData = deriveShapeEquations(shape);
    if (!eqData) continue;

    const card = createEquationCard(shape, eqData, isSelected, isPreview);
    equationsList.appendChild(card);
  }
}

/**
 * Milestone 4: Performs asynchronous curve fitting via the FastAPI Python backend.
 */
async function fitFreehandStroke(shape, requestedFamily = null) {
  if (!shape || shape.type !== 'freehand') return;
  const pts = shape.geometry?.points || shape.rawPoints;
  if (!pts || pts.length < 3) {
    shape.fitStatus = 'rejected';
    shape.fitData = {
      success: false,
      rejection_reason: 'Stroke contains too few distinct points to fit an equation.',
      is_parametric_needed: false
    };
    updateEquationsUI();
    refreshPropertiesInputsIfSelected(shape.id);
    render();
    return;
  }

  const thisRequestId = ++currentFitRequestId;
  shape.fitRequestId = thisRequestId;
  shape.fitStatus = 'loading';
  shape.fitError = null;

  updateEquationsUI();
  refreshPropertiesInputsIfSelected(shape.id);
  render();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 6000);

  try {
    const payload = {
      points: pts.map(p => ({ x: Number(p.x), y: Number(p.y) })),
      families: requestedFamily ? [requestedFamily] : ['linear', 'quadratic', 'cubic', 'absolute_value', 'sine'],
      stroke_id: shape.id
    };

    const response = await fetch(BACKEND_FIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.detail || `Server error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Stale response guard: check if superseded, cleared, or removed
    if (shape.fitRequestId !== thisRequestId || !shapes.includes(shape)) {
      console.log('Discarding stale fit response for request', thisRequestId);
      return;
    }

    if (data.success && data.candidates && data.candidates.length > 0) {
      shape.fitStatus = 'success';
      shape.fitData = data;
      shape.selectedCandidateIndex = 0;
      shape.showOverlay = true;
    } else {
      shape.fitStatus = 'rejected';
      shape.fitData = data;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (shape.fitRequestId !== thisRequestId || !shapes.includes(shape)) {
      return;
    }
    console.error('Fit curve error:', err);
    shape.fitStatus = 'error';
    if (err.name === 'AbortError') {
      shape.fitError = 'Fitting request timed out after 6 seconds. The backend may be busy or offline.';
    } else if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
      shape.fitError = 'Cannot connect to Python FastAPI backend at http://127.0.0.1:8001. Please make sure the backend is running.';
    } else {
      shape.fitError = err.message || 'An error occurred during equation fitting.';
    }
  } finally {
    updateEquationsUI();
    refreshPropertiesInputsIfSelected(shape.id);
    render();
  }
}

// ==========================================
// 8. NUMERICAL SHAPE PROPERTIES PANEL
// ==========================================

function formatNumForInput(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  const rounded = Number(val.toFixed(4));
  if (Object.is(rounded, -0)) return '0';
  return rounded.toString();
}

function isUserTypingInProperties() {
  if (!propertiesBody) return false;
  return propertiesBody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
}

function refreshPropertiesInputsIfSelected(shapeId) {
  if (isUserTypingInProperties()) return;
  const selected = shapes.find(s => s.id === shapeId);
  if (selected) {
    renderShapePropertiesUI(selected);
  }
}

function showPropertyError(msg, inputId = null) {
  const errBox = document.getElementById('properties-error');
  const succBox = document.getElementById('properties-success');
  if (succBox) succBox.classList.add('hidden');
  if (errBox) {
    errBox.textContent = `⚠️ ${msg}`;
    errBox.classList.remove('hidden');
  }
  if (inputId) {
    const inp = document.getElementById(inputId);
    if (inp) {
      inp.classList.add('input-error');
      inp.focus();
    }
  }
}

function showPropertySuccess(msg) {
  const errBox = document.getElementById('properties-error');
  const succBox = document.getElementById('properties-success');
  if (errBox) errBox.classList.add('hidden');
  if (succBox) {
    succBox.textContent = `✅ ${msg}`;
    succBox.classList.remove('hidden');
    setTimeout(() => {
      if (succBox) succBox.classList.add('hidden');
    }, 2500);
  }
}

function getNumericFieldValue(inputId, originalVal) {
  const input = document.getElementById(inputId);
  if (!input) return originalVal;
  input.classList.remove('input-error');
  const trimmed = input.value.trim();
  if (trimmed === '') throw new Error('Input field cannot be empty');
  const parsed = parseFloat(trimmed);
  if (isNaN(parsed) || !isFinite(parsed)) throw new Error('Must be a valid finite number');
  // If user did not change the formatted string, keep original full-precision value
  if (trimmed === formatNumForInput(originalVal)) {
    return originalVal;
  }
  return parsed;
}

/**
 * Renders the numerical property inputs for the selected shape.
 */
function renderShapePropertiesUI(shape) {
  if (!propertiesBody || !propertiesShapeBadge) return;

  if (!shape) {
    propertiesShapeBadge.textContent = 'No Selection';
    propertiesShapeBadge.className = 'properties-shape-badge no-selection';
    propertiesBody.innerHTML = `
      <div class="properties-empty-state">
        <span class="empty-icon">👆</span>
        <p>No shape selected.</p>
        <span class="empty-subtext">Click any shape on the canvas or its equation card to inspect and precisely adjust its numerical coordinates and dimensions.</span>
      </div>
    `;
    return;
  }

  const { type, geometry } = shape;
  propertiesShapeBadge.textContent = shape.label || capitalize(type);
  propertiesShapeBadge.className = 'properties-shape-badge';

  if (type === 'freehand') {
    const pts = geometry.points || shape.rawPoints || [];
    const ptCount = pts.length;
    let xMin = 0, xMax = 0, yMin = 0, yMax = 0;
    if (ptCount > 0) {
      xMin = Math.min(...pts.map(p => p.x));
      xMax = Math.max(...pts.map(p => p.x));
      yMin = Math.min(...pts.map(p => p.y));
      yMax = Math.max(...pts.map(p => p.y));
    }

    const isFitted = shape.fitData && shape.fitData.success && shape.fitData.candidates && shape.fitData.candidates.length > 0;
    const candidates = isFitted ? shape.fitData.candidates : [];
    const selectedIdx = shape.selectedCandidateIndex || 0;
    const activeCand = isFitted ? (candidates[selectedIdx] || candidates[0]) : null;

    let fitSectionHtml = '';
    if (shape.fitStatus === 'loading') {
      fitSectionHtml = `
        <div class="fit-loading-box" style="margin-top: 0.75rem;">
          <div class="fit-spinner"></div>
          <span>Fitting curve equation via backend...</span>
        </div>
      `;
    } else if (shape.fitStatus === 'rejected') {
      const isParam = !!shape.fitData?.is_parametric_needed;
      const reason = shape.fitData?.rejection_reason || 'Curve could not be approximated by supported function families.';
      const retryBtnHtml = isParam ? '' : `<button type="button" class="btn-fit" id="prop-refit-btn" style="margin-top: 0.5rem; padding: 0.35rem 0.75rem;">🔄 Try Again</button>`;
      fitSectionHtml = `
        <div class="fit-rejection-box" style="margin-top: 0.75rem;">
          <div style="font-weight: 600; margin-bottom: 0.25rem;">ℹ️ Curve Not Fitted</div>
          <div style="font-size: 0.8rem; line-height: 1.4;">${reason}</div>
          ${retryBtnHtml}
        </div>
      `;
    } else if (shape.fitStatus === 'error') {
      fitSectionHtml = `
        <div class="fit-rejection-box" style="margin-top: 0.75rem; border-color: rgba(239, 68, 68, 0.4); background-color: rgba(239, 68, 68, 0.08); color: #fca5a5;">
          <div style="font-weight: 600; margin-bottom: 0.25rem;">⚠️ Fitting Service Notice</div>
          <div style="font-size: 0.8rem; line-height: 1.4;">${shape.fitError || 'Ensure Python backend is running on port 8001.'}</div>
          <button type="button" class="btn-fit" id="prop-refit-btn" style="margin-top: 0.5rem; padding: 0.35rem 0.75rem;">🔄 Retry Connection</button>
        </div>
      `;
    } else if (isFitted && activeCand) {
      let paramsHtml = '';
      const params = activeCand.params || activeCand.parameters || {};
      for (const [key, val] of Object.entries(params)) {
        paramsHtml += `
          <div class="property-group">
            <label class="property-label">${key}</label>
            <input type="text" class="property-input" readonly value="${val.toFixed(6)}" style="background: rgba(15, 23, 42, 0.6); color: #94a3b8;" />
          </div>
        `;
      }

      let candPillsHtml = '';
      if (candidates.length > 1) {
        candPillsHtml = `
          <div style="margin-top: 0.5rem; margin-bottom: 0.5rem;">
            <label class="property-label">Candidate Family:</label>
            <div class="fit-candidates-container" style="margin-top: 0.25rem;">
              ${candidates.map((c, i) => {
                const orientTag = c.orientation === 'x_of_y' ? ' [x=g(y)]' : '';
                const errVal = c.geom_error !== undefined ? c.geom_error : c.rmse;
                return `
                <button type="button" class="fit-candidate-pill ${i === selectedIdx ? 'active' : ''}" data-cand-idx="${i}">
                  <span>${i === 0 ? '★ ' : ''}${c.family_name}${orientTag}</span>
                  <span class="fit-rmse-tag">Err: ${errVal.toFixed(3)}</span>
                </button>
              `;}).join('')}
            </div>
          </div>
        `;
      }

      const warnHtml = activeCand.is_poor_fit ? `
        <div class="fit-warning-box">
          <span>⚠️</span><span>${activeCand.warning || 'Poor fit: Model does not match stroke geometry well.'}</span>
        </div>
      ` : '';

      const errVal = activeCand.geom_error !== undefined ? activeCand.geom_error : activeCand.rmse;
      const orientLabel = activeCand.orientation === 'x_of_y' ? 'x = g(y) (Sideways)' : 'y = f(x)';

      fitSectionHtml = `
        <div class="fit-card-section" style="margin-top: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <span style="font-size: 0.85rem; font-weight: 600; color: #38bdf8;">✨ Fitted Model: ${activeCand.family_name}</span>
            <span class="fit-rmse-tag" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">2D Error: ${errVal.toFixed(4)}</span>
          </div>
          <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.35rem;">Orientation: <strong>${orientLabel}</strong> | R²: <strong>${activeCand.r_squared.toFixed(3)}</strong></div>
          ${warnHtml}
          ${candPillsHtml}
          <div class="properties-grid" style="margin-top: 0.5rem;">
            ${paramsHtml}
          </div>
          <div class="fit-action-row" style="margin-top: 0.75rem;">
            <button type="button" class="btn-toggle-overlay ${shape.showOverlay !== false ? 'active' : ''}" id="prop-toggle-overlay-btn">
              ${shape.showOverlay !== false ? '👁️ Overlay: Visible' : '👁️ Overlay: Hidden'}
            </button>
            <select class="fit-family-select" id="prop-family-select" title="Refit with specific family">
              <option value="">Auto Best Fit</option>
              <option value="linear">Linear</option>
              <option value="quadratic">Quadratic</option>
              <option value="cubic">Cubic</option>
              <option value="absolute_value">Absolute Value</option>
              <option value="sine">Sine Wave</option>
            </select>
            <button type="button" class="btn-fit" id="prop-refit-btn" style="padding: 0.35rem 0.65rem; font-size: 0.78rem;">🔄 Refit</button>
          </div>
        </div>
      `;
    } else {
      fitSectionHtml = `
        <div class="fit-action-row" style="margin-top: 0.75rem;">
          <button type="button" class="btn-fit" id="prop-fit-btn" style="width: 100%; justify-content: center;">
            ⚡ Fit Curve Equation
          </button>
        </div>
      `;
    }

    propertiesBody.innerHTML = `
      <div class="properties-form">
        <div class="properties-info-row">
          <span>Type: <strong>Freehand Stroke</strong></span>
          <span>Sampled Points: <strong>${ptCount}</strong></span>
        </div>
        <div class="properties-info-row">
          <span>X Domain: <strong>[${xMin.toFixed(2)}, ${xMax.toFixed(2)}]</strong></span>
          <span>Y Range: <strong>[${yMin.toFixed(2)}, ${yMax.toFixed(2)}]</strong></span>
        </div>
        ${fitSectionHtml}
      </div>
    `;

    const fitBtn = document.getElementById('prop-fit-btn');
    if (fitBtn) fitBtn.addEventListener('click', () => fitFreehandStroke(shape));

    const refitBtn = document.getElementById('prop-refit-btn');
    if (refitBtn) {
      refitBtn.addEventListener('click', () => {
        const sel = document.getElementById('prop-family-select');
        const chosen = sel ? (sel.value || null) : null;
        fitFreehandStroke(shape, chosen);
      });
    }

    const toggleOverlayBtn = document.getElementById('prop-toggle-overlay-btn');
    if (toggleOverlayBtn) {
      toggleOverlayBtn.addEventListener('click', () => {
        shape.showOverlay = !(shape.showOverlay !== false);
        renderShapePropertiesUI(shape);
        updateEquationsUI();
        render();
      });
    }

    const candPills = propertiesBody.querySelectorAll('.fit-candidate-pill[data-cand-idx]');
    candPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const idx = parseInt(pill.dataset.candIdx, 10);
        shape.selectedCandidateIndex = idx;
        renderShapePropertiesUI(shape);
        updateEquationsUI();
        render();
      });
    });

    return;
  }

  let fieldsHtml = '';
  let infoHtml = '';

  switch (type) {
    case 'line': {
      const p1 = geometry.p1 || { x: 0, y: 0 };
      const p2 = geometry.p2 || { x: 0, y: 0 };
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const slopeStr = Math.abs(dx) < 1e-5 ? 'Vertical (undefined)' : (dy / dx).toFixed(3);

      fieldsHtml = `
        <div class="property-group">
          <label class="property-label" for="prop-p1x">Start X (p1)</label>
          <input type="number" step="any" id="prop-p1x" class="property-input" value="${formatNumForInput(p1.x)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-p1y">Start Y (p1)</label>
          <input type="number" step="any" id="prop-p1y" class="property-input" value="${formatNumForInput(p1.y)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-p2x">End X (p2)</label>
          <input type="number" step="any" id="prop-p2x" class="property-input" value="${formatNumForInput(p2.x)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-p2y">End Y (p2)</label>
          <input type="number" step="any" id="prop-p2y" class="property-input" value="${formatNumForInput(p2.y)}" />
        </div>
      `;
      infoHtml = `
        <div class="properties-info-row">
          <span>Length: <strong>${len.toFixed(3)}</strong></span>
          <span>Slope (m): <strong>${slopeStr}</strong></span>
        </div>
      `;
      break;
    }

    case 'circle': {
      const c = geometry.center || { x: 0, y: 0 };
      const r = geometry.radius || 1;
      const area = Math.PI * r * r;

      fieldsHtml = `
        <div class="property-group">
          <label class="property-label" for="prop-cx">Centre X (h)</label>
          <input type="number" step="any" id="prop-cx" class="property-input" value="${formatNumForInput(c.x)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-cy">Centre Y (k)</label>
          <input type="number" step="any" id="prop-cy" class="property-input" value="${formatNumForInput(c.y)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-radius">Radius (r)</label>
          <input type="number" step="any" id="prop-radius" class="property-input" value="${formatNumForInput(r)}" min="0.001" />
        </div>
      `;
      infoHtml = `
        <div class="properties-info-row">
          <span>Diameter: <strong>${(2 * r).toFixed(3)}</strong></span>
          <span>Area: <strong>${area.toFixed(3)}</strong></span>
        </div>
      `;
      break;
    }

    case 'ellipse': {
      const c = geometry.center || { x: 0, y: 0 };
      const rx = geometry.radiusX || 1;
      const ry = geometry.radiusY || 1;
      const rotDeg = -((geometry.rotation || 0) * 180 / Math.PI);
      const area = Math.PI * rx * ry;

      fieldsHtml = `
        <div class="property-group">
          <label class="property-label" for="prop-cx">Centre X (h)</label>
          <input type="number" step="any" id="prop-cx" class="property-input" value="${formatNumForInput(c.x)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-cy">Centre Y (k)</label>
          <input type="number" step="any" id="prop-cy" class="property-input" value="${formatNumForInput(c.y)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-rx">Semi-axis a (Radius X)</label>
          <input type="number" step="any" id="prop-rx" class="property-input" value="${formatNumForInput(rx)}" min="0.001" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-ry">Semi-axis b (Radius Y)</label>
          <input type="number" step="any" id="prop-ry" class="property-input" value="${formatNumForInput(ry)}" min="0.001" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-rot">Rotation (°)</label>
          <input type="number" step="any" id="prop-rot" class="property-input" value="${formatNumForInput(rotDeg)}" />
        </div>
      `;
      infoHtml = `
        <div class="properties-info-row">
          <span>Area: <strong>${area.toFixed(3)}</strong></span>
          <span>Ratio (a/b): <strong>${(rx / ry).toFixed(3)}</strong></span>
        </div>
      `;
      break;
    }

    case 'rectangle': {
      const c = geometry.center || { x: 0, y: 0 };
      const w = geometry.width || 1;
      const h = geometry.height || 1;
      const rotDeg = -((geometry.rotation || 0) * 180 / Math.PI);

      fieldsHtml = `
        <div class="property-group">
          <label class="property-label" for="prop-cx">Centre X</label>
          <input type="number" step="any" id="prop-cx" class="property-input" value="${formatNumForInput(c.x)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-cy">Centre Y</label>
          <input type="number" step="any" id="prop-cy" class="property-input" value="${formatNumForInput(c.y)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-w">Width</label>
          <input type="number" step="any" id="prop-w" class="property-input" value="${formatNumForInput(w)}" min="0.001" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-h">Height</label>
          <input type="number" step="any" id="prop-h" class="property-input" value="${formatNumForInput(h)}" min="0.001" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-rot">Rotation (°)</label>
          <input type="number" step="any" id="prop-rot" class="property-input" value="${formatNumForInput(rotDeg)}" />
        </div>
      `;
      infoHtml = `
        <div class="properties-info-row">
          <span>Perimeter: <strong>${(2 * (w + h)).toFixed(3)}</strong></span>
          <span>Area: <strong>${(w * h).toFixed(3)}</strong></span>
        </div>
      `;
      break;
    }

    case 'square': {
      const c = geometry.center || { x: 0, y: 0 };
      const side = geometry.width || 1;
      const rotDeg = -((geometry.rotation || 0) * 180 / Math.PI);

      fieldsHtml = `
        <div class="property-group">
          <label class="property-label" for="prop-cx">Centre X</label>
          <input type="number" step="any" id="prop-cx" class="property-input" value="${formatNumForInput(c.x)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-cy">Centre Y</label>
          <input type="number" step="any" id="prop-cy" class="property-input" value="${formatNumForInput(c.y)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-side">Side Length (s)</label>
          <input type="number" step="any" id="prop-side" class="property-input" value="${formatNumForInput(side)}" min="0.001" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-rot">Rotation (°)</label>
          <input type="number" step="any" id="prop-rot" class="property-input" value="${formatNumForInput(rotDeg)}" />
        </div>
      `;
      infoHtml = `
        <div class="properties-info-row">
          <span>Perimeter: <strong>${(4 * side).toFixed(3)}</strong></span>
          <span>Area: <strong>${(side * side).toFixed(3)}</strong></span>
        </div>
      `;
      break;
    }

    case 'triangle': {
      const v = geometry.vertices || [
        { x: 0, y: 1 },
        { x: -1, y: -1 },
        { x: 1, y: -1 }
      ];
      const area = Math.abs((v[0].x * (v[1].y - v[2].y) + v[1].x * (v[2].y - v[0].y) + v[2].x * (v[0].y - v[1].y)) / 2);

      fieldsHtml = `
        <div class="property-group">
          <label class="property-label" for="prop-v0x">Vertex 1 X</label>
          <input type="number" step="any" id="prop-v0x" class="property-input" value="${formatNumForInput(v[0].x)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-v0y">Vertex 1 Y</label>
          <input type="number" step="any" id="prop-v0y" class="property-input" value="${formatNumForInput(v[0].y)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-v1x">Vertex 2 X</label>
          <input type="number" step="any" id="prop-v1x" class="property-input" value="${formatNumForInput(v[1].x)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-v1y">Vertex 2 Y</label>
          <input type="number" step="any" id="prop-v1y" class="property-input" value="${formatNumForInput(v[1].y)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-v2x">Vertex 3 X</label>
          <input type="number" step="any" id="prop-v2x" class="property-input" value="${formatNumForInput(v[2].x)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-v2y">Vertex 3 Y</label>
          <input type="number" step="any" id="prop-v2y" class="property-input" value="${formatNumForInput(v[2].y)}" />
        </div>
      `;
      infoHtml = `
        <div class="properties-info-row">
          <span>Area: <strong>${area.toFixed(3)}</strong></span>
          <span>Centroid: <strong>(${((v[0].x + v[1].x + v[2].x) / 3).toFixed(2)}, ${((v[0].y + v[1].y + v[2].y) / 3).toFixed(2)})</strong></span>
        </div>
      `;
      break;
    }

    case 'polygon': {
      const c = geometry.center || { x: 0, y: 0 };
      const r = geometry.radius || 1;
      const sides = geometry.sides || 5;
      const rotDeg = -((geometry.rotation || 0) * 180 / Math.PI);

      fieldsHtml = `
        <div class="property-group">
          <label class="property-label" for="prop-cx">Centre X</label>
          <input type="number" step="any" id="prop-cx" class="property-input" value="${formatNumForInput(c.x)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-cy">Centre Y</label>
          <input type="number" step="any" id="prop-cy" class="property-input" value="${formatNumForInput(c.y)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-radius">Circumradius (r)</label>
          <input type="number" step="any" id="prop-radius" class="property-input" value="${formatNumForInput(r)}" min="0.001" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-rot">Rotation (°)</label>
          <input type="number" step="any" id="prop-rot" class="property-input" value="${formatNumForInput(rotDeg)}" />
        </div>
      `;
      infoHtml = `
        <div class="properties-info-row">
          <span>Side Count: <strong>${sides}</strong> (${sides}-gon)</span>
          <span>Interior Angle: <strong>${(((sides - 2) * 180) / sides).toFixed(1)}°</strong></span>
        </div>
      `;
      break;
    }

    case 'star': {
      const c = geometry.center || { x: 0, y: 0 };
      const r1 = geometry.outerRadius || 2;
      const r2 = geometry.innerRadius || 1;
      const rotDeg = -((geometry.rotation || 0) * 180 / Math.PI);

      fieldsHtml = `
        <div class="property-group">
          <label class="property-label" for="prop-cx">Centre X</label>
          <input type="number" step="any" id="prop-cx" class="property-input" value="${formatNumForInput(c.x)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-cy">Centre Y</label>
          <input type="number" step="any" id="prop-cy" class="property-input" value="${formatNumForInput(c.y)}" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-r1">Outer Radius (r1)</label>
          <input type="number" step="any" id="prop-r1" class="property-input" value="${formatNumForInput(r1)}" min="0.001" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-r2">Inner Radius (r2)</label>
          <input type="number" step="any" id="prop-r2" class="property-input" value="${formatNumForInput(r2)}" min="0.001" />
        </div>
        <div class="property-group">
          <label class="property-label" for="prop-rot">Rotation (°)</label>
          <input type="number" step="any" id="prop-rot" class="property-input" value="${formatNumForInput(rotDeg)}" />
        </div>
      `;
      infoHtml = `
        <div class="properties-info-row">
          <span>Points: <strong>5</strong></span>
          <span>Boundary Edges: <strong>10</strong></span>
        </div>
      `;
      break;
    }
  }

  propertiesBody.innerHTML = `
    <form class="properties-form" id="properties-form" onsubmit="return false;">
      <div class="properties-grid">
        ${fieldsHtml}
      </div>
      ${infoHtml}
      <div id="properties-error" class="properties-error hidden" role="alert"></div>
      <div id="properties-success" class="properties-success hidden" role="status"></div>
      <div class="properties-actions">
        <button type="button" id="properties-apply-btn" class="btn btn-primary" title="Apply precise numerical changes">
          Apply Changes
        </button>
        <button type="button" id="properties-cancel-btn" class="btn btn-secondary" title="Revert to current shape geometry">
          Cancel
        </button>
      </div>
      <div class="properties-note">💡 Coordinates and dimensions are in graph units. Press Enter to apply.</div>
    </form>
  `;

  // Attach event listeners for Apply, Cancel, and Enter/Escape keys
  const applyBtn = document.getElementById('properties-apply-btn');
  const cancelBtn = document.getElementById('properties-cancel-btn');

  if (applyBtn) {
    applyBtn.addEventListener('click', () => handleApplyShapeProperties(shape));
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => handleCancelShapeProperties(shape));
  }

  const inputs = propertiesBody.querySelectorAll('.property-input');
  inputs.forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleApplyShapeProperties(shape);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelShapeProperties(shape);
      }
    });
  });
}

/**
 * Validates and applies property changes to the selected shape's stored geometry.
 */
function handleApplyShapeProperties(shape) {
  if (!shape || !shape.geometry) return;

  const { type, geometry } = shape;

  try {
    switch (type) {
      case 'line': {
        const p1x = getNumericFieldValue('prop-p1x', geometry.p1.x);
        const p1y = getNumericFieldValue('prop-p1y', geometry.p1.y);
        const p2x = getNumericFieldValue('prop-p2x', geometry.p2.x);
        const p2y = getNumericFieldValue('prop-p2y', geometry.p2.y);

        geometry.p1 = { x: p1x, y: p1y };
        geometry.p2 = { x: p2x, y: p2y };
        break;
      }

      case 'circle': {
        const cx = getNumericFieldValue('prop-cx', geometry.center.x);
        const cy = getNumericFieldValue('prop-cy', geometry.center.y);
        const r = getNumericFieldValue('prop-radius', geometry.radius);

        if (r <= 0) {
          showPropertyError('Radius must be a positive number greater than 0.', 'prop-radius');
          return;
        }

        geometry.center = { x: cx, y: cy };
        geometry.radius = r;
        break;
      }

      case 'ellipse': {
        const cx = getNumericFieldValue('prop-cx', geometry.center.x);
        const cy = getNumericFieldValue('prop-cy', geometry.center.y);
        const rx = getNumericFieldValue('prop-rx', geometry.radiusX);
        const ry = getNumericFieldValue('prop-ry', geometry.radiusY);
        const rotDeg = getNumericFieldValue('prop-rot', -((geometry.rotation || 0) * 180 / Math.PI));

        if (rx <= 0) {
          showPropertyError('Semi-axis a (Radius X) must be greater than 0.', 'prop-rx');
          return;
        }
        if (ry <= 0) {
          showPropertyError('Semi-axis b (Radius Y) must be greater than 0.', 'prop-ry');
          return;
        }

        geometry.center = { x: cx, y: cy };
        geometry.radiusX = rx;
        geometry.radiusY = ry;
        geometry.rotation = -((rotDeg * Math.PI) / 180);
        break;
      }

      case 'rectangle': {
        const cx = getNumericFieldValue('prop-cx', geometry.center.x);
        const cy = getNumericFieldValue('prop-cy', geometry.center.y);
        const w = getNumericFieldValue('prop-w', geometry.width);
        const h = getNumericFieldValue('prop-h', geometry.height);
        const rotDeg = getNumericFieldValue('prop-rot', -((geometry.rotation || 0) * 180 / Math.PI));

        if (w <= 0) {
          showPropertyError('Width must be greater than 0.', 'prop-w');
          return;
        }
        if (h <= 0) {
          showPropertyError('Height must be greater than 0.', 'prop-h');
          return;
        }

        geometry.center = { x: cx, y: cy };
        geometry.width = w;
        geometry.height = h;
        geometry.rotation = -((rotDeg * Math.PI) / 180);
        break;
      }

      case 'square': {
        const cx = getNumericFieldValue('prop-cx', geometry.center.x);
        const cy = getNumericFieldValue('prop-cy', geometry.center.y);
        const side = getNumericFieldValue('prop-side', geometry.width);
        const rotDeg = getNumericFieldValue('prop-rot', -((geometry.rotation || 0) * 180 / Math.PI));

        if (side <= 0) {
          showPropertyError('Side length must be greater than 0.', 'prop-side');
          return;
        }

        geometry.center = { x: cx, y: cy };
        geometry.width = side;
        geometry.height = side;
        geometry.rotation = -((rotDeg * Math.PI) / 180);
        break;
      }

      case 'triangle': {
        const v0x = getNumericFieldValue('prop-v0x', geometry.vertices[0].x);
        const v0y = getNumericFieldValue('prop-v0y', geometry.vertices[0].y);
        const v1x = getNumericFieldValue('prop-v1x', geometry.vertices[1].x);
        const v1y = getNumericFieldValue('prop-v1y', geometry.vertices[1].y);
        const v2x = getNumericFieldValue('prop-v2x', geometry.vertices[2].x);
        const v2y = getNumericFieldValue('prop-v2y', geometry.vertices[2].y);

        if ((v0x === v1x && v0y === v1y) || (v1x === v2x && v1y === v2y) || (v2x === v0x && v2y === v0y)) {
          showPropertyError('Triangle vertices cannot be identical.', 'prop-v0x');
          return;
        }

        geometry.vertices = [
          { x: v0x, y: v0y },
          { x: v1x, y: v1y },
          { x: v2x, y: v2y }
        ];
        geometry.center = {
          x: (v0x + v1x + v2x) / 3,
          y: (v0y + v1y + v2y) / 3
        };
        break;
      }

      case 'polygon': {
        const cx = getNumericFieldValue('prop-cx', geometry.center.x);
        const cy = getNumericFieldValue('prop-cy', geometry.center.y);
        const r = getNumericFieldValue('prop-radius', geometry.radius);
        const rotDeg = getNumericFieldValue('prop-rot', -((geometry.rotation || 0) * 180 / Math.PI));

        if (r <= 0) {
          showPropertyError('Circumradius must be greater than 0.', 'prop-radius');
          return;
        }

        geometry.center = { x: cx, y: cy };
        geometry.radius = r;
        geometry.rotation = -((rotDeg * Math.PI) / 180);
        break;
      }

      case 'star': {
        const cx = getNumericFieldValue('prop-cx', geometry.center.x);
        const cy = getNumericFieldValue('prop-cy', geometry.center.y);
        const r1 = getNumericFieldValue('prop-r1', geometry.outerRadius);
        const r2 = getNumericFieldValue('prop-r2', geometry.innerRadius);
        const rotDeg = getNumericFieldValue('prop-rot', -((geometry.rotation || 0) * 180 / Math.PI));

        if (r1 <= 0) {
          showPropertyError('Outer radius must be greater than 0.', 'prop-r1');
          return;
        }
        if (r2 <= 0) {
          showPropertyError('Inner radius must be greater than 0.', 'prop-r2');
          return;
        }
        if (r2 >= r1) {
          showPropertyError('Inner radius must be strictly less than outer radius.', 'prop-r2');
          return;
        }

        geometry.center = { x: cx, y: cy };
        geometry.outerRadius = r1;
        geometry.innerRadius = r2;
        geometry.rotation = -((rotDeg * Math.PI) / 180);
        break;
      }
    }

    // Update base geometry snapshot for future adjustment handles
    shape.baseGeometry = JSON.parse(JSON.stringify(shape.geometry));

    updateEquationsUI();
    render();
    showPropertySuccess('Geometry updated.');
  } catch (err) {
    showPropertyError(err.message || 'Invalid input values.');
  }
}

/**
 * Reverts the properties inputs back to the shape's current stored geometry.
 */
function handleCancelShapeProperties(shape) {
  if (shape) {
    renderShapePropertiesUI(shape);
  }
}

// ==========================================
// 9. HOLD DETECTION & SNAP CONTROLS
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
      statusText.textContent = 'Shape selected. Drag handles or use the Shape Properties panel below.';
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
// 10. POINTER EVENT HANDLING
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
      selectedShapeId = snappedShape.id;
      renderShapePropertiesUI(snappedShape);
      updateStatusUI('committed-shape');
    } else if (appState === 'drawing' && currentStroke && currentStroke.length > 0) {
      const freehandLabel = generateShapeLabel('freehand');
      const freehandShape = {
        id: shapeIdCounter++,
        label: freehandLabel,
        type: 'freehand',
        geometry: { points: currentStroke },
        rawPoints: currentStroke,
        fitStatus: null,
        fitData: null,
        selectedCandidateIndex: 0,
        showOverlay: true
      };
      shapes.push(freehandShape);
      selectedShapeId = freehandShape.id;
      renderShapePropertiesUI(freehandShape);
      updateStatusUI('committed-freehand');
    }
  } else if (toolMode === 'edit') {
    if (selectedShapeId) {
      refreshPropertiesInputsIfSelected(selectedShapeId);
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
      renderShapePropertiesUI(selected);
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
// 11. EDIT MODE INTERACTION (SELECT & TRANSFORM)
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
    renderShapePropertiesUI(hitShape);
  } else {
    selectedShapeId = null;
    appState = 'idle';
    updateStatusUI('idle');
    renderShapePropertiesUI(null);
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

  refreshPropertiesInputsIfSelected(selected.id);
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
      const p2 = graphToCanvas(s.geometry.p2.x, s.geometry.p2.y, displayWidth, displayHeight);
      if (distToSegment({ x: canvasX, y: canvasY }, p1, p2) <= threshold) {
        return s;
      }
    } else if (s.type === 'freehand' && s.geometry.points) {
      const pts = s.geometry.points;
      for (let j = 0; j < pts.length; j++) {
        const cp = graphToCanvas(pts[j].x, pts[j].y, displayWidth, displayHeight);
        if (Math.hypot(canvasX - cp.x, canvasY - cp.y) <= threshold) {
          return s;
        }
        if (j > 0) {
          const prevCp = graphToCanvas(pts[j - 1].x, pts[j - 1].y, displayWidth, displayHeight);
          if (distToSegment({ x: canvasX, y: canvasY }, prevCp, cp) <= threshold) {
            return s;
          }
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
// 12. UI ACTIONS & LISTENERS
// ==========================================

function updateStrokeCountUI() {
  if (strokeCountDisplay) {
    strokeCountDisplay.textContent = shapes.length.toString();
  }
}

function handleClear() {
  cancelHoldTimer();
  currentFitRequestId++; // Cancel any in-flight fit requests
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
  renderShapePropertiesUI(null);
  render();
}

function setToolMode(mode) {
  toolMode = mode;
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
      const newShape = {
        id: shapeIdCounter++,
        label: shapeLabel,
        type: recognized.type,
        geometry: recognized.geometry,
        baseGeometry: JSON.parse(JSON.stringify(recognized.geometry)),
        rawPoints: pts
      };
      shapes.push(newShape);
      selectedShapeId = newShape.id;
      renderShapePropertiesUI(newShape);
      updateStatusUI('committed-shape');
      updateStrokeCountUI();
      updateEquationsUI();
      render();
    } else {
      const freehandLabel = generateShapeLabel('freehand');
      updateStatusUI('committed-freehand');
      const newShape = {
        id: shapeIdCounter++,
        label: freehandLabel,
        type: 'freehand',
        geometry: { points: pts },
        rawPoints: pts,
        fitStatus: null,
        fitData: null,
        selectedCandidateIndex: 0,
        showOverlay: true
      };
      shapes.push(newShape);
      selectedShapeId = newShape.id;
      renderShapePropertiesUI(newShape);
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
renderShapePropertiesUI(null);
