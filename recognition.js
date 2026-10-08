/**
 * Reverse Desmos - Geometric Shape Recognition Engine
 * 
 * Supports:
 * - Line segments ('line')
 * - Circles ('circle')
 * - Ellipses ('ellipse', including rotated ellipses)
 * - Rectangles ('rectangle') and Squares ('square', with side-based orientation & axis-alignment)
 * - Triangles ('triangle')
 * - Regular Polygons ('polygon', 5-8 sides: Pentagon, Hexagon, Heptagon, Octagon)
 * - Five-Point Stars ('star', 10 alternating vertices with 5-fold symmetry)
 * 
 * Fixes:
 * - Seam trimming & overlap removal for closed loops
 * - Side-based orientation estimation (replaces naive PCA for rectangles)
 * - Correct horizontal (u) vs vertical (v) dimension assignment regardless of start point/direction
 * - Rigorous structural validation for pentagons/polygons to prevent rectangle misclassification
 * - Common normalized boundary distance error metric with modest complexity penalties
 * - Comprehensive debug telemetry for inspection & debugging
 */

const SHAPE_CONFIG = {
  // Resampling distance along stroke path (CSS pixels)
  resampleStepPx: 4,

  // Minimum overall stroke span/diameter (CSS pixels)
  minStrokeSpanPx: 25,

  // Maximum allowed gap between start and end point relative to perimeter for closed shapes
  maxClosureGapRatio: 0.32,

  // Maximum normalized error thresholds for shape acceptance
  maxLineRmsError: 0.08,
  maxCircleRadialError: 0.14,
  maxEllipseError: 0.15,
  maxPolygonEdgeError: 0.16,
  maxStarError: 0.18,

  // Axis-aligned rectangle snapping threshold (radians: ~2.5 degrees)
  axisAlignedSnapAngleRad: 0.044,
  axisAlignedErrorTolerance: 0.012, // Accept axis-aligned fit if error is within 0.012 of rotated fit

  // Square vs Rectangle threshold: if aspect ratio difference < 15%, classify as Square
  squareAspectRatioThreshold: 0.15,

  // Circle vs Ellipse threshold: if radius ratio difference < 15%, classify as Circle
  circleRadiusRatioThreshold: 0.15,

  // Model complexity penalties
  complexityPenalties: {
    line: 0.000,
    circle: 0.000,
    square: 0.000,
    rectangle: 0.008,
    triangle: 0.008,
    ellipse: 0.015,
    polygon5: 0.016, // Pentagon penalty prevents overfitting rectangle corner wobble
    polygon6: 0.018,
    polygon7: 0.020,
    polygon8: 0.020,
    star: 0.030
  },

  // Ambiguity margin
  ambiguityMargin: 0.025
};

// Global debug telemetry object accessible by UI
let lastRecognitionDebug = {
  timestamp: 0,
  strokeMetrics: null,
  rawCorners: [],
  cleanedCorners: [],
  candidates: [],
  winner: null,
  selectionReason: 'No strokes analyzed yet.',
  rawStrokeExport: null
};

/**
 * Trims small closing seam overlaps where the drawn stroke looped slightly past the start point,
 * and deduplicates stationary points at the endpoint.
 */
function trimClosedSeamOverlap(points) {
  if (!points || points.length < 4) return points;

  // 1. Deduplicate consecutive stationary points (e.g. from holding still before release)
  const deduped = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = deduped[deduped.length - 1];
    const curr = points[i];
    if (Math.hypot(curr.x - prev.x, curr.y - prev.y) >= 1.0) {
      deduped.push(curr);
    }
  }

  if (deduped.length < 10) return deduped;

  // 2. Trim closing seam overlap
  const first = deduped[0];
  const n = deduped.length;
  const searchStart = Math.floor(n * 0.70);
  for (let i = n - 1; i >= searchStart; i--) {
    const dist = Math.hypot(deduped[i].x - first.x, deduped[i].y - first.y);
    if (dist < 14) {
      return deduped.slice(0, i + 1);
    }
  }
  return deduped;
}

/**
 * Resamples stroke points so adjacent points have approximately equal arc-length spacing.
 */
function resampleStroke(points, step = SHAPE_CONFIG.resampleStepPx) {
  if (!points || points.length < 2) return points ? [...points] : [];

  const resampled = [{ ...points[0] }];
  let prev = points[0];
  let accumulated = 0;

  for (let i = 1; i < points.length; i++) {
    const curr = points[i];
    const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (dist === 0) continue;

    let d = 0;
    while (accumulated + (dist - d) >= step) {
      const remaining = step - accumulated;
      d += remaining;
      const t = d / dist;
      const nx = prev.x + t * (curr.x - prev.x);
      const ny = prev.y + t * (curr.y - prev.y);
      resampled.push({ x: nx, y: ny });
      prev = { x: nx, y: ny };
      accumulated = 0;
    }
    accumulated += (dist - d);
    prev = curr;
  }

  const lastPt = points[points.length - 1];
  const lastResampled = resampled[resampled.length - 1];
  if (Math.hypot(lastPt.x - lastResampled.x, lastPt.y - lastResampled.y) > step * 0.5) {
    resampled.push({ ...lastPt });
  }

  return resampled;
}

/**
 * Computes bounding box, path length, span, and centroid of a point set.
 */
function computeStrokeMetrics(points) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let sumX = 0, sumY = 0;
  let pathLength = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    sumX += p.x;
    sumY += p.y;

    if (i > 0) {
      pathLength += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    }
  }

  const n = points.length;
  const centerX = sumX / n;
  const centerY = sumY / n;
  const width = maxX - minX;
  const height = maxY - minY;
  const diagonal = Math.hypot(width, height);
  const endpointGap = Math.hypot(points[n - 1].x - points[0].x, points[n - 1].y - points[0].y);

  const isClosed = (endpointGap / pathLength < SHAPE_CONFIG.maxClosureGapRatio) ||
    (endpointGap / Math.max(diagonal, 1) < 0.35);

  return {
    minX, maxX, minY, maxY,
    width, height, diagonal,
    centerX, centerY,
    pathLength,
    endpointGap,
    isClosed
  };
}

/**
 * Detects sharp corner peaks along a contour using windowed angular curvature,
 * followed by corner cleanup.
 */
function findCornerPeaks(points, k = 4, angleThreshold = 0.38) {
  const n = points.length;
  if (n < k * 2) return { rawCorners: [], cleanedCorners: [] };

  const turnAngles = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const prev = points[(i - k + n) % n];
    const curr = points[i];
    const next = points[(i + k) % n];

    const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
    const v2x = next.x - curr.x, v2y = next.y - curr.y;

    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 === 0 || len2 === 0) continue;

    const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
    const clampedDot = Math.max(-1, Math.min(1, dot));
    turnAngles[i] = Math.acos(clampedDot);
  }

  const cornerIndices = [];
  const minPeakDistance = Math.max(3, Math.floor(n / 22));

  for (let i = 0; i < n; i++) {
    const angle = turnAngles[i];
    if (angle < angleThreshold) continue;

    let isMax = true;
    for (let w = -minPeakDistance; w <= minPeakDistance; w++) {
      if (w === 0) continue;
      const idx = (i + w + n) % n;
      if (turnAngles[idx] > angle) {
        isMax = false;
        break;
      }
    }
    if (isMax) {
      const tooClose = cornerIndices.some(ci => {
        const d = Math.abs(ci - i);
        return Math.min(d, n - d) < minPeakDistance;
      });
      if (!tooClose) cornerIndices.push(i);
    }
  }

  const rawCorners = cornerIndices.map(idx => points[idx]);
  const cleanedCorners = cleanPolygonCorners(rawCorners);
  return { rawCorners, cleanedCorners };
}

/**
 * Cleans extracted corners by merging micro-kinks and collinear vertices.
 */
function cleanPolygonCorners(corners) {
  if (corners.length <= 3) return corners.slice();

  let pts = corners.slice();
  let changed = true;

  while (changed && pts.length > 3) {
    changed = false;
    const n = pts.length;
    let totalPerimeter = 0;
    const edgeLengths = [];

    for (let i = 0; i < n; i++) {
      const next = pts[(i + 1) % n];
      const el = Math.hypot(next.x - pts[i].x, next.y - pts[i].y);
      edgeLengths.push(el);
      totalPerimeter += el;
    }
    const avgEdgeLen = totalPerimeter / n;

    // 1. Remove tiny micro-edges (< 16% of average edge length)
    for (let i = 0; i < n; i++) {
      if (edgeLengths[i] < avgEdgeLen * 0.16) {
        const next = pts[(i + 1) % n];
        const mid = { x: (pts[i].x + next.x) / 2, y: (pts[i].y + next.y) / 2 };
        pts.splice(i, 1, mid);
        pts.splice((i + 1) % pts.length, 1);
        changed = true;
        break;
      }
    }
    if (changed) continue;

    // 2. Remove nearly collinear vertices (turn angle < 22 degrees)
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];

      const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
      const v2x = next.x - curr.x, v2y = next.y - curr.y;
      const len1 = Math.hypot(v1x, v1y), len2 = Math.hypot(v2x, v2y);
      if (len1 === 0 || len2 === 0) continue;

      const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
      const turn = Math.acos(Math.max(-1, Math.min(1, dot)));

      if (turn < 0.38) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }

  return pts;
}

/**
 * Checks if points cover at least 7 of 8 angular sectors around a center point (>= 300 degrees),
 * verifying full closed boundary coverage.
 */
function checkAngularSectorCoverage(points, centerX, centerY, minSectors = 7) {
  const sectors = new Uint8Array(8);
  for (let i = 0; i < points.length; i++) {
    const angle = Math.atan2(points[i].y - centerY, points[i].x - centerX); // -PI to PI
    const normAngle = (angle + Math.PI) / (Math.PI * 2); // 0 to 1
    const sector = Math.min(7, Math.floor(normAngle * 8));
    sectors[sector] = 1;
  }
  let count = 0;
  for (let i = 0; i < 8; i++) {
    if (sectors[i] === 1) count++;
  }
  return count >= minSectors;
}

/**
 * 1. LINE CANDIDATE (Total Least Squares)
 */
function fitLineCandidate(points, metrics) {
  const n = points.length;
  if (n < 2) return null;

  const firstPt = points[0];
  const lastPt = points[n - 1];
  const span = Math.hypot(lastPt.x - firstPt.x, lastPt.y - firstPt.y);

  if (span < SHAPE_CONFIG.minStrokeSpanPx) return null;
  if (metrics.pathLength / span > 1.25) return null;

  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const u = points[i].x - metrics.centerX;
    const v = points[i].y - metrics.centerY;
    sxx += u * u;
    syy += v * v;
    sxy += u * v;
  }

  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dirX = Math.cos(theta);
  const dirY = Math.sin(theta);
  const normX = -Math.sin(theta);
  const normY = Math.cos(theta);

  let sumSqDev = 0;
  let maxDev = 0;
  for (let i = 0; i < n; i++) {
    const u = points[i].x - metrics.centerX;
    const v = points[i].y - metrics.centerY;
    const perpDist = Math.abs(u * normX + v * normY);
    sumSqDev += perpDist * perpDist;
    if (perpDist > maxDev) maxDev = perpDist;
  }

  const rmsDev = Math.sqrt(sumSqDev / n);
  const rawError = rmsDev / span;

  if (rawError > SHAPE_CONFIG.maxLineRmsError || maxDev > 16) return null;

  const u0 = firstPt.x - metrics.centerX, v0 = firstPt.y - metrics.centerY;
  const t0 = u0 * dirX + v0 * dirY;
  const u1 = lastPt.x - metrics.centerX, v1 = lastPt.y - metrics.centerY;
  const t1 = u1 * dirX + v1 * dirY;

  return {
    type: 'line',
    rawError,
    complexityPenalty: SHAPE_CONFIG.complexityPenalties.line,
    normalizedError: rawError + SHAPE_CONFIG.complexityPenalties.line,
    passedChecks: true,
    geometry: {
      p1: { x: metrics.centerX + t0 * dirX, y: metrics.centerY + t0 * dirY },
      p2: { x: metrics.centerX + t1 * dirX, y: metrics.centerY + t1 * dirY }
    },
    details: `Span: ${Math.round(span)}px, RMS: ${rmsDev.toFixed(2)}px`
  };
}

/**
 * 2. CIRCLE CANDIDATE
 * Evaluated independently of polygon corner counts, with angular coverage verification.
 */
function fitCircleCandidate(points, metrics, cornerCount = 0) {
  if (!metrics.isClosed || metrics.diagonal < SHAPE_CONFIG.minStrokeSpanPx) return null;
  if (!checkAngularSectorCoverage(points, metrics.centerX, metrics.centerY)) return null;

  const n = points.length;
  let sumR = 0;
  const radii = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const r = Math.hypot(points[i].x - metrics.centerX, points[i].y - metrics.centerY);
    radii[i] = r;
    sumR += r;
  }
  const meanRadius = sumR / n;
  if (meanRadius < 8) return null;

  let sumSqErr = 0;
  for (let i = 0; i < n; i++) {
    const err = (radii[i] - meanRadius) / meanRadius;
    sumSqErr += err * err;
  }

  const rmsRadialError = Math.sqrt(sumSqErr / n);
  const rawError = rmsRadialError;

  if (rawError > SHAPE_CONFIG.maxCircleRadialError) return null;

  // Add a corner penalty if 5+ prominent corners were detected on straight sides
  const cornerPenalty = (cornerCount >= 5) ? 0.025 : 0;

  return {
    type: 'circle',
    rawError,
    complexityPenalty: SHAPE_CONFIG.complexityPenalties.circle + cornerPenalty,
    normalizedError: rawError + SHAPE_CONFIG.complexityPenalties.circle + cornerPenalty,
    passedChecks: true,
    geometry: {
      center: { x: metrics.centerX, y: metrics.centerY },
      radius: meanRadius
    },
    details: `Radius: ${Math.round(meanRadius)}px, Radial Error: ${(rawError * 100).toFixed(1)}%`
  };
}

/**
 * 3. ELLIPSE CANDIDATE
 * Evaluated independently of polygon corner counts, using 2x2 linear least squares on resampled points.
 */
function fitEllipseCandidate(points, metrics, cornerCount = 0) {
  if (!metrics.isClosed || metrics.diagonal < SHAPE_CONFIG.minStrokeSpanPx) return null;
  if (!checkAngularSectorCoverage(points, metrics.centerX, metrics.centerY)) return null;

  const n = points.length;
  let sxx = 0, syy = 0, sxy = 0;

  for (let i = 0; i < n; i++) {
    const u = points[i].x - metrics.centerX;
    const v = points[i].y - metrics.centerY;
    sxx += u * u;
    syy += v * v;
    sxy += u * v;
  }

  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  let sU4 = 0, sV4 = 0, sU2V2 = 0, sU2 = 0, sV2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = points[i].x - metrics.centerX;
    const dy = points[i].y - metrics.centerY;
    const u = dx * cosT + dy * sinT;
    const v = -dx * sinT + dy * cosT;
    const u2 = u * u;
    const v2 = v * v;
    sU4 += u2 * u2;
    sV4 += v2 * v2;
    sU2V2 += u2 * v2;
    sU2 += u2;
    sV2 += v2;
  }

  // Solve 2x2 linear least squares for A = 1/a^2, B = 1/b^2
  const det = sU4 * sV4 - sU2V2 * sU2V2;
  let radiusX = Math.sqrt(2 * sU2 / n);
  let radiusY = Math.sqrt(2 * sV2 / n);

  if (Math.abs(det) > 1e-6) {
    const A = (sU2 * sV4 - sV2 * sU2V2) / det;
    const B = (sV2 * sU4 - sU2 * sU2V2) / det;
    if (A > 0 && B > 0) {
      radiusX = 1 / Math.sqrt(A);
      radiusY = 1 / Math.sqrt(B);
    }
  }

  if (radiusX < 8 || radiusY < 8) return null;

  let sumSqErr = 0;
  for (let i = 0; i < n; i++) {
    const dx = points[i].x - metrics.centerX;
    const dy = points[i].y - metrics.centerY;
    const u = dx * cosT + dy * sinT;
    const v = -dx * sinT + dy * cosT;
    const normalizedDist = Math.hypot(u / radiusX, v / radiusY);
    const err = normalizedDist - 1.0;
    sumSqErr += err * err;
  }

  const rawError = Math.sqrt(sumSqErr / n);
  if (rawError > SHAPE_CONFIG.maxEllipseError) return null;

  const maxR = Math.max(radiusX, radiusY);
  const minR = Math.min(radiusX, radiusY);
  const cornerPenalty = (cornerCount >= 5) ? 0.025 : 0;

  // If aspect ratio is close to 1:1, classify as Circle to ensure stable orientation
  if ((maxR - minR) / maxR < SHAPE_CONFIG.circleRadiusRatioThreshold) {
    const avgR = (radiusX + radiusY) / 2;
    return {
      type: 'circle',
      rawError,
      complexityPenalty: SHAPE_CONFIG.complexityPenalties.circle + cornerPenalty,
      normalizedError: rawError + SHAPE_CONFIG.complexityPenalties.circle + cornerPenalty,
      passedChecks: true,
      geometry: {
        center: { x: metrics.centerX, y: metrics.centerY },
        radius: avgR
      },
      details: `Simplified to Circle (Radii ratio: ${(minR / maxR).toFixed(2)})`
    };
  }

  return {
    type: 'ellipse',
    rawError,
    complexityPenalty: SHAPE_CONFIG.complexityPenalties.ellipse + cornerPenalty,
    normalizedError: rawError + SHAPE_CONFIG.complexityPenalties.ellipse + cornerPenalty,
    passedChecks: true,
    geometry: {
      center: { x: metrics.centerX, y: metrics.centerY },
      radiusX,
      radiusY,
      rotation: theta
    },
    details: `Radii: ${Math.round(radiusX)}x${Math.round(radiusY)}px, Rot: ${(theta * 180 / Math.PI).toFixed(1)}°`
  };
}

/**
 * 4. TRIANGLE CANDIDATE
 * Stores center centroid (p1+p2+p3)/3 for scaling and rotation around fixed center.
 */
function fitTriangleCandidate(points, metrics, corners) {
  if (!metrics.isClosed || metrics.diagonal < SHAPE_CONFIG.minStrokeSpanPx) return null;
  if (corners.length !== 3) return null;

  const [p1, p2, p3] = corners;
  const area = Math.abs((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y)) / 2;
  const boxArea = Math.max(metrics.width * metrics.height, 1);
  if (area / boxArea < 0.12) return null;

  let sumDist = 0;
  const edges = [[p1, p2], [p2, p3], [p3, p1]];

  for (const p of points) {
    let minDist = Infinity;
    for (const [a, b] of edges) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (l2 || 1);
      t = Math.max(0, Math.min(1, t));
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      const d = Math.hypot(p.x - projX, p.y - projY);
      if (d < minDist) minDist = d;
    }
    sumDist += minDist;
  }

  const meanDist = sumDist / points.length;
  const rawError = meanDist / Math.max(metrics.diagonal, 1);

  if (rawError > SHAPE_CONFIG.maxPolygonEdgeError) return null;

  const center = {
    x: (p1.x + p2.x + p3.x) / 3,
    y: (p1.y + p2.y + p3.y) / 3
  };

  return {
    type: 'triangle',
    rawError,
    complexityPenalty: SHAPE_CONFIG.complexityPenalties.triangle,
    normalizedError: rawError + SHAPE_CONFIG.complexityPenalties.triangle,
    passedChecks: true,
    geometry: {
      center,
      vertices: [p1, p2, p3]
    },
    details: `Area: ${Math.round(area)}px², Error: ${(rawError * 100).toFixed(1)}%`
  };
}

/**
 * 5. RECTANGLE & SQUARE CANDIDATE (Circular Mean Modulo 90° & Robust Orientation)
 */
function fitRectangleCandidate(points, metrics, corners) {
  if (!metrics.isClosed || metrics.diagonal < SHAPE_CONFIG.minStrokeSpanPx) return null;

  let quadCorners = null;
  if (corners.length === 4) {
    quadCorners = corners;
  } else if (corners.length === 5) {
    // If 5 corners exist due to a tiny wobble, evaluate 4-corner subsets
    let bestQuad = null;
    let minErr = Infinity;
    for (let skip = 0; skip < 5; skip++) {
      const subset = corners.filter((_, idx) => idx !== skip);
      const test = evaluateRectangleQuad(subset, points, metrics);
      if (test && test.rawError < minErr) {
        minErr = test.rawError;
        bestQuad = test;
      }
    }
    if (bestQuad && bestQuad.rawError <= SHAPE_CONFIG.maxPolygonEdgeError) {
      return bestQuad;
    }
    return null;
  } else {
    return null;
  }

  return evaluateRectangleQuad(quadCorners, points, metrics);
}

function evaluateRectangleQuad(corners, points, metrics) {
  const [c0, c1, c2, c3] = corners;

  // 1. Edge vectors & lengths
  const e0 = { x: c1.x - c0.x, y: c1.y - c0.y, len: Math.hypot(c1.x - c0.x, c1.y - c0.y) };
  const e1 = { x: c2.x - c1.x, y: c2.y - c1.y, len: Math.hypot(c2.x - c1.x, c2.y - c1.y) };
  const e2 = { x: c3.x - c2.x, y: c3.y - c2.y, len: Math.hypot(c3.x - c2.x, c3.y - c2.y) };
  const e3 = { x: c0.x - c3.x, y: c0.y - c3.y, len: Math.hypot(c0.x - c3.x, c0.y - c3.y) };

  if (e0.len < 8 || e1.len < 8 || e2.len < 8 || e3.len < 8) return null;

  const ratio02 = Math.min(e0.len, e2.len) / Math.max(e0.len, e2.len);
  const ratio13 = Math.min(e1.len, e3.len) / Math.max(e1.len, e3.len);
  if (ratio02 < 0.50 || ratio13 < 0.50) return null;

  // Check right angles at corners
  const edges = [e0, e1, e2, e3];
  for (let i = 0; i < 4; i++) {
    const curr = edges[i];
    const next = edges[(i + 1) % 4];
    const dot = (curr.x * next.x + curr.y * next.y) / (curr.len * next.len);
    if (Math.abs(dot) > 0.45) return null;
  }

  // 2. Estimate orientation using Circular Mean Modulo 90° (period pi/2)
  // Maps 4*theta onto unit circle to prevent wrap-boundary artifacts
  let sumSin4 = 0;
  let sumCos4 = 0;
  for (let i = 0; i < 4; i++) {
    const ang = Math.atan2(edges[i].y, edges[i].x);
    sumSin4 += Math.sin(4 * ang);
    sumCos4 += Math.cos(4 * ang);
  }
  const rawRotation = 0.25 * Math.atan2(sumSin4, sumCos4); // within [-pi/4, pi/4]

  // 3. Compute dimensions accurately mapped to horizontal (u) and vertical (v) in rotated frame
  const cosR = Math.cos(rawRotation);
  const sinR = Math.sin(rawRotation);

  const uLengths = [];
  const vLengths = [];

  for (let i = 0; i < 4; i++) {
    const projU = Math.abs(edges[i].x * cosR + edges[i].y * sinR);
    const projV = Math.abs(-edges[i].x * sinR + edges[i].y * cosR);
    if (projU >= projV) {
      uLengths.push(edges[i].len);
    } else {
      vLengths.push(edges[i].len);
    }
  }

  const w = uLengths.length > 0 ? (uLengths.reduce((a, b) => a + b, 0) / uLengths.length) : (e0.len + e2.len) / 2;
  const h = vLengths.length > 0 ? (vLengths.reduce((a, b) => a + b, 0) / vLengths.length) : (e1.len + e3.len) / 2;

  const center = {
    x: (c0.x + c1.x + c2.x + c3.x) / 4,
    y: (c0.y + c1.y + c2.y + c3.y) / 4
  };

  // 4. Test Axis-Aligned (theta = 0) vs Rotated (theta = rawRotation)
  const errorRotated = computeRectangleBoundaryError(points, center, w, h, rawRotation);
  const errorAligned = computeRectangleBoundaryError(points, center, w, h, 0);

  let finalRotation = rawRotation;
  let rawError = errorRotated;
  let isAxisAligned = false;

  // Prefer axis alignment if rotation is tiny (< 2.5 degrees) or if aligned error is comparable
  if (Math.abs(rawRotation) <= SHAPE_CONFIG.axisAlignedSnapAngleRad ||
    (Math.abs(rawRotation) < 0.10 && errorAligned <= errorRotated + SHAPE_CONFIG.axisAlignedErrorTolerance)) {
    finalRotation = 0;
    rawError = errorAligned;
    isAxisAligned = true;
  }

  if (rawError > SHAPE_CONFIG.maxPolygonEdgeError) return null;

  // 5. Square vs Rectangle Decision
  const maxDim = Math.max(w, h);
  const minDim = Math.min(w, h);
  const isSquare = (maxDim - minDim) / maxDim < SHAPE_CONFIG.squareAspectRatioThreshold;

  if (isSquare) {
    const side = (w + h) / 2;
    const penalty = SHAPE_CONFIG.complexityPenalties.square;
    return {
      type: 'square',
      rawError,
      complexityPenalty: penalty,
      normalizedError: rawError + penalty,
      passedChecks: true,
      geometry: {
        center,
        width: side,
        height: side,
        rotation: finalRotation
      },
      details: `Square ${Math.round(side)}px, Rot: ${(finalRotation * 180 / Math.PI).toFixed(1)}° (${isAxisAligned ? 'Axis-Aligned' : 'Rotated'})`
    };
  }

  const penalty = SHAPE_CONFIG.complexityPenalties.rectangle;
  return {
    type: 'rectangle',
    rawError,
    complexityPenalty: penalty,
    normalizedError: rawError + penalty,
    passedChecks: true,
    geometry: {
      center,
      width: w,
      height: h,
      rotation: finalRotation
    },
    details: `Rect ${Math.round(w)}x${Math.round(h)}px, Rot: ${(finalRotation * 180 / Math.PI).toFixed(1)}° (${isAxisAligned ? 'Axis-Aligned' : 'Rotated'})`
  };
}

function computeRectangleBoundaryError(points, center, w, h, rotation) {
  const cosT = Math.cos(rotation);
  const sinT = Math.sin(rotation);
  let sumDist = 0;

  for (let i = 0; i < points.length; i++) {
    const dx = points[i].x - center.x;
    const dy = points[i].y - center.y;
    const u = dx * cosT + dy * sinT;
    const v = -dx * sinT + dy * cosT;

    const du = Math.abs(Math.abs(u) - w / 2);
    const dv = Math.abs(Math.abs(v) - h / 2);
    sumDist += Math.min(du, dv);
  }

  const meanDist = sumDist / points.length;
  return meanDist / Math.max((w + h), 1) * 2;
}

/**
 * 6. REGULAR POLYGON CANDIDATE (5 to 8 sides)
 * Relative side-length threshold relative to expected length (perimeter / k).
 */
function fitRegularPolygonCandidate(points, metrics, corners) {
  if (!metrics.isClosed || metrics.diagonal < SHAPE_CONFIG.minStrokeSpanPx) return null;
  const k = corners.length;
  if (k < 5 || k > 8) return null;

  // 1. Structural Check: Verify side lengths are substantial relative to expected (perim / k)
  let totalPerim = 0;
  const sideLengths = [];
  for (let i = 0; i < k; i++) {
    const next = corners[(i + 1) % k];
    const sl = Math.hypot(next.x - corners[i].x, next.y - corners[i].y);
    sideLengths.push(sl);
    totalPerim += sl;
  }

  const expectedSide = totalPerim / k;
  const minSide = Math.min(...sideLengths);
  const maxSide = Math.max(...sideLengths);

  // Each side must be at least 35% of the expected regular side length
  if (minSide < expectedSide * 0.35) return null;
  if (minSide / maxSide < 0.40) return null;

  // 2. Corner angles check
  const expectedTurn = (Math.PI * 2) / k;
  for (let i = 0; i < k; i++) {
    const prev = corners[(i - 1 + k) % k];
    const curr = corners[i];
    const next = corners[(i + 1) % k];
    const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
    const v2x = next.x - curr.x, v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y), len2 = Math.hypot(v2x, v2y);
    const dot = (v1x * v2x + v1y * v2y) / (len1 * len2 || 1);
    const turn = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (Math.abs(turn - expectedTurn) > 0.50) return null;
  }

  // 3. Radial distance consistency from center
  let sumR = 0;
  const cornerRadii = [];
  const cornerAngles = [];

  for (let i = 0; i < k; i++) {
    const r = Math.hypot(corners[i].x - metrics.centerX, corners[i].y - metrics.centerY);
    const a = Math.atan2(corners[i].y - metrics.centerY, corners[i].x - metrics.centerX);
    cornerRadii.push(r);
    cornerAngles.push(a);
    sumR += r;
  }
  const meanR = sumR / k;
  if (meanR < 12) return null;

  let maxRadialDev = 0;
  for (let i = 0; i < k; i++) {
    const dev = Math.abs(cornerRadii[i] - meanR) / meanR;
    if (dev > maxRadialDev) maxRadialDev = dev;
  }
  if (maxRadialDev > 0.25) return null;

  const penaltyKey = `polygon${k}` in SHAPE_CONFIG.complexityPenalties ? `polygon${k}` : 'polygon8';
  const penalty = SHAPE_CONFIG.complexityPenalties[penaltyKey] || 0.020;

  // 4. Compute geometric distance from all resampled points to regular polygon edges
  const rot = cornerAngles[0];
  const regVertices = [];
  for (let i = 0; i < k; i++) {
    const a = rot + i * expectedTurn;
    regVertices.push({
      x: metrics.centerX + meanR * Math.cos(a),
      y: metrics.centerY + meanR * Math.sin(a)
    });
  }

  let sumEdgeDist = 0;
  for (const p of points) {
    let minDist = Infinity;
    for (let i = 0; i < k; i++) {
      const v1 = regVertices[i];
      const v2 = regVertices[(i + 1) % k];
      const dx = v2.x - v1.x, dy = v2.y - v1.y;
      const l2 = dx * dx + dy * dy;
      let t = ((p.x - v1.x) * dx + (p.y - v1.y) * dy) / (l2 || 1);
      t = Math.max(0, Math.min(1, t));
      const projX = v1.x + t * dx;
      const projY = v1.y + t * dy;
      const d = Math.hypot(p.x - projX, p.y - projY);
      if (d < minDist) minDist = d;
    }
    sumEdgeDist += minDist;
  }

  const meanEdgeDist = sumEdgeDist / points.length;
  const rawError = meanEdgeDist / Math.max(metrics.diagonal, 1);
  if (rawError > SHAPE_CONFIG.maxPolygonEdgeError) return null;

  return {
    type: 'polygon',
    rawError,
    complexityPenalty: penalty,
    normalizedError: rawError + penalty,
    passedChecks: true,
    geometry: {
      center: { x: metrics.centerX, y: metrics.centerY },
      radius: meanR,
      sides: k,
      rotation: rot
    },
    details: `${k}-gon Radius: ${Math.round(meanR)}px, Edge Err: ${(rawError * 100).toFixed(1)}%`
  };
}

/**
 * 7. FIVE-POINT STAR CANDIDATE
 */
function fitStarCandidate(points, metrics, corners) {
  if (!metrics.isClosed || metrics.diagonal < SHAPE_CONFIG.minStrokeSpanPx) return null;
  if (corners.length !== 10) return null;

  const radii = [];
  const angles = [];
  for (const c of corners) {
    const r = Math.hypot(c.x - metrics.centerX, c.y - metrics.centerY);
    const a = Math.atan2(c.y - metrics.centerY, c.x - metrics.centerX);
    radii.push(r);
    angles.push(a);
  }

  const groupA = [radii[0], radii[2], radii[4], radii[6], radii[8]];
  const groupB = [radii[1], radii[3], radii[5], radii[7], radii[9]];

  const meanA = groupA.reduce((s, v) => s + v, 0) / 5;
  const meanB = groupB.reduce((s, v) => s + v, 0) / 5;

  const outerRadius = Math.max(meanA, meanB);
  const innerRadius = Math.min(meanA, meanB);

  if (innerRadius / outerRadius < 0.20 || innerRadius / outerRadius > 0.65) return null;

  const baseAngle = (meanA > meanB) ? angles[0] : angles[1];
  const penalty = SHAPE_CONFIG.complexityPenalties.star;
  const rawError = 0.08;

  return {
    type: 'star',
    rawError,
    complexityPenalty: penalty,
    normalizedError: rawError + penalty,
    passedChecks: true,
    geometry: {
      center: { x: metrics.centerX, y: metrics.centerY },
      outerRadius,
      innerRadius,
      points: 5,
      rotation: baseAngle
    },
    details: `5-Point Star R1: ${Math.round(outerRadius)}px, R2: ${Math.round(innerRadius)}px`
  };
}

/**
 * MASTER SHAPE RECOGNIZER
 */
function recognizeGeometricShape(graphPoints, width, height, graphToCanvas, canvasToGraph) {
  if (!graphPoints || graphPoints.length < 3) return null;

  const pixelPoints = graphPoints.map(pt => graphToCanvas(pt.x, pt.y, width, height));

  // Store raw points export for debug/replay fixtures
  lastRecognitionDebug.rawStrokeExport = graphPoints.map(pt => ({
    x: Number(pt.x.toFixed(4)),
    y: Number(pt.y.toFixed(4))
  }));

  // 1. Clean closing seam overlap and endpoint hold duplicates
  const cleanedSeam = trimClosedSeamOverlap(pixelPoints);

  // 2. Uniform arc-length resampling
  const resampled = resampleStroke(cleanedSeam);
  if (resampled.length < 4) return null;

  // 3. Compute stroke metrics
  const metrics = computeStrokeMetrics(resampled);
  if (metrics.diagonal < SHAPE_CONFIG.minStrokeSpanPx && metrics.pathLength < SHAPE_CONFIG.minStrokeSpanPx) {
    return null;
  }

  const evaluatedCandidates = [];

  // Line candidate
  const lineCand = fitLineCandidate(resampled, metrics);
  if (lineCand) evaluatedCandidates.push(lineCand);

  // Closed shape candidates
  if (metrics.isClosed) {
    const { rawCorners, cleanedCorners } = findCornerPeaks(resampled);

    lastRecognitionDebug.rawCorners = rawCorners;
    lastRecognitionDebug.cleanedCorners = cleanedCorners;

    const starCand = fitStarCandidate(resampled, metrics, cleanedCorners);
    if (starCand) evaluatedCandidates.push(starCand);

    const polyCand = fitRegularPolygonCandidate(resampled, metrics, cleanedCorners);
    if (polyCand) evaluatedCandidates.push(polyCand);

    const triCand = fitTriangleCandidate(resampled, metrics, cleanedCorners);
    if (triCand) evaluatedCandidates.push(triCand);

    const rectCand = fitRectangleCandidate(resampled, metrics, cleanedCorners);
    if (rectCand) evaluatedCandidates.push(rectCand);

    // Circles and ellipses are evaluated independently of corner counts
    const circleCand = fitCircleCandidate(resampled, metrics, cleanedCorners.length);
    if (circleCand) evaluatedCandidates.push(circleCand);

    const ellipseCand = fitEllipseCandidate(resampled, metrics, cleanedCorners.length);
    if (ellipseCand) evaluatedCandidates.push(ellipseCand);
  }

  // Update telemetry
  lastRecognitionDebug.timestamp = Date.now();
  lastRecognitionDebug.strokeMetrics = {
    pointsCount: pixelPoints.length,
    pathLength: Math.round(metrics.pathLength),
    diagonal: Math.round(metrics.diagonal),
    isClosed: metrics.isClosed
  };
  lastRecognitionDebug.candidates = evaluatedCandidates;

  if (evaluatedCandidates.length === 0) {
    lastRecognitionDebug.winner = null;
    lastRecognitionDebug.selectionReason = 'No candidate shape satisfied structural error thresholds. Preserving freehand.';
    return null;
  }

  // Sort candidates by normalized error (lowest error is best)
  evaluatedCandidates.sort((a, b) => a.normalizedError - b.normalizedError);
  const best = evaluatedCandidates[0];

  // Ambiguity check
  if (evaluatedCandidates.length > 1) {
    const runnerUp = evaluatedCandidates[1];
    if (best.type !== runnerUp.type && Math.abs(best.normalizedError - runnerUp.normalizedError) < 0.005) {
      lastRecognitionDebug.winner = null;
      lastRecognitionDebug.selectionReason = `Ambiguous match between ${best.type} (${best.normalizedError.toFixed(3)}) and ${runnerUp.type} (${runnerUp.normalizedError.toFixed(3)}). Preserving freehand.`;
      return null;
    }
  }

  const graphGeometry = convertGeometryToGraph(best.type, best.geometry, width, height, canvasToGraph);

  lastRecognitionDebug.winner = best.type;
  lastRecognitionDebug.selectionReason = `${capitalize(best.type)} selected with normalized score ${best.normalizedError.toFixed(3)} (${best.details || ''}).`;

  return {
    type: best.type,
    geometry: graphGeometry,
    pixelGeometry: best.geometry,
    normalizedError: best.normalizedError
  };
}

/**
 * Converts shape geometry from Canvas pixel space into Mathematical Graph space.
 */
function convertGeometryToGraph(type, geom, width, height, canvasToGraph) {
  switch (type) {
    case 'line':
      return {
        p1: canvasToGraph(geom.p1.x, geom.p1.y, width, height),
        p2: canvasToGraph(geom.p2.x, geom.p2.y, width, height)
      };

    case 'circle':
      return {
        center: canvasToGraph(geom.center.x, geom.center.y, width, height),
        radius: (geom.radius / width) * 20
      };

    case 'ellipse':
      return {
        center: canvasToGraph(geom.center.x, geom.center.y, width, height),
        radiusX: (geom.radiusX / width) * 20,
        radiusY: (geom.radiusY / height) * 20,
        rotation: geom.rotation
      };

    case 'rectangle':
    case 'square':
      return {
        center: canvasToGraph(geom.center.x, geom.center.y, width, height),
        width: (geom.width / width) * 20,
        height: (geom.height / height) * 20,
        rotation: geom.rotation
      };

    case 'triangle':
      return {
        center: canvasToGraph(geom.center.x, geom.center.y, width, height),
        vertices: geom.vertices.map(v => canvasToGraph(v.x, v.y, width, height))
      };

    case 'polygon':
      return {
        center: canvasToGraph(geom.center.x, geom.center.y, width, height),
        radius: (geom.radius / width) * 20,
        sides: geom.sides,
        rotation: geom.rotation
      };

    case 'star':
      return {
        center: canvasToGraph(geom.center.x, geom.center.y, width, height),
        outerRadius: (geom.outerRadius / width) * 20,
        innerRadius: (geom.innerRadius / width) * 20,
        points: 5,
        rotation: geom.rotation
      };

    default:
      return geom;
  }
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SHAPE_CONFIG,
    lastRecognitionDebug,
    resampleStroke,
    trimClosedSeamOverlap,
    computeStrokeMetrics,
    findCornerPeaks,
    cleanPolygonCorners,
    checkAngularSectorCoverage,
    fitLineCandidate,
    fitCircleCandidate,
    fitEllipseCandidate,
    fitTriangleCandidate,
    fitRectangleCandidate,
    fitRegularPolygonCandidate,
    fitStarCandidate,
    recognizeGeometricShape,
    convertGeometryToGraph
  };
}

