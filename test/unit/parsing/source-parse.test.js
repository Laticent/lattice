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

  function nodeCheck(file) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, file)], {
      stdio: ['ignore', 'pipe', 'pipe'],
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
