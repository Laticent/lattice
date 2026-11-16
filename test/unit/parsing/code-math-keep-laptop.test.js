/**
 * Unit: CODE AND MATH KEEP LAPTOP (owner, 2026-11-16; fit-everywhere-model.md §25), the chart ruling of
 * 2026-11-13 extended. A `code`, `compare-code` or `math` slide that names no venue, after the deck's `venue:` is
 * merged in, takes the class `keeps-laptop` (lib/core/resolve-venue.js `laptopKeepingToken`), from the markdown-it
 * kernel and the live runtime alike, and every handheld default rule skips it as it skips a chart. It is not a
 * venue token: a first cut stamped `venue-laptop`, which also turned off the narrow-canvas code wrap. A venue the
 * author writes, on the deck or the slide, still applies.
 *
 * FALSIFIABLE: without the kernel's call the NO-TOKENS and DECK-TOKENS cases carry no venue; without the early-
 * return branch the NO-TOKENS case alone carries none (most decks set no deck token, which is how the first cut
 * missed every slide); without the venue check the AUTHORED cases carry the marker.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('../../../lib/engine');
const { laptopKeepingToken, LAPTOP_KEEPING_COMPONENTS, KEEPS_LAPTOP_CLASS } = require('../../../lib/core/resolve-venue');
const { isSurfaceRegisterToken: isSurfaceRegister } = require('../../../lib/core/surface-registers');

const sections = (md) => [...render(md).html.matchAll(/<section[^>]*\sclass="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
const venues = (cls) => cls.filter((c) => c.startsWith('venue-'));
const keeps = (cls) => cls.includes('keeps-laptop');
const deck = (fm, ...slides) => `---\nmarp: true\nsize: square\n${fm}---\n\n${slides.join('\n\n---\n\n')}\n`;
const CODE = '<!-- _class: code -->\n\n## A listing.\n\n```js\nconst a = 1;\n```';
const MATH = '<!-- _class: math -->\n\n## An identity.\n\n$$a^2 + b^2 = c^2$$';
const COMPARE = '<!-- _class: compare-code -->\n\n## Before and after.\n\n```js\nconst a = 1;\n```\n\n```js\nconst a = 2;\n```';
const PROSE = '## A plain slide.\n\nSome words.';

test('the helper: a laptop-keeping component with no venue takes keeps-laptop, and nothing else does', () => {
  assert.deepEqual([...LAPTOP_KEEPING_COMPONENTS].sort(), ['code', 'compare-code', 'math']);
  assert.equal(KEEPS_LAPTOP_CLASS, 'keeps-laptop');
  assert.equal(laptopKeepingToken(['code', 'marks-pigment']), 'keeps-laptop');
  assert.equal(laptopKeepingToken('math dark'), 'keeps-laptop');
  assert.equal(laptopKeepingToken(['content']), null);
  assert.equal(laptopKeepingToken(['code', 'venue-phone']), null, 'an authored venue wins');
  assert.equal(laptopKeepingToken(['code', 'keeps-laptop']), null, 'never a second copy');
  assert.ok(!laptopKeepingToken(['code']).startsWith('venue-'), 'the marker is not a venue token');
});

test('NO-TOKENS: a deck that sets no deck token still marks its code, compare-code and math slides', () => {
  const [code, math, compare, prose] = sections(deck('', CODE, MATH, COMPARE, PROSE));
  for (const [name, cls] of [['code', code], ['math', math], ['compare-code', compare]]) {
    assert.ok(keeps(cls), `${name} is marked`);
    assert.deepEqual(venues(cls), [], `${name} carries no venue`);
  }
  assert.ok(!keeps(prose), 'a prose slide keeps the phone default');
});

test('DECK-TOKENS: with other deck registers set, the marker still lands', () => {
  const [code, prose] = sections(deck('lift: on\n', CODE, PROSE));
  assert.ok(keeps(code));
  assert.ok(code.includes('lifted'), 'the deck register merged too');
  assert.ok(!keeps(prose));
});

test('AUTHORED: a deck venue or a slide venue the author writes still applies, unmarked', () => {
  const [code, prose] = sections(deck('venue: phone\n', CODE, PROSE));
  assert.deepEqual(venues(code), ['venue-phone'], 'the deck said phone');
  assert.ok(!keeps(code));
  assert.deepEqual(venues(prose), ['venue-phone']);
  const [own] = sections(deck('', '<!-- _class: code venue-hall -->\n\n## A listing.\n\n```js\nconst a = 1;\n```'));
  assert.deepEqual(venues(own), ['venue-hall'], 'the slide said hall');
  assert.ok(!keeps(own));
});

// A split page's class list is rebuilt (split-envelope.js `roleOpenTag`); only surface registers ride. Without the
// marker among them, compare-code.gallery.md slide 3's pages read at phone (41px code) beside laptop siblings.
test('SPLIT: the marker rides a split page\'s class swap, as a venue does', () => {
  assert.ok(isSurfaceRegister(KEEPS_LAPTOP_CLASS));
  assert.ok(isSurfaceRegister('venue-laptop'), 'the axis it belongs to');
});
