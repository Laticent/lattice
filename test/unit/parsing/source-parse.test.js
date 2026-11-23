/**
 * Unit: source files parse cleanly.
 *
 * Both engine files are scripts (not modules) with side-effecting top
 * levels — `lattice.js` is a CLI that exits on missing argv,
 * `lattice-runtime.js` references `window`/`document`. We can't safely
 * `require()` either one inside a test process, so we delegate parse
 * checking to `node --check`, which lexes + parses without executing.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { execFileSync } = require('child_process');

describe('source-parse', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');

  // The child runs with NODE_V8_COVERAGE set to empty. Under `npm run test:coverage` c8 sets it, and
  // Node 22's `--check` then caches the bundle's source map through a WeakRef on a value that cannot
  // be one, and dies with `TypeError: WeakRef: invalid target` before it parses a byte. Deleting the
  // key is not enough: child_process copies the parent's NODE_V8_COVERAGE into any env that lacks
  // it, so the key has to be present and empty. A syntax check has no coverage to collect.
  const CHILD_ENV = { ...process.env, NODE_V8_COVERAGE: '' };

  function nodeCheck(file) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, file)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: CHILD_ENV,
    });
  }

  test('lattice.js parses', () => {
    assert.doesNotThrow(() => nodeCheck('lattice.js'));
  });

  test('lattice-runtime.js parses', () => {
    assert.doesNotThrow(() => nodeCheck('dist/lattice-runtime.js'));
  });

  test('dist/lattice.js parses', () => {
    assert.doesNotThrow(() => nodeCheck('dist/lattice.js'));
  });
});
