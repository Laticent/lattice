const { test } = require('node:test');
const assert = require('node:assert/strict');

const { mapSections } = require('../../../lib/core/section-walk');

const TWO = '<section id="1" class="title">A</section><section id="2" class="stats dark">B</section>';

test('null/undefined from the callback passes a section through byte-identical', () => {
  assert.equal(mapSections(TWO, () => null), TWO);
  assert.equal(mapSections(TWO, () => undefined), TWO);
});

test('a string return replaces the inner, keeping open/close tags', () => {
  const out = mapSections(TWO, (_openTag, cls, inner) => (cls.includes('stats') ? `[${inner}]` : null));
  assert.equal(out, '<section id="1" class="title">A</section><section id="2" class="stats dark">[B]</section>');
});

test('an { openTag, inner } return replaces both', () => {
  const out = mapSections('<section class="chart">C</section>', () => ({
    openTag: '<section class="chart chart-frame">',
    inner: 'X',
  }));
  assert.equal(out, '<section class="chart chart-frame">X</section>');
});

test('the callback receives openTag verbatim, cls, and inner', () => {
  const calls = [];
  mapSections(TWO, (openTag, cls, inner) => { calls.push([openTag, cls, inner]); return null; });
  assert.deepEqual(calls, [
    ['<section id="1" class="title">', 'title', 'A'],
    ['<section id="2" class="stats dark">', 'stats dark', 'B'],
  ]);
});

test('a class-less section yields cls === ""', () => {
  let seen;
  mapSections('<section>plain</section>', (_o, cls) => { seen = cls; return null; });
  assert.equal(seen, '');
});

test('nested <section> in user content stays inside its parent (depth-aware)', () => {
  const html = '<section class="outer">pre<section class="inner">deep</section>post</section>';
  const seen = [];
  const out = mapSections(html, (_o, cls) => { seen.push(cls); return null; });
  assert.deepEqual(seen, ['outer'], 'only the top-level section is visited');
  assert.equal(out, html);
});

test('degenerate input passes through: no sections, unterminated open tag, missing close', () => {
  assert.equal(mapSections('no sections here', () => 'X'), 'no sections here');
  assert.equal(mapSections('<section class="a"', () => 'X'), '<section class="a"');
  assert.equal(mapSections('<section class="a">never closed', () => 'X'), '<section class="a">never closed');
});

test('content between and after sections is preserved', () => {
  const html = 'lead<section>A</section>mid<section>B</section>tail';
  assert.equal(mapSections(html, () => null), html);
  assert.equal(mapSections(html, (_o, _c, inner) => inner + '!'), 'lead<section>A!</section>mid<section>B!</section>tail');
});
