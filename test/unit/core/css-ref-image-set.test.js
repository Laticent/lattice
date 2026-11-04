// The `imageSet` fact `makeCssRefSpans(…, { imageSet: imageSetBlock })` adds to each span (lib/core/css-ref-reader.js): inside an
// `image-set()` at any depth, and not directly in a `type()`. The CLI's HTML export reads a bare string there as an
// address (lib/export/html-player.js). Callers that do not ask get the spans without the field.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeCssRefSpans } = require('../../../lib/core/css-ref-reader.js');
const parser = require('../../../lib/core/css-ref.generated.js');
const helpers = require('../../../lib/core/css-token-readers.js');

const { imageSetBlock } = require('../../../lib/core/css-image-set-block.js');
const withFact = makeCssRefSpans(parser, helpers, { imageSet: imageSetBlock });
const read = (css) => withFact(css).map((sp) => [sp.value, sp.imageSet]);

test('a string is inside image-set() however the name is spelled', () => {
  for (const css of ['a{b:image-set("x" 1x)}', 'a{b:-webkit-image-set("x" 1x)}', 'a{b:IMAGE-SET("x")}', 'a{b:image-s\\65t("x")}', 'a{b:image-s\\65 t("x")}', 'a{b:/*c*/image-set("x")}', '"q"image-set("x")', '5%image-set("x")']) {
    assert.deepEqual(read(css).at(-1), ['x', true], css);
  }
});

test('not image-set(): a longer name, a dimension, a string after the function closes', () => {
  for (const css of ['a{b:myimage-set("x")}', '1.5image-set("x")', '2image-set("x")', `${'a'.repeat(20)}webkit-image-set("x")`, 'a{b:image-set("y") "x"}', 'content:"x"']) {
    assert.deepEqual(read(css).at(-1), ['x', false], css);
  }
});

test('at any depth, but not directly in type()', () => {
  assert.deepEqual(read('a{b:image-set(var(--u, "x") 1x)}'), [['x', true]]);
  assert.deepEqual(read('a{b:image-set(type("t") "x")}'), [['t', false], ['x', true]]);
  assert.deepEqual(read('a{b:image-set("x" ty\\70 e("t"))}'), [['x', true], ['t', false]]);
});

test('without the option the spans carry no imageSet field', () => {
  const plain = makeCssRefSpans(parser, helpers);
  assert.equal('imageSet' in plain('a{b:image-set("x")}')[0], false);
});

test('a long run of functions reads in linear time', () => {
  const css = 'a{b:image-set(type("t") "x"),calc(1px)}'.repeat(20000);
  const t0 = performance.now();
  withFact(css);
  assert.ok(performance.now() - t0 < 2000, `took ${Math.round(performance.now() - t0)} ms`);
});
