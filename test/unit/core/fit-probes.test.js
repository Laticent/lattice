// lib/core/fit-probes.mjs: the fit probes a live measuring frame loads as a file, since the docs
// site's policy forbids eval and a preview frame inherits it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const fitMeasure = require('../../../lib/core/fit-measure.js');
const overflowProbe = require('../../../lib/core/overflow-probe.js');
const tableReflowFit = require('../../../lib/core/table-reflow-fit.js');

const load = () => import('../../../lib/core/fit-probes.mjs');
const mods = { fitMeasure, overflowProbe, tableReflowFit };

test('the probes file sets one frozen global holding every probe as a function', async () => {
  const { fitProbesSource, FIT_PROBES_GLOBAL } = await load();
  const window = {};
  vm.runInNewContext(fitProbesSource(mods), { window });
  const P = window[FIT_PROBES_GLOBAL];
  assert.ok(Object.isFrozen(P));
  for (const k of ['verdict', 'measure', 'overflow', 'foldable', 'probe', 'cc', 'slides', 'forceReflow']) assert.equal(typeof P[k], 'function', k);
  // The page cannot swap the probes out from under the host.
  assert.throws(() => {
    'use strict';
    Object.defineProperty(window, FIT_PROBES_GLOBAL, { value: {} });
  });
});

test('the probes file evaluates no string itself', async () => {
  const { fitProbesSource } = await load();
  const src = fitProbesSource(mods);
  assert.doesNotMatch(src, /new Function\(|(?:^|[^.\w$])Function\(|(?:^|[^.\w$])eval\(/);
});

test('the verdict takes its probes as functions, with no source strings', () => {
  assert.doesNotMatch(fitMeasure.FIT_VERDICT_SRC, /probeSrc|ccSrc|Function\(/);
});

test('a missing probe source is an error, not a file that defines nothing', async () => {
  const { fitProbesSource } = await load();
  assert.throws(() => fitProbesSource({ ...mods, tableReflowFit: {} }), /no source for forceReflow/);
});

test('the preview slide finder skips a section nested inside a slide', async () => {
  const { previewSlides } = await load();
  const nested = { parentElement: { closest: () => ({}) } };
  const top = { parentElement: { closest: () => null } };
  const doc = { querySelectorAll: () => [top, nested] };
  assert.deepEqual(previewSlides(doc), [top]);
});
