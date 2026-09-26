/**
 * Unit: the gallery's "When NOT to reach for X" slide pages its anti-patterns by a word budget
 * (tools/build-component-docs.js `antiPatternPages`), and never uses `compact`.
 *
 * Why: the slide used to be one `cards-stack compact` slide, and cards-stack's `compact` shrank
 * the card text to fit. A modifier may not change a type role's size (engineering/typography.md
 * §7), so the shrink is gone, and at body size one slide clipped on 19 of 71 galleries. The
 * budget (100 words, three cards) is the measured one: every component's anti-patterns paged
 * this way clip on 0 of 107 slides (engineering/decisions/2026-09-25-font-scale-fit.md,
 * Amendment 2026-09-27 (2)).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { antiPatternPages, ANTI_PATTERN_WORDS_PER_SLIDE, galleryPlan } = require('../../../tools/build-component-docs.js');
const { loadAll } = require('../../../lib/components');

const card = (n) => ({ title: 'Title', body: Array.from({ length: n - 1 }, () => 'w').join(' ') });

test('packs greedily in order, up to the word budget and three cards', () => {
  assert.equal(ANTI_PATTERN_WORDS_PER_SLIDE, 100);
  assert.deepEqual(antiPatternPages([card(30), card(30), card(30), card(30)]).map((p) => p.length), [3, 1]);
  assert.deepEqual(antiPatternPages([card(60), card(50), card(40)]).map((p) => p.length), [1, 2]);
  assert.deepEqual(antiPatternPages([card(150), card(10)]).map((p) => p.length), [1, 1], 'an over-budget card sits alone');
});

test('every gallery anti-pattern slide is body-size cards-stack within the budget', () => {
  for (const m of loadAll()) {
    const slides = galleryPlan(m).filter((s) => s.kind.startsWith('anti-patterns'));
    if (!m.antiPatterns?.length) { assert.equal(slides.length, 0); continue; }
    assert.equal(slides.length, antiPatternPages(m.antiPatterns).length, `${m.name}: one slide per page`);
    for (const s of slides) {
      assert.match(s.md, /^<!-- _class: cards-stack -->/, `${m.name}: plain cards-stack, no compact`);
      assert.doesNotMatch(s.md.split('\n')[0], /\bcompact\b/, `${m.name}: no compact on the class line`);
    }
  }
});
