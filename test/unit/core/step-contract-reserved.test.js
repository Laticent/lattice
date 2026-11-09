/**
 * `data-step` belongs to the step contract (engineering/decisions/2026-11-09-steps-as-a-behavior.md S4).
 *
 * The painter (lib/core/step-state.mjs `applyStepAt`) toggles classes on EVERY `[data-step]` element of a stepping
 * slide, and the build sheet (lib/base/base.build.css) hides every `[data-step]` element a build has not reached. So
 * anything else that writes the attribute is walked as if it were a step, silently. That is not hypothetical: the
 * heatmap used `data-step` for its color ramp, and a focus walk over heatmap marks rewrote it and lost the fill (it
 * is `data-ramp` now). This test fails the day anything outside the contract writes or selects the name again.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');

// The files that own the contract: the two resolvers that write it, the re-scope that renumbers it, the painter that
// reads it, the sheet that draws it.
const OWNERS = new Set([
  'lib/transformers/focus.js',
  'lib/transformers/build.js',
  'lib/core/step-state.mjs',
  'lib/core/step-rescope.js',
  'lib/base/base.build.css',
]);

// A write or a selector of the bare name (never `data-step-at`, `data-steps`, `data-step-kind`, …).
const USE = /data-step(?![\w-])\s*=|['"`]data-step['"`]|\[data-step(?![\w-])|\bdataset\.step\b/;

const files = execFileSync('git', ['ls-files', '--', 'lib', 'docs/src', 'themes'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(m?js|cjs|tsx?|css)$/.test(f) && !/\.test\.|generated|\/dist\//.test(f));

test('the scan covers the engine, the docs site and the themes (a scan that reads nothing proves nothing)', () => {
  assert.ok(files.length > 500, `expected the source tree, found ${files.length} files`);
  for (const f of OWNERS) assert.ok(files.includes(f), `${f} is an owner and must be scanned`);
});

test('nothing outside the step contract writes or selects `data-step`', () => {
  const strays = [];
  for (const f of files) {
    if (OWNERS.has(f)) continue;
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      if (USE.test(code)) strays.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(strays, [], 'name your attribute something else; `data-step` is walked by every Present surface');
});

test('the owners really use it (the pattern is not vacuous)', () => {
  for (const f of ['lib/transformers/focus.js', 'lib/transformers/build.js', 'lib/core/step-state.mjs']) {
    assert.ok(USE.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), `${f} should match`);
  }
});
