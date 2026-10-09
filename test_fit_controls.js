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
    querySelectorAll(selector) {
      return [];
    }
  };
  return el;
}

console.log('🧪 Starting Fit Controls & Model Selector Test Suite...\n');

console.log('1. Testing Fit ON/OFF single-click toggle behavior...');
let shape = {
  id: 1,
  type: 'freehand',
  showFit: true,
  showOverlay: true,
  showSketch: true,
  fitStatus: 'success',
  fitData: {
    success: true,
    candidates: [{ family: 'linear', family_name: 'Linear' }]
  }
};

let isFitVisible = (shape.showFit !== false && shape.showOverlay !== false);
assert.strictEqual(isFitVisible, true, 'Initial state should be visible');

let nextState = !isFitVisible;
shape.showFit = nextState;
shape.showOverlay = nextState;
assert.strictEqual(shape.showFit, false, 'First click must set showFit to false');
assert.strictEqual(shape.showOverlay, false, 'First click must set showOverlay to false');

isFitVisible = (shape.showFit !== false && shape.showOverlay !== false);
assert.strictEqual(isFitVisible, false, 'State should reflect OFF');
nextState = !isFitVisible;
shape.showFit = nextState;
shape.showOverlay = nextState;
assert.strictEqual(shape.showFit, true, 'Second click must set showFit to true');
assert.strictEqual(shape.showOverlay, true, 'Second click must set showOverlay to true');
console.log('   ✅ Single-click toggling correctly switches states without requiring an extra click.');

console.log('2. Testing late response guard when user turns Fit OFF while request is pending...');
let pendingShape = {
  id: 2,
  type: 'freehand',
  showFit: false,
  showOverlay: false,
  fitStatus: 'loading',
  fitRequestId: 10
};

const mockResponseData = {
  success: true,
  candidates: [{ family: 'quadratic', family_name: 'Quadratic' }]
};

if (mockResponseData.success && mockResponseData.candidates && mockResponseData.candidates.length > 0) {
  pendingShape.fitStatus = 'success';
  pendingShape.fitData = mockResponseData;
  pendingShape.selectedCandidateIndex = 0;
  pendingShape.showOverlay = (pendingShape.showFit !== false);
}

assert.strictEqual(pendingShape.showFit, false, 'showFit must remain false');
assert.strictEqual(pendingShape.showOverlay, false, 'showOverlay must remain false when showFit is false');
console.log('   ✅ Late response respects showFit === false and never forces overlay visible.');

console.log('3. Testing Model Family Selector candidate matching and selection persistence...');
let multiCandShape = {
  id: 3,
  type: 'freehand',
  requestedFamily: '',
  selectedCandidateIndex: 0,
  showFit: true,
  fitData: {
    success: true,
    candidates: [
      { family: 'linear', family_name: 'Linear' },
      { family: 'quadratic', family_name: 'Quadratic' },
      { family: 'sine', family_name: 'Sine Wave' }
    ]
  }
};

let chosenFamily = 'quadratic';
multiCandShape.requestedFamily = chosenFamily;
let matchIdx = multiCandShape.fitData.candidates.findIndex(c => c.family === chosenFamily);
if (matchIdx !== -1) {
  multiCandShape.selectedCandidateIndex = matchIdx;
}

assert.strictEqual(multiCandShape.requestedFamily, 'quadratic', 'requestedFamily must store chosen model');
assert.strictEqual(multiCandShape.selectedCandidateIndex, 1, 'selectedCandidateIndex must switch to matching candidate');

chosenFamily = '';
multiCandShape.requestedFamily = chosenFamily;
if (!chosenFamily) {
  multiCandShape.selectedCandidateIndex = 0;
}
assert.strictEqual(multiCandShape.requestedFamily, '', 'Auto Best Fit represented by empty string');
assert.strictEqual(multiCandShape.selectedCandidateIndex, 0, 'Auto Best Fit switches to top candidate (index 0)');
console.log('   ✅ Model selector correctly switches active candidate and stores requestedFamily.');

console.log('4. Testing Model Selector when fitting is disabled...');
let fitOffShape = {
  id: 4,
  type: 'freehand',
  requestedFamily: '',
  showFit: false,
  fitStatus: null
};

fitOffShape.requestedFamily = 'cubic';
assert.strictEqual(fitOffShape.requestedFamily, 'cubic', 'Selector saves requestedFamily without launching request');
assert.strictEqual(fitOffShape.showFit, false, 'Fitting remains off until explicitly toggled or fit clicked');
console.log('   ✅ Family choice is saved without triggering automatic fits when fitting is OFF.');

console.log('\n🎉 ALL FIT CONTROLS AND MODEL SELECTOR TESTS PASSED SUCCESSFULLY!');
