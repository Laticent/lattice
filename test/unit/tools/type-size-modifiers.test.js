/**
 * Unit: `checkTypeSizeModifiers` in tools/check-ownership.js — one type size per deck
 * (engineering/typography.md §7; engineering/decisions/2026-09-25-font-scale-fit.md,
 * Amendment 2026-09-27 (2)). A per-slide class may change spacing, chrome and color, never a
 * type role's size.
 *
 * Each arm is pinned on a fixture that FAILS it, next to the look-alike it must let through,
 * because the gate is only as good as the line it draws between them:
 *   · arm A — a role token redeclared outside a tokens file or a venue / scale rung;
 *   · arm B — a cross-component modifier setting a size, against a spacing calc that merely
 *     READS a role, a pseudo-element (chrome), a class inside `:not()`, and the component's
 *     own variant of the same name.
 * And the real tree passes with its sanctions exactly consumed.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const own = require('../../../tools/check-ownership.js');

const ctx = {
  components: new Set(['cards-stack', 'divider']),
  ownVariants: new Map([['cards-stack', new Set(['horizontal'])], ['divider', new Set(['light'])]]),
  crossComponent: new Set(['compact', 'claim-hero', 'light', 'confidential']),
};
const offenses = (css, rel = 'lib/components/x/x.styles.css') => own.typeSizeOffensesIn(css, rel, ctx);

test('arm A: a role token belongs to the tokens files and the venue / scale rungs', () => {
  assert.equal(offenses('section.compact { --fs-body: 1.4cqi; }').length, 1);
  assert.equal(offenses('section.cards-stack { --venue-meta-lift: 1.2; }').length, 1);
  assert.equal(offenses('section.venue-hall { --fs-scale: 1.5; --venue-meta-lift: 1.3; }').length, 0);
  assert.equal(offenses('section.scale-xl { --fs-scale: 1.3; }').length, 0);
  assert.equal(offenses(':root { --fs-body: 1.67cqi; }', 'lib/base/base.tokens.css').length, 0);
  assert.equal(offenses('section.compact { --fs-body: 1px; }', 'lib/base/base.tokens.css').length, 1,
    'a tokens file is exempt only for its class-free root rules');
});

test('arm B: a cross-component modifier sets no type size on content', () => {
  const hit = offenses('section.cards-stack.compact .card { font-size: var(--fs-body-compact); }');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].modifier, 'compact');
  assert.equal(offenses('section.q.compact { --qa-index: var(--fs-body); }').length, 1, 'a bare role alias is a size');
  assert.equal(offenses('section.compact li { --row-fs: 12px; }').length, 1, 'a property named as a size is a size');
  assert.equal(offenses('section.compact li { font: 700 1em/1.2 serif; }').length, 1, 'the shorthand sets a size');
  assert.equal(offenses('section.compact .cell-stage { zoom: 0.9; }').length, 1, 'zoom shrinks the text too');
  assert.equal(offenses('section.compact p::first-line { font-size: 1px; }').length, 1, '::first-line styles content, not chrome');
});

test('arm B lets through what is not a per-slide size change', () => {
  assert.equal(offenses('section.claim-hero { --footer-reserve: calc(var(--frame-inset-y) + var(--fs-meta)); }').length, 0,
    'spacing that reads a role is spacing');
  assert.equal(offenses('section.confidential::before { font-size: 0.86cqi; }').length, 0, 'a pseudo-element is chrome');
  assert.equal(offenses('section.cards-stack:not(.compact) li { font-size: var(--fs-body); }').length, 0,
    'a class inside :not() excludes rather than applies');
  assert.equal(offenses('section.divider.light h1 { font-size: var(--fs-h2); }').length, 0,
    "the component's own variant is a layout, not a modifier");
  assert.equal(offenses('section.compact { --sp-md: 1cqi; padding: 2px; }').length, 0, 'spacing is allowed');
});

test('the quote- and paren-aware scan does not open a block inside a string', () => {
  const css = 'section.compact::after { content: "{"; }\nsection.compact li { font-size: 1px; }';
  assert.equal(offenses(css).length, 1);
});

test('a sanction whose count no longer matches fails, in both directions', () => {
  const o = (n) => Array.from({ length: n }, () => ({ file: 'a.css', modifier: 'compact' }));
  const s = [{ file: 'a.css', modifier: 'compact', count: 2 }];
  assert.deepEqual(own.applyTypeSizeSanctions(o(2), s), { remaining: [], stale: [] });
  assert.equal(own.applyTypeSizeSanctions(o(1), s).stale.length, 1, 'one fixed: the count is stale');
  assert.equal(own.applyTypeSizeSanctions(o(3), s).stale.length, 1, 'one added: the count is stale');
  assert.equal(own.applyTypeSizeSanctions([{ file: 'b.css', modifier: 'compact' }], s).remaining.length, 1,
    'another file is not covered');
});

test('the real tree passes, every sanction consumed exactly', () => {
  const errors = [];
  own.checkTypeSizeModifiers(errors);
  assert.deepEqual(errors, []);
});
