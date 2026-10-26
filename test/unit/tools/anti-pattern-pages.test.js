/**
 * Unit: the gallery's "When NOT to reach for X" slide pages its anti-patterns into COLUMNS
 * (tools/build-component-docs.js `antiPatternPages`): `cards-grid three`, `cards-grid` for two or
 * one, balanced across slides, with a word cap per column count (42 / 66 / 150 per card).
 *
 * Why: the slide was `cards-stack`, calibrated for ~16 words per item, while the manifests'
 * anti-patterns run a median 29. Three cards filled 716 of 720 px, so any extra body size (an
 * iPhone showed the owner 1.2x) clipped them. In columns the same slide clears the 1.2x case up to
 * the caps above (engineering/decisions/2026-10-26-playground-anti-pattern-slide.md).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { antiPatternPages, antiPatternColumns, ANTI_PATTERN_WORD_CAPS, galleryPlan } = require('../../../tools/build-component-docs.js');
const antiPatternWords = (p) => `${p.title} ${p.body}`.split(/\s+/).filter(Boolean).length;
const { loadAll } = require('../../../lib/components');

const card = (n) => ({ title: 'Title', body: Array.from({ length: n - 1 }, () => 'w').join(' ') });
const sizes = (cards) => antiPatternPages(cards).map((p) => p.length);

test('short cards balance across slides, three across at most', () => {
  assert.deepEqual(ANTI_PATTERN_WORD_CAPS, [150, 66, 42]);
  assert.deepEqual(sizes([card(30), card(30), card(30)]), [3]);
  assert.deepEqual(sizes([card(30), card(30), card(30), card(30)]), [2, 2], '4 → 2+2, not 3+1');
  assert.deepEqual(sizes([card(30), card(30), card(30), card(30), card(30)]), [3, 2]);
});

test('a longer card pulls its page to two across, then one', () => {
  assert.deepEqual(sizes([card(60), card(50), card(40)]), [2, 1]);
  assert.deepEqual(sizes([card(100), card(10)]), [1, 1]);
  assert.deepEqual(sizes([card(150), card(160)]), [1, 1], 'an over-cap card sits alone');
});

test('every gallery anti-pattern slide is cards-grid within the per-column word cap', () => {
  for (const m of loadAll()) {
    const slides = galleryPlan(m).filter((s) => s.kind.startsWith('anti-patterns'));
    if (!m.antiPatterns?.length) { assert.equal(slides.length, 0); continue; }
    const pages = antiPatternPages(m.antiPatterns);
    assert.equal(slides.length, pages.length, `${m.name}: one slide per page`);
    pages.forEach((page, i) => {
      const max = Math.max(...page.map(antiPatternWords));
      assert.ok(page.length <= 3, `${m.name}: ${page.length} cards on one slide`);
      assert.ok(max <= ANTI_PATTERN_WORD_CAPS[0], `${m.name}: a card of ${max} words; trim the manifest to <= 150 (<= 66 to share a slide)`);
      assert.ok(page.length <= antiPatternColumns(max), `${m.name}: ${page.length} cards but the longest (${max} words) only fits ${antiPatternColumns(max)} across`);
      const klass = `${page.length === 3 ? 'cards-grid three' : 'cards-grid'} claim-hero`;
      assert.ok(slides[i].md.startsWith(`<!-- _class: ${klass} -->`), `${m.name}: class for ${page.length} cards`);
    });
  }
});
