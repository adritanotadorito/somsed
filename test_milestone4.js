/**
 * Milestone 4 End-to-End & Integration Test Suite
 * Tests equations.js integration, shape equations, and live backend communication.
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
  console.log('🧪 Starting Milestone 4 Verification Suite...\n');

  // Test 1: Verify existing shape equations still work
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

  // Test 2: Unfitted freehand stroke
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

  // Test 3: Live backend POST /fit tests
  console.log('\n3. Testing live FastAPI backend at http://127.0.0.1:8001/fit...');

  // 3a. Quadratic parabola test
  const noisyParabola = [];
  for (let x = -3; x <= 3; x += 0.2) {
    const jitter = (Math.sin(x * 10) * 0.05);
    noisyParabola.push({ x: Number(x.toFixed(3)), y: Number((0.5 * x * x - 2 * x + 1 + jitter).toFixed(3)) });
  }

  const resQuad = await fetch('http://127.0.0.1:8001/fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: noisyParabola,
      allowed_families: ['linear', 'quadratic', 'cubic', 'absolute_value']
    })
  });
  const dataQuad = await resQuad.json();
  assert(dataQuad.success, 'Backend failed quadratic fit');
  assert.strictEqual(dataQuad.candidates[0].family, 'quadratic');
  console.log('   ✅ Noisy Parabola winner:', dataQuad.candidates[0].family_name, '| RMSE:', dataQuad.candidates[0].rmse.toFixed(4), '| Formula:', dataQuad.candidates[0].text);

  // 3b. Absolute value test
  const noisyAbs = [];
  for (let x = -2; x <= 6; x += 0.2) {
    const jitter = (Math.cos(x * 7) * 0.04);
    noisyAbs.push({ x: Number(x.toFixed(3)), y: Number((1.5 * Math.abs(x - 2) - 3 + jitter).toFixed(3)) });
  }
  const resAbs = await fetch('http://127.0.0.1:8001/fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: noisyAbs })
  });
  const dataAbs = await resAbs.json();
  assert(dataAbs.success, 'Backend failed absolute value fit');
  assert.strictEqual(dataAbs.candidates[0].family, 'absolute_value');
  console.log('   ✅ Noisy Absolute Value winner:', dataAbs.candidates[0].family_name, '| RMSE:', dataAbs.candidates[0].rmse.toFixed(4), '| Formula:', dataAbs.candidates[0].text);

  // 3c. Fitted Freehand integration with deriveShapeEquations
  console.log('\n4. Testing fitted freehand integration with equations.js...');
  const fittedShape = {
    id: 4,
    type: 'freehand',
    geometry: { points: noisyParabola },
    fitStatus: 'success',
    fitData: dataQuad,
    selectedCandidateIndex: 0,
    showOverlay: true
  };
  const fittedEq = deriveShapeEquations(fittedShape);
  assert.strictEqual(fittedEq.isFitted, true);
  assert.strictEqual(fittedEq.familyName, 'Quadratic');
  assert(fittedEq.primaryEquation.includes('x^2'));
  console.log('   ✅ deriveShapeEquations successfully rendered candidate 0:', fittedEq.primaryEquation);

  // Switching candidate index
  fittedShape.selectedCandidateIndex = 1;
  const switchedEq = deriveShapeEquations(fittedShape);
  console.log('   ✅ Switched to candidate 1:', switchedEq.familyName, '| Formula:', switchedEq.primaryEquation);

  // 3d. Rejection test: Circle / loop
  console.log('\n5. Testing rejection of closed loop / circle...');
  const circlePts = [];
  for (let a = 0; a <= 2 * Math.PI; a += 0.2) {
    circlePts.push({ x: Number((3 * Math.cos(a)).toFixed(3)), y: Number((3 * Math.sin(a)).toFixed(3)) });
  }
  const resCircle = await fetch('http://127.0.0.1:8001/fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: circlePts })
  });
  const dataCircle = await resCircle.json();
  assert.strictEqual(dataCircle.success, false);
  console.log('   ✅ Circle correctly rejected:', dataCircle.rejection_reason);

  // 3e. Rejection test: Vertical line
  console.log('\n6. Testing rejection of vertical stroke...');
  const verticalPts = [];
  for (let y = -4; y <= 4; y += 0.5) {
    verticalPts.push({ x: 2.0, y: Number(y.toFixed(2)) });
  }
  const resVert = await fetch('http://127.0.0.1:8001/fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: verticalPts })
  });
  const dataVert = await resVert.json();
  assert.strictEqual(dataVert.success, false);
  console.log('   ✅ Vertical stroke correctly rejected:', dataVert.rejection_reason);

  console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
