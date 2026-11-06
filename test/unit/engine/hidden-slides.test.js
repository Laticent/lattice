/**
 * HIDDEN SLIDES (`<!-- hide -->`, engineering/decisions/2026-11-06-hidden-slides.md).
 *
 * A hidden slide stays in the rendered document, marked `data-lattice-hidden`, so the editor can show it; it
 * takes no page number, is not in the total, and a hidden divider opens no section. The Studio's slice path
 * renders one slide alone and SUPPLIES its position (`supplyablePosition`), so the second half of this file is an
 * oracle: every slide rendered alone with the supplied position must carry the same number, total, rail and
 * glyph as the same slide inside the whole-deck render.
 */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine/index.js');

let core;
let hideOn;
before(async () => {
  core = await import('../../../lib/diagnostics/slice-equivalence-core.mjs');
  ({ hideOn } = await import('../../../lib/core/meta-keys.mjs'));
});

const sectionsOf = (html) => html.match(/<section[\s\S]*?<\/section>/g) || [];
const attr = (s, name) => (s.match(new RegExp(`<section[^>]*\\s${name}="([^"]*)"`)) || [])[1];
const rail = (html) => (html.match(/<div class="tile-progress"[\s\S]*?<\/div>/) || [''])[0];
const glyph = (html) => (html.match(/class="tile-watermark[^"]*"[^>]*>([^<]*)</) || ['', ''])[1];
const deckOf = (slides) => `---\ntheme: indaco\npaginate: true\n---\n\n${slides.join('\n\n---\n\n')}\n`;

const BODY = (n) => `<!-- _class: form watermark -->\n\n## Body ${n}.`;
const DIVIDER = (n) => `<!-- _class: divider -->\n\n# Part ${n}`;
const hide = (slide, form = '<!-- hide -->') => `${form}\n${slide}`;

describe('hideOn: the value rule', () => {
  test('bare or an explicit on hides; anything else shows', () => {
    for (const v of ['', 'true', 'yes', 'on', '1', ' "true" ', 'TRUE', 'true # backup']) assert.equal(hideOn(v), true, JSON.stringify(v));
    for (const v of ['false', 'no', 'off', '0', 'FALSE', "'false'", 'false # shown again', 'if short on time']) assert.equal(hideOn(v), false, JSON.stringify(v));
  });
});

describe('engine: a hidden slide is marked and takes no number', () => {
  const forms = ['<!-- hide -->', '<!-- _hide -->', '<!-- _hide: true -->', '<!-- hide: yes -->'];
  for (const form of forms) {
    test(`${form} hides the slide and the shown slides number 1..N`, () => {
      const html = createEngine().render(deckOf([BODY(1), hide(BODY(2), form), BODY(3)]), 'lattice').html;
      const s = sectionsOf(html);
      assert.equal(s.length, 3, 'the hidden slide stays in the document');
      assert.equal(attr(s[1], 'data-lattice-hidden'), 'true');
      assert.equal(attr(s[1], 'data-lattice-pagination'), undefined, 'a hidden slide shows no number');
      assert.deepEqual([attr(s[0], 'data-lattice-pagination'), attr(s[2], 'data-lattice-pagination')], ['1', '2']);
      assert.deepEqual([attr(s[0], 'data-lattice-pagination-total'), attr(s[2], 'data-lattice-pagination-total')], ['2', '2']);
      assert.doesNotMatch(s[1], /hide/, 'the directive comment is consumed, never painted or kept as a note');
    });
  }

  test('`_hide: false` shows the slide', () => {
    const s = sectionsOf(createEngine().render(deckOf([BODY(1), hide(BODY(2), '<!-- _hide: false -->')]), 'lattice').html);
    assert.equal(attr(s[1], 'data-lattice-hidden'), undefined);
    assert.equal(attr(s[1], 'data-lattice-pagination'), '2');
  });

  test('hide is slide-scoped: an un-underscored `hide` does not carry onto later slides', () => {
    const s = sectionsOf(createEngine().render(deckOf([hide(BODY(1)), BODY(2), BODY(3)]), 'lattice').html);
    assert.deepEqual(s.map((x) => attr(x, 'data-lattice-hidden') ?? '-'), ['true', '-', '-']);
    assert.deepEqual(s.map((x) => attr(x, 'data-lattice-pagination') ?? '-'), ['-', '1', '2']);
  });

  test('a hidden divider opens no section: the rail and the glyph count shown dividers only', () => {
    const s = sectionsOf(createEngine().render(deckOf([DIVIDER(1), BODY(1), hide(DIVIDER(2)), BODY(2), DIVIDER(3), BODY(3)]), 'lattice').html);
    assert.equal(glyph(s[3]), '01', 'the slide after a hidden divider stays in the section before it');
    assert.equal(glyph(s[5]), '02');
    assert.equal((rail(s[5]).match(/<span/g) || []).length, (rail(s[1]).match(/<span/g) || []).length);
  });
});

describe('the checker\'s findings, pinned', () => {
  const marks = (md) => sectionsOf(createEngine().render(md, 'lattice').html).map((x) => (attr(x, 'data-lattice-hidden') ? 'H' : attr(x, 'data-lattice-pagination') ?? '-'));

  test('split: headings — a hide anywhere in a `---` block hides every part of it', () => {
    const md = '---\ntheme: indaco\nsplit: headings\npaginate: true\n---\n\n## A\n\n---\n\n<!-- hide -->\n## C1\n\nc\n\n## C2\n\n---\n\n## D1\n\n<!-- hide -->\n## D2\n\n---\n\n## E\n';
    assert.deepEqual(marks(md), ['1', 'H', 'H', 'H', 'H', '2']);
  });

  test('a hidden pane-split slide hides every pane page', () => {
    const md = '---\ntheme: indaco\npaginate: true\nsize: square\n---\n\n# A\n\n---\n\n<!-- hide -->\n## Panes.\n\n<!-- _class: columns ratio-55-45 -->\n<!-- _pane: bar -->\n\np95.\n\n- Before `840`\n- After `190`\n\n<!-- _pane: list -->\n\n- one\n- two\n\n---\n\n# C\n';
    const m = marks(md);
    assert.deepEqual([m[0], m[m.length - 1]], ['1', '2']);
    assert.ok(m.slice(1, -1).length >= 1 && m.slice(1, -1).every((x) => x === 'H'), m.join(' '));
    const page = core.supplyablePosition(md, 2, 3, [1, 2, 1]);
    assert.deepEqual([page.offset, page.total], [1, 2]);
  });

  test('a hide inside a line of text is not a directive, in the engine or the source reader', () => {
    const md = deckOf([BODY(1), '## B with inline <!-- hide --> comment', BODY(3)]);
    assert.deepEqual(marks(md), ['1', '2', '3']);
    assert.equal(core.slideSourceHidden('## B with inline <!-- hide --> comment'), false);
  });

  test('front-matter `hide:` hides nothing: hide is a slide key', () => {
    const md = '---\ntheme: indaco\npaginate: true\nhide: true\n---\n\n## A\n\n---\n\n## B\n';
    assert.deepEqual(marks(md), ['1', '2']);
  });

  test('a note that starts with the word does not hide the slide', () => {
    assert.deepEqual(marks(deckOf([BODY(1), hide(BODY(2), '<!-- hide: if short on time -->')])), ['1', '2']);
    assert.equal(core.slideSourceHidden('<!-- hide: if short on time -->\n## B'), false);
  });
});

describe('slice path: the supplied position == the whole-deck render', () => {
  const cases = [
    ['hidden in the middle', [BODY(1), hide(BODY(2)), BODY(3), BODY(4)]],
    ['hidden first', [hide(BODY(1)), BODY(2), BODY(3)]],
    ['hidden last', [BODY(1), BODY(2), hide(BODY(3))]],
    ['two hidden in a row, spot form', [BODY(1), hide(BODY(2), '<!-- _hide -->'), hide(BODY(3), '<!-- _hide: true -->'), BODY(4)]],
    ['explicitly shown', [BODY(1), hide(BODY(2), '<!-- _hide: false -->'), BODY(3)]],
    ['hidden divider', [DIVIDER(1), BODY(1), hide(DIVIDER(2)), BODY(2), DIVIDER(3), BODY(3)]],
  ];

  test('a `hide` shown inside code is not a directive, and the slice path refuses rather than guessing', () => {
    // The raw and code-blanked readings of the chunk disagree, so the derivation bails, as it does for a divider
    // shown in code: the preview renders the whole deck, which counts for itself. Fail safe, never fail wrong.
    const slides = [BODY(1), '## Teaching\n\n```md\n<!-- hide -->\n```', BODY(3)];
    const deck = deckOf(slides);
    const full = sectionsOf(createEngine().render(deck, 'lattice').html);
    assert.deepEqual(full.map((x) => attr(x, 'data-lattice-pagination')), ['1', '2', '3']);
    assert.equal(attr(full[1], 'data-lattice-hidden'), undefined);
    assert.equal(core.supplyablePosition(deck, 1, slides.length), undefined);
  });

  for (const [label, slides] of cases) {
    test(label, () => {
      const engine = createEngine();
      const deck = deckOf(slides);
      const full = sectionsOf(engine.render(deck, 'lattice').html);
      assert.equal(full.length, slides.length);
      slides.forEach((slide, k) => {
        const page = core.supplyablePosition(deck, k, slides.length);
        assert.ok(page, `${label}: slide ${k + 1} got no supplyable position`);
        const alone = sectionsOf(engine.render(deckOf([slide]), 'lattice', { page }).html)[0];
        for (const a of ['data-lattice-hidden', 'data-lattice-pagination', 'data-lattice-pagination-total']) {
          assert.equal(attr(alone, a), attr(full[k], a), `${label}: ${a} differs on slide ${k + 1}`);
        }
        assert.equal(rail(alone), rail(full[k]), `${label}: rail differs on slide ${k + 1}`);
        assert.equal(glyph(alone), glyph(full[k]), `${label}: glyph differs on slide ${k + 1}`);
      });
    });
  }
});
