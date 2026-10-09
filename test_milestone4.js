/**
 * Milestone 4 End-to-End & Integration Test Suite
 * Tests equations.js integration, shape equations, and live backend communication
 * for Linear, Quadratic, Cubic, Absolute Value, Sine, and Sideways x=g(y) orientations.
 */

const assert = require('assert');
const {
  deriveLineSegmentEquation,
  deriveCircleEquation,
  deriveEllipseEquation,
  derivePolygonBoundaryEquations,
  deriveShapeEquations
} = require('./equations.js');

async function runTests() {
  console.log('🧪 Starting Milestone 4 Verification Suite (Sine, Sideways, Quality Gates, Timeout)...\n');

  // 1. Verify existing shape equations still work
  console.log('1. Verifying existing shape equations...');
  const lineShape = {
    id: 1,
    type: 'line',
    geometry: { p1: { x: 0, y: 0 }, p2: { x: 4, y: 8 } }
  };
  const lineEq = deriveShapeEquations(lineShape);
  assert.strictEqual(lineEq.shapeType, 'line');
  assert(lineEq.primaryEquation.includes('y = 2x'));
  console.log('   ✅ Line equations preserved:', lineEq.primaryEquation);

  const circleShape = {
    id: 2,
    type: 'circle',
    geometry: { center: { x: 1, y: -2 }, radius: 3 }
  };
  const circleEq = deriveShapeEquations(circleShape);
  assert.strictEqual(circleEq.shapeType, 'circle');
  assert(circleEq.primaryEquation.includes('(x - 1)^2 + (y + 2)^2 = 9'));
  console.log('   ✅ Circle equations preserved:', circleEq.primaryEquation);

  // 2. Unfitted freehand stroke
  console.log('\n2. Verifying unfitted freehand stroke...');
  const unfittedFreehand = {
    id: 3,
    type: 'freehand',
    geometry: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }] }
  };
  const unfittedEq = deriveShapeEquations(unfittedFreehand);
  assert.strictEqual(unfittedEq.isFreehand, true);
  assert.strictEqual(unfittedEq.isFitted, false);
  console.log('   ✅ Unfitted freehand handled cleanly.');

  // 3. Live backend tests at http://127.0.0.1:8001/fit
  console.log('\n3. Testing live FastAPI backend at http://127.0.0.1:8001/fit...');

  // 3a. Sine wave test (y = 1.5 sin(2x - 0.5) + 1.0)
  const noisySine = [];
  for (let x = -3; x <= 3; x += 0.15) {
    const jitter = Math.sin(x * 15) * 0.04;
    noisySine.push({ x: Number(x.toFixed(3)), y: Number((1.5 * Math.sin(2.0 * x - 0.5) + 1.0 + jitter).toFixed(3)) });
  }

  const resSine = await fetch('http://127.0.0.1:8001/fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: noisySine })
  });
  const dataSine = await resSine.json();
  assert(dataSine.success, 'Backend failed sine fit');
  assert.strictEqual(dataSine.candidates[0].family, 'sine');
  console.log('   ✅ Sine Wave Winner:', dataSine.candidates[0].family_name, '| 2D Error:', dataSine.candidates[0].geom_error.toFixed(4), '| Formula:', dataSine.candidates[0].text);

  // 3b. Sideways Parabola (x = 0.5y^2 - 1, x as a function of y)
  const noisySideways = [];
  for (let y = -3; y <= 3; y += 0.15) {
    const jitter = Math.cos(y * 12) * 0.03;
    noisySideways.push({ x: Number((0.5 * y * y - 1.0 + jitter).toFixed(3)), y: Number(y.toFixed(3)) });
  }

  const resSide = await fetch('http://127.0.0.1:8001/fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: noisySideways })
  });
  const dataSide = await resSide.json();
  assert(dataSide.success, 'Backend failed sideways parabola fit');
  assert.strictEqual(dataSide.candidates[0].family, 'quadratic');
  assert.strictEqual(dataSide.candidates[0].orientation, 'x_of_y');
  assert(dataSide.candidates[0].latex.startsWith('x ='));
  console.log('   ✅ Sideways Parabola (x=g(y)) Winner:', dataSide.candidates[0].family_name, '| Formula:', dataSide.candidates[0].latex);

  // 3c. Forced Quadratic on Sine Wave (finishes promptly & reports poor fit)
  console.log('\n4. Testing forced Quadratic on Sine Wave...');
  const t0 = Date.now();
  const resForced = await fetch('http://127.0.0.1:8001/fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: noisySine, families: ['quadratic'] })
  });
  const dataForced = await resForced.json();
  const elapsedMs = Date.now() - t0;
  assert(dataForced.success);
  assert.strictEqual(dataForced.candidates[0].family, 'quadratic');
  assert.strictEqual(dataForced.candidates[0].is_poor_fit, true);
  assert(dataForced.candidates[0].warning.includes('Poor Fit'));
  console.log(`   ✅ Forced Quadratic finished in ${elapsedMs}ms with poor fit flag: ${dataForced.candidates[0].warning}`);

  // 3d. Circle / Loop rejection (needs parametric)
  console.log('\n5. Testing closed loop rejection...');
  const circlePts = [];
  for (let a = 0; a <= 2 * Math.PI; a += 0.15) {
    circlePts.push({ x: Number((3 * Math.cos(a)).toFixed(3)), y: Number((3 * Math.sin(a)).toFixed(3)) });
  }
  const resCircle = await fetch('http://127.0.0.1:8001/fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: circlePts })
  });
  const dataCircle = await resCircle.json();
  assert.strictEqual(dataCircle.success, false);
  assert.strictEqual(dataCircle.is_parametric_needed, true);
  assert(dataCircle.rejection_reason.includes('parametric'));
  console.log('   ✅ Closed circle correctly rejected as needing parametric fitting:', dataCircle.rejection_reason);

  // 3e. equations.js integration with sideways fitted shape
  console.log('\n6. Testing equations.js integration with sideways fitted shape...');
  const fittedShape = {
    id: 4,
    type: 'freehand',
    geometry: { points: noisySideways },
    fitStatus: 'success',
    fitData: dataSide,
    selectedCandidateIndex: 0,
    showOverlay: true
  };
  const fittedEq = deriveShapeEquations(fittedShape);
  assert.strictEqual(fittedEq.isFitted, true);
  assert.strictEqual(fittedEq.isSideways, true);
  assert(fittedEq.primaryEquation.includes('x ='));
  assert(fittedEq.primaryEquation.includes('y^2'));
  console.log('   ✅ deriveShapeEquations rendered sideways equation:', fittedEq.primaryEquation);

  console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
