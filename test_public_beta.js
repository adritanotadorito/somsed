/**
 * Somsed - Public Beta Verification Suite
 * Tests analytics configuration, event sanitization, privacy guarantees,
 * error categories, backend connectivity, and script syntax.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runBetaTests() {
  console.log('🧪 Starting Somsed Public Beta Verification Suite...\n');

  // 1. Check config.js and analytics.js existence & syntax
  console.log('1. Checking config.js & analytics.js existence...');
  const configPath = path.join(__dirname, 'config.js');
  const analyticsPath = path.join(__dirname, 'analytics.js');
  assert(fs.existsSync(configPath), 'config.js must exist');
  assert(fs.existsSync(analyticsPath), 'analytics.js must exist');
  const configCode = fs.readFileSync(configPath, 'utf8');
  const analyticsCode = fs.readFileSync(analyticsPath, 'utf8');
  assert(configCode.includes('POSTHOG_KEY'), 'config.js must define POSTHOG_KEY');
  assert(configCode.includes('BACKEND_URL'), 'config.js must define BACKEND_URL');
  assert(analyticsCode.includes('autocapture: false'), 'analytics.js must disable autocapture');
  assert(analyticsCode.includes('disable_session_recording: true'), 'analytics.js must disable session recording');
  console.log('   ✅ config.js and analytics.js verified with privacy-first settings.');

  // 2. Mock browser environment to test SomsedAnalytics module
  console.log('\n2. Testing SomsedAnalytics event tracking & property sanitization...');
  const capturedEvents = [];
  global.window = {
    location: { hostname: 'localhost', protocol: 'http:' },
    SOMSED_CONFIG: {
      POSTHOG_KEY: 'phc_test_key_12345',
      POSTHOG_HOST: 'https://us.i.posthog.com',
      DEV_ANALYTICS: true // Enable for test harness
    },
    posthog: {
      init: () => {},
      capture: (event, properties) => {
        capturedEvents.push({ event, properties });
      }
    }
  };

  // Evaluate analytics.js in mock window context
  eval(analyticsCode);

  assert(window.SomsedAnalytics, 'SomsedAnalytics must be defined on window');
  assert(typeof window.SomsedAnalytics.trackEvent === 'function', 'trackEvent must be a function');

  // Test explicit events
  window.SomsedAnalytics.trackDrawingCompleted('freehand');
  window.SomsedAnalytics.trackShapeRecognized('circle');
  window.SomsedAnalytics.trackFitSucceeded('sine', 'y_of_x');
  window.SomsedAnalytics.trackFitFailed('timeout');
  window.SomsedAnalytics.trackEditApplied('curve_quadratic');
  window.SomsedAnalytics.trackEquationCopied('latex', 'circle');

  assert.strictEqual(capturedEvents.length, 6, 'All 6 events should be captured');
  assert.strictEqual(capturedEvents[0].event, 'drawing_completed');
  assert.strictEqual(capturedEvents[0].properties.stroke_type, 'freehand');
  assert.strictEqual(capturedEvents[1].event, 'shape_recognized');
  assert.strictEqual(capturedEvents[1].properties.shape_type, 'circle');
  assert.strictEqual(capturedEvents[2].event, 'fit_succeeded');
  assert.strictEqual(capturedEvents[2].properties.model_family, 'sine');
  assert.strictEqual(capturedEvents[2].properties.orientation, 'y_of_x');
  assert.strictEqual(capturedEvents[3].event, 'fit_failed');
  assert.strictEqual(capturedEvents[3].properties.error_category, 'timeout');
  assert.strictEqual(capturedEvents[4].event, 'edit_applied');
  assert.strictEqual(capturedEvents[4].properties.object_type, 'curve_quadratic');
  assert.strictEqual(capturedEvents[5].event, 'equation_copied');
  assert.strictEqual(capturedEvents[5].properties.format, 'latex');
  assert.strictEqual(capturedEvents[5].properties.shape_type, 'circle');
  console.log('   ✅ All 6 explicit events correctly tracked with sanitized metadata.');

  // Test privacy: Ensure raw coordinates and complex objects are stripped
  console.log('\n3. Testing privacy guard against coordinate/content leakage...');
  window.SomsedAnalytics.trackEvent('test_leak', {
    safe_prop: 'allowed',
    raw_points: [{ x: 10, y: 20 }, { x: 30, y: 40 }], // MUST BE STRIPPED
    equation_text: 'y = 2x + 1' // Primitive string allowed, but no raw objects
  });
  const leakCheck = capturedEvents[capturedEvents.length - 1];
  assert.strictEqual(leakCheck.properties.safe_prop, 'allowed');
  assert.strictEqual(leakCheck.properties.raw_points, undefined, 'Raw point arrays must never be transmitted');
  console.log('   ✅ Privacy protection verified: Non-primitive data objects are excluded.');

  // 4. Test dev mode bypass (DEV_ANALYTICS: false on localhost)
  console.log('\n4. Testing local development analytics bypass...');
  window.SOMSED_CONFIG.DEV_ANALYTICS = false;
  const countBefore = capturedEvents.length;
  window.SomsedAnalytics.trackEvent('dev_action', { test: true });
  assert.strictEqual(capturedEvents.length, countBefore, 'Localhost events must be suppressed when DEV_ANALYTICS is false');
  console.log('   ✅ Localhost activity suppressed by default to protect production analytics.');

  // 5. Test Live FastAPI Backend health and CORS endpoints
  console.log('\n5. Testing Live FastAPI Backend connectivity...');
  try {
    const healthRes = await fetch('http://127.0.0.1:8001/health');
    assert(healthRes.ok, 'Backend /health returned non-200');
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok');
    console.log('   ✅ Backend is running and healthy at http://127.0.0.1:8001/health:', healthData);

    // Test /fit with parabolic points
    const fitRes = await fetch('http://127.0.0.1:8001/fit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{ x: -2, y: 4 }, { x: -1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }]
      })
    });
    assert(fitRes.ok, 'Backend /fit returned non-200');
    const fitData = await fitRes.json();
    assert.strictEqual(fitData.success, true);
    assert.strictEqual(fitData.best_family, 'quadratic');
    console.log('   ✅ Backend /fit endpoint successfully fit quadratic curve:', fitData.candidates[0].family_name);
  } catch (err) {
    console.error('   ❌ Backend connection error:', err.message);
    throw err;
  }

  // 6. Check index.html script inclusion order
  console.log('\n6. Checking index.html script dependencies...');
  const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert(htmlContent.includes('<script src="config.js"></script>'), 'index.html must load config.js');
  assert(htmlContent.includes('<script src="analytics.js"></script>'), 'index.html must load analytics.js');
  const posConfig = htmlContent.indexOf('config.js');
  const posAnalytics = htmlContent.indexOf('analytics.js');
  const posScript = htmlContent.indexOf('script.js');
  assert(posConfig < posAnalytics, 'config.js must load before analytics.js');
  assert(posAnalytics < posScript, 'analytics.js must load before script.js');
  console.log('   ✅ HTML script tag order is optimal: config.js -> analytics.js -> script.js.');

  console.log('\n🎉 ALL PUBLIC BETA VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

runBetaTests();
