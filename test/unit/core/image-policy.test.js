const test = require('node:test');
const assert = require('node:assert/strict');
// The `images:` words and their numbers (lib/core/image-policy.js). Reading a picture's header and deciding its recode
// moved to the image library, with their tests: docs/src/lib/lastra/read.test.ts and decide.test.ts.
const { mergeImagesSettings, parseImagesSetting, resolveImagePolicy, IMAGE_MODES, DEFAULTS } = require('../../../lib/core/image-policy.js');

test('resolveImagePolicy: optimized by default, original on request, quality clamped', () => {
  assert.deepEqual(IMAGE_MODES, ['optimized', 'original']);
  assert.equal(resolveImagePolicy().mode, 'optimized');
  assert.equal(resolveImagePolicy({ mode: ' Original ' }).mode, 'original');
  assert.equal(resolveImagePolicy({ mode: 'bogus' }).mode, 'optimized');
  assert.equal(resolveImagePolicy().quality, 90);
  assert.equal(resolveImagePolicy({ quality: '200' }).quality, 100);
  assert.equal(resolveImagePolicy({ quality: 0 }).quality, 1);
  assert.equal(resolveImagePolicy({ quality: 'x' }).quality, 90);
});

test('the images: line takes a mode and a quality in any order, like the other multi-word registers', () => {
  assert.deepEqual(parseImagesSetting('optimized 90'), { mode: 'optimized', quality: '90', unknown: [] });
  assert.deepEqual(parseImagesSetting('90 Original'), { mode: 'original', quality: '90', unknown: [] });
  assert.deepEqual(parseImagesSetting('original, lossless 0 101'), { mode: 'original', quality: '', unknown: ['lossless', '0', '101'] });
  const p = resolveImagePolicy('optimized 90');
  assert.equal(p.mode, 'optimized');
  assert.equal(p.quality, 90);
  assert.equal(resolveImagePolicy('original').mode, 'original');
  assert.equal(resolveImagePolicy(undefined).quality, 90);
});

test('the policy is the thresholds lastra\'s planRecode and acceptRecode read, as numbers', () => {
  // lastra holds no defaults: these six numbers are everything it decides with (docs/src/lib/lastra/decide.ts).
  const p = resolveImagePolicy('optimized 70');
  for (const key of ['maxEdge', 'quality', 'minBytes', 'formatShare', 'sameFormatShare', 'tightJpegBytesPerPx']) {
    assert.equal(typeof p[key], 'number', key);
    assert.ok(Number.isFinite(p[key]) && p[key] > 0, key);
  }
  assert.equal(p.quality, 70);
  assert.equal(p.maxEdge, DEFAULTS.maxEdge);
});

test('the flag and the panel merge over the deck word by word', () => {
  assert.deepEqual(mergeImagesSettings('original', '70'), { mode: 'original', quality: '70', unknown: [] });
  assert.deepEqual(mergeImagesSettings('optimized 70', 'original'), { mode: 'original', quality: '70', unknown: [] });
  assert.deepEqual(mergeImagesSettings(undefined, undefined), { mode: '', quality: '', unknown: [] });
  assert.equal(resolveImagePolicy(mergeImagesSettings('70', 'optimized')).quality, 70);
});
