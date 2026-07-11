const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bucketForAspect, BUCKET_NAMES } = require('../../../lib/core/image-aspect');

test('classifies the canonical shapes', () => {
  assert.equal(bucketForAspect(1280, 720), 'wide');    // 16:9 landscape photo
  assert.equal(bucketForAspect(720, 1280), 'tall');    // 9:16 phone portrait
  assert.equal(bucketForAspect(1000, 1000), 'square'); // 1:1
  assert.equal(bucketForAspect(3000, 1000), 'pano');   // 3:1 panorama
  assert.equal(bucketForAspect(400, 1200), 'column');  // 1:3 strip
});

test('boundaries: max inclusive, min exclusive', () => {
  assert.equal(bucketForAspect(130, 100), 'square');   // 1.30 → square (wide min exclusive)
  assert.equal(bucketForAspect(131, 100), 'wide');
  assert.equal(bucketForAspect(200, 100), 'wide');     // 2.00 → wide (pano min exclusive)
  assert.equal(bucketForAspect(201, 100), 'pano');
  assert.equal(bucketForAspect(77, 100), 'tall');      // 0.77 → tall (square min exclusive)
  assert.equal(bucketForAspect(78, 100), 'square');
  assert.equal(bucketForAspect(50, 100), 'column');    // 0.50 → column (tall min exclusive)
  assert.equal(bucketForAspect(51, 100), 'tall');
});

test('unusable sizes return null (→ Clean floor)', () => {
  for (const [w, h] of [[0, 100], [100, 0], [-5, 100], [NaN, 100], [Infinity, 100]]) {
    assert.equal(bucketForAspect(w, h), null);
  }
});

test('every bucket name is one of the five', () => {
  assert.deepEqual([...BUCKET_NAMES].sort(), ['column', 'pano', 'square', 'tall', 'wide']);
});

const { resolveComposition, compositionFromClass } = require('../../../lib/core/image-aspect');

test('resolveComposition: risk-gated — Clean is the default; only content-safe treatments auto-fire', () => {
  // landscape deck — Clean for moderate shapes; spotlight/split only for extremes
  assert.equal(resolveComposition('square','landscape'), 'clean');     // squarish → adaptive card
  assert.equal(resolveComposition('wide',  'landscape'), 'clean');     // 16:10 → adaptive card (no crop gamble)
  assert.equal(resolveComposition('pano',  'landscape'), 'spotlight'); // matches the canvas → full-bleed + SOLID card
  assert.equal(resolveComposition('tall',  'landscape'), 'split');     // tall → full-height column, ~zero crop
  assert.equal(resolveComposition('column','landscape'), 'split');
  // portrait deck
  assert.equal(resolveComposition('square','portrait'),  'clean');
  assert.equal(resolveComposition('wide',  'portrait'),  'split');     // wide → full-width top band
  assert.equal(resolveComposition('pano',  'portrait'),  'split');
  assert.equal(resolveComposition('tall',  'portrait'),  'spotlight'); // tall fills the tall canvas
  assert.equal(resolveComposition('column','portrait'),  'spotlight');
  // square deck + undefined behave as landscape
  assert.equal(resolveComposition('pano',  'square'),    'spotlight');
  assert.equal(resolveComposition('tall',  undefined),   'split');
});

test('resolveComposition: gallery + statement are NEVER auto-resolved — opt-in only', () => {
  const all = ['pano','wide','square','tall','column'];
  for (const o of ['landscape','portrait','square',undefined]) {
    for (const b of all) {
      assert.notEqual(resolveComposition(b, o), 'statement'); // scrim over an unknown photo
      assert.notEqual(resolveComposition(b, o), 'gallery');   // matte frame — for diagrams we can't detect
    }
  }
});

test('resolveComposition: no bucket → Clean floor (safe for any rectangle)', () => {
  assert.equal(resolveComposition(null, 'landscape'), 'clean');
  assert.equal(resolveComposition(null, 'portrait'), 'clean');
});

test('compositionFromClass: explicit author class wins; legacy aliases map', () => {
  assert.equal(compositionFromClass('image statement'), 'statement');
  assert.equal(compositionFromClass('image gallery'), 'gallery');
  assert.equal(compositionFromClass('image spotlight mirror'), 'spotlight');
  assert.equal(compositionFromClass('image full'), 'spotlight');   // legacy alias
  assert.equal(compositionFromClass('image contain'), 'gallery');  // legacy alias
  assert.equal(compositionFromClass('image museum'), 'gallery');   // legacy alias
  assert.equal(compositionFromClass('image'), null);               // no override → auto-resolve
  assert.equal(compositionFromClass('image mirror'), null);        // side hint, not a composition
});
