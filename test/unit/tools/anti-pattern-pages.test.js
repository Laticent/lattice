/**
 * Unit: the gallery's "When NOT to reach for X" slide pages its anti-patterns into COLUMNS
 * (tools/build-component-docs.js `antiPatternPages`): `cards-grid three`, `cards-grid` for two or
 * one, balanced across slides, with a word cap per column count (60 / 100 / 200 per card).
 *
 * Why: the slide was `cards-stack`, calibrated for ~16 words per item, while the manifests'
 * anti-patterns run a median 29. Three cards filled 716 of 720 px. In columns with `claim-hero` the
 * slide clips only past ~94 words a card, so the caps leave a third of the room unused
 * (engineering/decisions/2026-10-26-playground-anti-pattern-slide.md).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { antiPatternPages, antiPatternColumns, ANTI_PATTERN_WORD_CAPS, galleryPlan } = require('../../../tools/build-component-docs.js');
const antiPatternWords = (p) => `${p.title} ${p.body}`.split(/\s+/).filter(Boolean).length;
const { loadAll } = require('../../../lib/components');

const card = (n) => ({ title: 'Title', body: Array.from({ length: n - 1 }, () => 'w').join(' ') });
const sizes = (cards) => antiPatternPages(cards).map((p) => p.length);

test('short cards balance across slides, three across at most', () => {
  assert.deepEqual(ANTI_PATTERN_WORD_CAPS, [200, 100, 60]);
  assert.deepEqual(sizes([card(30), card(30), card(30)]), [3]);
  assert.deepEqual(sizes([card(30), card(30), card(30), card(30)]), [2, 2], '4 → 2+2, not 3+1');
  assert.deepEqual(sizes([card(30), card(30), card(30), card(30), card(30)]), [3, 2]);
});

test('a longer card pulls its page to two across, then one', () => {
  assert.deepEqual(sizes([card(90), card(50), card(40)]), [2, 1]);
  assert.deepEqual(sizes([card(150), card(10)]), [1, 1]);
  assert.deepEqual(sizes([card(210), card(220)]), [1, 1], 'an over-cap card sits alone');
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
      assert.ok(max <= ANTI_PATTERN_WORD_CAPS[0], `${m.name}: a card of ${max} words; trim the manifest to <= 200 (<= 100 to share a slide)`);
      assert.ok(page.length <= antiPatternColumns(max), `${m.name}: ${page.length} cards but the longest (${max} words) only fits ${antiPatternColumns(max)} across`);
      const klass = `${page.length === 3 ? 'cards-grid three' : 'cards-grid'} claim-hero`;
      assert.ok(slides[i].md.startsWith(`<!-- _class: ${klass} -->`), `${m.name}: class for ${page.length} cards`);
      assert.match(slides[i].md, /<!-- _header: '' -->/, `${m.name}: claim-hero needs the deck header cleared, or it prints over the heading`);
    });
  }
});
