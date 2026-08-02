/**
 * A slide rendered ALONE with a supplied section position must produce the same progress rail and
 * watermark glyph as that slide's section inside the full-deck render.
 *
 * WHY THIS EXISTS. The rail and the glyph are deck-derived: both count divider slides across the
 * document. The preview supplies that count instead of making the engine re-derive it, which is
 * what stopped a deck with dividers re-parsing in full on every keystroke. That trade is only
 * sound if the supplied number lands on the same output, and nothing else in the repo checks the
 * two paths against each other — every other test asserts what the CALLER sends, with the engine
 * mocked.
 *
 * It is not hypothetical: an inversion review found the caller counting a `_class: divider` that
 * appeared inside an inline code span, painting two dots and "02" where the deck rendered one and
 * "01". That class of bug is invisible to a mocked test and this is the shape that catches it.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine/index.js');

const rail = (html) => (html.match(/<div class="tile-progress"[\s\S]*?<\/div>/) || [''])[0];
const glyph = (html) => (html.match(/class="tile-watermark[^"]*"[^>]*>([^<]*)</) || ['', ''])[1];
const sectionsOf = (html) => html.match(/<section[\s\S]*?<\/section>/g) || [];

function deckOf(slides) {
  return `---\ntheme: indaco\npaginate: true\n---\n\n${slides.join('\n\n---\n\n')}\n`;
}
const DIVIDER = (n) => `<!-- _class: divider -->\n\n# Part ${n}`;
const BODY = (n) => `<!-- _class: form -->\n\n## Body ${n}.`;

/** For slide k of `slides`, the section index the full-deck walk arrives at. */
function trueSection(slides, k) {
  let idx = 0;
  for (let i = 0; i <= k; i++) if (/_class:[^>]*\bdivider\b/.test(slides[i])) idx += 1;
  return idx;
}

describe('slice render with a supplied section == the full-deck section', () => {
  const cases = [
    ['two sections', [DIVIDER(1), BODY(1), DIVIDER(2), BODY(2)]],
    ['slide before the first divider', [BODY(0), DIVIDER(1), BODY(1)]],
    ['consecutive dividers', [DIVIDER(1), DIVIDER(2), BODY(1)]],
    ['divider is the shown slide', [DIVIDER(1), BODY(1), DIVIDER(2)]],
    // Past MAX_DOTS the rail BUCKETS, which is the shape most likely to diverge on an
    // index/total pair rather than on a raw count.
    ['many sections (bucketed past MAX_DOTS)', Array.from({ length: 26 }, (_, i) => (i % 2 ? BODY(i) : DIVIDER(i)))],
  ];

  for (const [label, slides] of cases) {
    test(label, () => {
      const engine = createEngine();
      const full = engine.render(deckOf(slides), 'lattice').html;
      const fullSections = sectionsOf(full);
      assert.equal(fullSections.length, slides.length, `${label}: deck did not render 1 section per slide`);
      const total = slides.filter((s) => /_class:[^>]*\bdivider\b/.test(s)).length;

      slides.forEach((slide, k) => {
        const alone = engine.render(deckOf([slide]), 'lattice', {
          page: { offset: k, total: slides.length, deckSection: { index: trueSection(slides, k), total } },
        }).html;
        assert.equal(rail(alone), rail(fullSections[k]), `${label}: rail differs on slide ${k + 1}`);
        assert.equal(glyph(alone), glyph(fullSections[k]), `${label}: watermark glyph differs on slide ${k + 1}`);
      });
    });
  }

  test('supplying NOTHING leaves both tiles exactly as the walk produced them', () => {
    // The property that keeps every export byte-identical: no supplied section, no change.
    const engine = createEngine();
    const deck = deckOf([DIVIDER(1), BODY(1), DIVIDER(2), BODY(2)]);
    assert.equal(engine.render(deck, 'lattice').html, engine.render(deck, 'lattice', { page: { offset: 0, total: 4 } }).html);
  });
});
