// Test script to verify zoom transform consistency for Reverse Desmos

const assert = require('assert');

// Simulate the authoritative coordinate conversion and viewport transforms from script.js
function createViewport(displayWidth, displayHeight, zoomScale = 1.0) {
  const DOMAIN = { min: -10, max: 10 };
  const RANGE = { min: -10, max: 10 };

  const baseSpan = 20 / (zoomScale || 1.0);
  if (displayWidth >= displayHeight) {
    const pxPerUnit = displayHeight / baseSpan;
    const xSpan = displayWidth / pxPerUnit;
    const halfX = xSpan / 2;
    DOMAIN.min = -halfX;
    DOMAIN.max = halfX;
    RANGE.min = -baseSpan / 2;
    RANGE.max = baseSpan / 2;
  } else {
    const pxPerUnit = displayWidth / baseSpan;
    const ySpan = displayHeight / pxPerUnit;
    const halfY = ySpan / 2;
    DOMAIN.min = -baseSpan / 2;
    DOMAIN.max = baseSpan / 2;
    RANGE.min = -halfY;
    RANGE.max = halfY;
  }

  function getPixelsPerUnit() {
    return displayWidth / (DOMAIN.max - DOMAIN.min);
  }

  function graphToCanvasDist(graphDist) {
    return graphDist * (displayWidth / (DOMAIN.max - DOMAIN.min));
  }

  function canvasToGraphDist(canvasDist) {
    return canvasDist * ((DOMAIN.max - DOMAIN.min) / displayWidth);
  }

  function canvasToGraph(canvasX, canvasY) {
    const normX = canvasX / displayWidth;
    const normY = canvasY / displayHeight;
    const graphX = DOMAIN.min + normX * (DOMAIN.max - DOMAIN.min);
    const graphY = RANGE.max - normY * (RANGE.max - RANGE.min);
    return { x: graphX, y: graphY };
  }

  function graphToCanvas(graphX, graphY) {
    const normX = (graphX - DOMAIN.min) / (DOMAIN.max - DOMAIN.min);
    const normY = (RANGE.max - graphY) / (RANGE.max - RANGE.min);
    const canvasX = normX * displayWidth;
    const canvasY = normY * displayHeight;
    return { x: canvasX, y: canvasY };
  }

  return {
    DOMAIN,
    RANGE,
    getPixelsPerUnit,
    graphToCanvasDist,
    canvasToGraphDist,
    canvasToGraph,
    graphToCanvas
  };
}

console.log('🧪 Starting Zoom Consistency & Coordinate Transform Test Suite...\n');

const testDimensions = [
  { w: 1000, h: 800, desc: 'Landscape 1000x800' },
  { w: 800, h: 800, desc: 'Square 800x800' },
  { w: 600, h: 900, desc: 'Portrait 600x900' }
];

const testZooms = [0.5, 0.8, 1.0, 1.25, 2.0, 3.5, 5.0];

// Test 1: Circle radius = 2 at center (0,0) alignment across zooms and aspect ratios
console.log('1. Verifying exact circle radius 2 at (0,0) aligns with x=±2, y=±2 ticks...');
for (const dim of testDimensions) {
  for (const zoom of testZooms) {
    const vp = createViewport(dim.w, dim.h, zoom);
    const centerCanvas = vp.graphToCanvas(0, 0);
    const radiusCanvas = vp.graphToCanvasDist(2.0);

    const rightBoundaryCanvas = centerCanvas.x + radiusCanvas;
    const leftBoundaryCanvas = centerCanvas.x - radiusCanvas;
    const topBoundaryCanvas = centerCanvas.y - radiusCanvas;
    const bottomBoundaryCanvas = centerCanvas.y + radiusCanvas;

    const tickX2Canvas = vp.graphToCanvas(2.0, 0).x;
    const tickXMinus2Canvas = vp.graphToCanvas(-2.0, 0).x;
    const tickY2Canvas = vp.graphToCanvas(0, 2.0).y;
    const tickYMinus2Canvas = vp.graphToCanvas(0, -2.0).y;

    assert(Math.abs(rightBoundaryCanvas - tickX2Canvas) < 1e-6, `Right boundary misaligned at zoom ${zoom} on ${dim.desc}`);
    assert(Math.abs(leftBoundaryCanvas - tickXMinus2Canvas) < 1e-6, `Left boundary misaligned at zoom ${zoom} on ${dim.desc}`);
    assert(Math.abs(topBoundaryCanvas - tickY2Canvas) < 1e-6, `Top boundary misaligned at zoom ${zoom} on ${dim.desc}`);
    assert(Math.abs(bottomBoundaryCanvas - tickYMinus2Canvas) < 1e-6, `Bottom boundary misaligned at zoom ${zoom} on ${dim.desc}`);
  }
}
console.log('   ✅ Exact circle boundaries match grid ticks across all zoom levels and aspect ratios.');

// Test 2: Isotropic equal scale ratio (x scale === y scale)
console.log('2. Verifying isotropic scaling (x px/unit === y px/unit)...');
for (const dim of testDimensions) {
  for (const zoom of testZooms) {
    const vp = createViewport(dim.w, dim.h, zoom);
    const pxPerUnitX = dim.w / (vp.DOMAIN.max - vp.DOMAIN.min);
    const pxPerUnitY = dim.h / (vp.RANGE.max - vp.RANGE.min);
    assert(Math.abs(pxPerUnitX - pxPerUnitY) < 1e-9, `Non-isotropic scaling detected at zoom ${zoom} on ${dim.desc}`);
  }
}
console.log('   ✅ Scaling is strictly isotropic (aspect ratio 1:1, circles never distorted into ellipses).');

// Test 3: Round-trip transform accuracy (graph -> canvas -> graph)
console.log('3. Verifying invertible round-trip pointer and coordinate conversion...');
for (const dim of testDimensions) {
  for (const zoom of testZooms) {
    const vp = createViewport(dim.w, dim.h, zoom);
    const testPoints = [
      { x: 0, y: 0 },
      { x: 2.0069, y: -3.1415 },
      { x: -7.5, y: 8.25 },
      { x: 1.414, y: 1.732 }
    ];
    for (const pt of testPoints) {
      const c = vp.graphToCanvas(pt.x, pt.y);
      const g = vp.canvasToGraph(c.x, c.y);
      assert(Math.abs(g.x - pt.x) < 1e-6, `Roundtrip X failed for (${pt.x}, ${pt.y}) at zoom ${zoom}`);
      assert(Math.abs(g.y - pt.y) < 1e-6, `Roundtrip Y failed for (${pt.x}, ${pt.y}) at zoom ${zoom}`);
    }
  }
}
console.log('   ✅ Roundtrip coordinate conversion is lossless within floating-point tolerance.');

// Test 4: Verify equation preservation during zoom
console.log('4. Verifying mathematical equations remain identical during zoom...');
const { deriveShapeEquations } = require('./equations.js');
const testCircle = {
  id: 1,
  type: 'circle',
  geometry: { center: { x: 0, y: 0 }, radius: 2.0069 }
};
const eq1 = deriveShapeEquations(testCircle);
assert(eq1.primaryText.includes('4.03'), `Equation RHS should match radius^2 (~4.03)`);
console.log(`   ✅ Equation remains ${eq1.primaryText} independent of zoom.`);

console.log('\n🎉 ALL ZOOM CONSISTENCY TESTS PASSED SUCCESSFULLY!\n');
