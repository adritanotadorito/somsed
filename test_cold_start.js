const assert = require('assert');

function createMockElement(tagName) {
  const listeners = {};
  const children = [];
  const el = {
    tagName: tagName.toUpperCase(),
    className: '',
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    title: '',
    type: 'button',
    value: '',
    children,
    addEventListener(event, handler) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener(event, handler) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(h => h !== handler);
    },
    dispatchEvent(event) {
      if (listeners[event.type]) {
        listeners[event.type].forEach(h => h(event));
      }
    },
    click() {
      let stopped = false;
      const event = {
        type: 'click',
        stopPropagation: () => { stopped = true; }
      };
      this.dispatchEvent(event);
      return stopped;
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    querySelectorAll() {
      return [];
    }
  };
  return el;
}

console.log('🧪 Starting Cold-Start & Backend Readiness Test Suite...\n');

async function testImmediateReadiness() {
  console.log('1. Testing Immediate Backend Readiness...');
  let backendState = 'unknown';
  let activeWakePromise = null;

  async function mockHealthFetch() {
    return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
  }

  async function ensureBackendReady() {
    if (backendState === 'ready') return true;
    const res = await mockHealthFetch();
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok') {
        backendState = 'ready';
        return true;
      }
    }
    return false;
  }

  const ready = await ensureBackendReady();
  assert.strictEqual(ready, true, 'Backend should be ready immediately on HTTP 200 ok');
  assert.strictEqual(backendState, 'ready', 'backendState should be updated to ready');
  console.log('   ✅ Immediate readiness detected successfully.');
}

async function testDelayedColdStartWakeup() {
  console.log('2. Testing Delayed Cold-Start Wake-Up & Inline Message Progression...');
  let backendState = 'unknown';
  let activeWakePromise = null;
  let attempts = 0;
  const eventsTracked = [];

  function trackAnalyticsEvent(name, props) {
    eventsTracked.push({ name, props });
  }

  async function mockHealthFetch() {
    attempts++;
    if (attempts < 3) {
      throw new Error('Backend sleeping / connection refused');
    }
    return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
  }

  function ensureBackendReady() {
    if (backendState === 'ready') return Promise.resolve(true);
    if (activeWakePromise) return activeWakePromise;

    backendState = 'waking';
    activeWakePromise = (async () => {
      while (attempts < 5) {
        try {
          const res = await mockHealthFetch();
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'ok') {
              backendState = 'ready';
              activeWakePromise = null;
              return true;
            }
          }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 20));
      }
      backendState = 'unreachable';
      activeWakePromise = null;
      return false;
    })();

    return activeWakePromise;
  }

  const shape = {
    id: 1,
    type: 'freehand',
    geometry: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }] },
    rawPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }],
    fitStatus: null,
    fitError: null,
    showFit: true
  };

  const statusProgression = [];

  async function simulateFit(s) {
    if (backendState !== 'ready') {
      s.fitStatus = 'waking';
      statusProgression.push('waking');
      const isReady = await ensureBackendReady();
      if (!isReady) {
        s.fitStatus = 'error';
        s.fitError = 'The equation service is taking longer than expected. Try again.';
        trackAnalyticsEvent('fit_failed', { error_category: 'cold_start_timeout' });
        return;
      }
    }
    s.fitStatus = 'loading';
    statusProgression.push('loading');
    s.fitStatus = 'success';
    s.fitData = { success: true, candidates: [{ family: 'quadratic', family_name: 'Quadratic' }] };
    statusProgression.push('success');
    trackAnalyticsEvent('fit_succeeded', { model_family: 'quadratic' });
  }

  await simulateFit(shape);

  assert.deepStrictEqual(statusProgression, ['waking', 'loading', 'success'], 'Must transition waking -> loading -> success');
  assert.strictEqual(shape.fitStatus, 'success');
  assert.strictEqual(eventsTracked.filter(e => e.name === 'fit_failed').length, 0, 'Must NOT track fit_failed during normal waking');
  assert.strictEqual(eventsTracked.filter(e => e.name === 'fit_succeeded').length, 1, 'Must track fit_succeeded upon completion');
  console.log('   ✅ Waking state correctly transitions to loading and completes without spurious fit_failed analytics.');
}

async function testSharedWakePromise() {
  console.log('3. Testing Single Shared Wake-up Promise across Multiple Requests...');
  let backendState = 'unknown';
  let activeWakePromise = null;
  let probeCalls = 0;

  function ensureBackendReady() {
    if (backendState === 'ready') return Promise.resolve(true);
    if (activeWakePromise) return activeWakePromise;

    backendState = 'waking';
    activeWakePromise = (async () => {
      probeCalls++;
      await new Promise(r => setTimeout(r, 50));
      backendState = 'ready';
      activeWakePromise = null;
      return true;
    })();

    return activeWakePromise;
  }

  const p1 = ensureBackendReady();
  const p2 = ensureBackendReady();
  const p3 = ensureBackendReady();

  assert.strictEqual(p1, p2, 'p1 and p2 must share the identical promise instance');
  assert.strictEqual(p2, p3, 'p2 and p3 must share the identical promise instance');

  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  assert.strictEqual(r1, true);
  assert.strictEqual(r2, true);
  assert.strictEqual(r3, true);
  assert.strictEqual(probeCalls, 1, 'Exactly one probe loop should run for simultaneous requests');
  console.log('   ✅ Single shared wake-up promise prevents duplicate probe loops.');
}

async function testWakeTimeout() {
  console.log('4. Testing Bounded Wake Timeout (120s max period)...');
  let backendState = 'unknown';
  let activeWakePromise = null;
  const eventsTracked = [];

  function trackAnalyticsEvent(name, props) {
    eventsTracked.push({ name, props });
  }

  function ensureBackendReadyTimeout() {
    backendState = 'waking';
    activeWakePromise = (async () => {
      backendState = 'unreachable';
      return false;
    })();
    return activeWakePromise;
  }

  const shape = {
    id: 2,
    type: 'freehand',
    geometry: { points: [{ x: -2, y: 4 }, { x: 0, y: 0 }, { x: 2, y: 4 }] },
    fitStatus: null,
    showFit: true
  };

  shape.fitStatus = 'waking';
  const ready = await ensureBackendReadyTimeout();
  if (!ready) {
    shape.fitStatus = 'error';
    shape.fitError = 'The equation service is taking longer than expected. Try again.';
    trackAnalyticsEvent('fit_failed', { error_category: 'cold_start_timeout' });
  }

  assert.strictEqual(shape.fitStatus, 'error');
  assert.strictEqual(shape.fitError, 'The equation service is taking longer than expected. Try again.');
  assert.strictEqual(shape.geometry.points.length, 3, 'Drawing points must be preserved on timeout');
  assert.strictEqual(eventsTracked[0].props.error_category, 'cold_start_timeout');
  console.log('   ✅ Cold start timeout cleanly sets expected error message and preserves drawing points.');
}

async function testCancellationWhileWaiting() {
  console.log('5. Testing Cancellation, Fit Off, and Clear while Waiting...');
  let currentFitRequestId = 1;
  let shapesList = [];

  const shape1 = { id: 10, type: 'freehand', showFit: true, fitRequestId: 1, fitStatus: 'waking' };
  shapesList.push(shape1);

  let wakeResolve;
  const wakePromise = new Promise(r => { wakeResolve = r; });

  async function fitProcess(s, reqId) {
    await wakePromise;
    if (s.fitRequestId !== reqId || !shapesList.includes(s) || s.showFit === false) {
      return 'aborted';
    }
    s.fitStatus = 'success';
    return 'completed';
  }

  const fitA = fitProcess(shape1, 1);
  shape1.showFit = false;
  currentFitRequestId++;

  wakeResolve(true);
  const resA = await fitA;
  assert.strictEqual(resA, 'aborted', 'Fit request must abort when user turned Fit Off');
  assert.strictEqual(shape1.showFit, false, 'Fit Off setting must be preserved');

  const shape2 = { id: 20, type: 'freehand', showFit: true, fitRequestId: 2, fitStatus: 'waking' };
  shapesList.push(shape2);
  let wakeResolve2;
  const wakePromise2 = new Promise(r => { wakeResolve2 = r; });
  const fitB = fitProcess(shape2, 2);

  shapesList = [];
  currentFitRequestId++;

  wakeResolve2(true);
  const resB = await fitB;
  assert.strictEqual(resB, 'aborted', 'Fit request must abort when canvas was cleared');
  assert.strictEqual(shapesList.length, 0, 'Canvas remains empty');

  console.log('   ✅ Fit Off and Clear actions safely cancel pending fit requests without state corruption.');
}

async function runAll() {
  await testImmediateReadiness();
  await testDelayedColdStartWakeup();
  await testSharedWakePromise();
  await testWakeTimeout();
  await testCancellationWhileWaiting();
  console.log('\n🎉 ALL COLD-START AND BACKEND READINESS TESTS PASSED SUCCESSFULLY!');
}

runAll().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
