/**
 * Unit: the gallery's "When NOT to reach for X" slide pages its anti-patterns by a word budget
 * (tools/build-component-docs.js `antiPatternPages`), and never uses `compact`.
 *
 * Why: the slide used to be one `cards-stack compact` slide, and cards-stack's `compact` shrank
 * the card text to fit. A modifier may not change a type role's size (engineering/typography.md
 * §7), so the shrink is gone, and at body size 19 of the 71 generated slides of this kind clipped. The
 * budget (100 words, three cards) is the measured one: every component's anti-patterns paged
 * this way clip on 0 of 108 slides (engineering/decisions/2026-09-25-font-scale-fit.md,
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
    // The budget itself, read off the pages rather than off the function that made them: a
    // page over 100 words holds exactly one card (an over-budget card sits alone), and no page
    // holds more than three.
    const words = (p) => `${p.title} ${p.body}`.split(/\s+/).filter(Boolean).length;
    for (const page of antiPatternPages(m.antiPatterns)) {
      assert.ok(page.length >= 1 && page.length <= 3, `${m.name}: ${page.length} cards on one slide`);
      const sum = page.reduce((n, p) => n + words(p), 0);
      assert.ok(sum <= ANTI_PATTERN_WORDS_PER_SLIDE || page.length === 1, `${m.name}: ${sum} words over ${page.length} cards`);
    }
    for (const s of slides) {
      assert.match(s.md, /^<!-- _class: cards-stack -->/, `${m.name}: plain cards-stack, no compact`);
      assert.doesNotMatch(s.md.split('\n')[0], /\bcompact\b/, `${m.name}: no compact on the class line`);
    }
  }
});
