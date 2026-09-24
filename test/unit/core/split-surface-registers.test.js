/**
 * A split run keeps the deck's SURFACE registers on every page it emits (#2305).
 *
 * `roleOpenTag` replaces a re-authored page's class list, and it used to carry only the canvas
 * axis across that swap. A `finish: atrium` deck therefore rendered its split covers and every
 * carousel page with no finish at all, while the same run's auto-split body pages — built with
 * the additive `addClass` — kept it. Measured on examples/finish-canvas-light-half.md: 8 of 13
 * rendered pages carried the finish, and none of the 6 accent covers or carousel pages did.
 *
 * Three things have to hold for a finish to survive a split, and each is pinned here:
 *   1. the register TOKENS ride across the class swap (lib/core/surface-registers.js);
 *   2. the page gets a `.backdrop` wrapper, which the compositor draws on — a re-authored page
 *      is built from the masthead, not the source's children, so it arrives without one;
 *   3. the wrapper lands AFTER a deck logo, which is every render path's first child.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { isSurfaceRegisterToken } = require('../../../lib/core/surface-registers');
const { roleOpenTag } = require('../../../lib/core/split-envelope');
const { splitDoc } = require('../../../lib/core/auto-split');
const { applyBackdropToHtml } = require('../../../lib/core/backdrop');
const { MODE_TOKENS } = require('../../../lib/core/resolve-mode');
const { STAMP_STYLE_TOKENS } = require('../../../lib/core/resolve-stamp');
const { TONE_STYLE_TOKENS } = require('../../../lib/core/resolve-tone-style');
const spectrum = require('../../../lib/core/resolve-spectrum');
const { CORNERS_TOKENS } = require('../../../lib/core/resolve-corners');
const { GUARDS_TOKENS } = require('../../../lib/core/resolve-guards');
const { RULE_TOKENS } = require('../../../lib/core/resolve-rule');
const { EYEBROW_TOKENS } = require('../../../lib/core/resolve-eyebrow');
const { INLINE_CODE_TOKENS } = require('../../../lib/core/resolve-inline-code');
const { HEADLINE_TOKENS } = require('../../../lib/core/resolve-headline');
const { LIFT_TOKENS } = require('../../../lib/core/resolve-lift');
const { CLAIM_TOKENS } = require('../../../lib/core/resolve-claim');
const { CARDS_TOKENS } = require('../../../lib/core/resolve-cards');
const { COLOR_MODE_TOKENS } = require('../../../lib/core/color-mode');

const classOf = (tag) => (tag.match(/\sclass="([^"]*)"/) || ['', ''])[1].split(/\s+/);
const modsOf = (tag) => ((tag.match(/\sdata-split-mods="([^"]*)"/) || ['', ''])[1] || '').split(/\s+/).filter(Boolean);
const BACKDROP = '<div class="backdrop" aria-hidden="true"><i class="backdrop-mask"></i></div>';

describe('core: which registers ride a split page', () => {
  // Read off each register's OWN list, so a value added to a register is covered without an
  // edit here — and a register that should ride but is missing from the kernel fails by name.
  const riding = {
    mode: MODE_TOKENS, stamp: STAMP_STYLE_TOKENS, tone: TONE_STYLE_TOKENS,
    spectrum: spectrum.SPECTRUM_TOKENS, 'spectrum-edge': spectrum.SPECTRUM_EDGE_TOKENS,
    'spectrum-card': spectrum.SPECTRUM_CARD_TOKENS, 'spectrum-card-edge': spectrum.SPECTRUM_CARD_EDGE_TOKENS,
    'spectrum-trim': spectrum.SPECTRUM_TRIM_TOKENS, corners: CORNERS_TOKENS, guards: GUARDS_TOKENS,
    rule: RULE_TOKENS, eyebrow: EYEBROW_TOKENS, 'inline-code': INLINE_CODE_TOKENS,
    headline: HEADLINE_TOKENS, lift: LIFT_TOKENS,
  };

  test('every token of every surface register rides', () => {
    const missing = Object.entries(riding).flatMap(([reg, list]) =>
      list.filter((t) => !isSurfaceRegisterToken(t)).map((t) => `${reg}:${t}`));
    assert.deepEqual(missing, []);
  });

  test('the finish axis rides whole — compositor, preset and opt-out', () => {
    for (const t of ['finish', 'finish-atrium', 'finish-my-saved-one', 'finish-none']) {
      assert.ok(isSurfaceRegisterToken(t), t);
    }
    // The Studio specimen is not a finish (resolve-finish.js), and must not activate one.
    assert.equal(isSurfaceRegisterToken('finish-preview'), false);
  });

  test('the two LAYOUT registers stay behind, and so does everything that is not a register', () => {
    for (const t of [...CLAIM_TOKENS, ...CARDS_TOKENS, 'checklist', 'content', 'cat-3', 'compact', 'form']) {
      assert.equal(isSurfaceRegisterToken(t), false, t);
    }
    // The canvas axis rides too, but through its own list — the two sets must stay disjoint so
    // neither can be edited to shadow the other.
    for (const t of COLOR_MODE_TOKENS) assert.equal(isSurfaceRegisterToken(t), false, t);
  });
});

describe('core: roleOpenTag keeps the surface registers across the class swap', () => {
  const tag = '<section id="s1" class="split-panel cat-3 finish finish-atrium stamp-seal corners-rounded claim-hero cards-top dark form" data-lattice-slide="4">';
  const out = roleOpenTag(tag, 'content split-panel-split split-panel-cover form', true, 'cover', 'split-panel');

  test('the finish and the other surface registers ride as CLASSES', () => {
    const cls = classOf(out);
    for (const t of ['finish', 'finish-atrium', 'stamp-seal', 'corners-rounded', 'dark']) assert.ok(cls.includes(t), `${t} missing: ${cls.join(' ')}`);
    assert.ok(cls.includes('split-panel-cover'), 'the role class still replaces the layout');
    assert.ok(!cls.includes('split-panel'), 'the layout token is still the class being replaced');
  });

  test('they are NOT also stamped as data — one channel per token', () => {
    const mods = modsOf(out);
    for (const t of ['finish', 'finish-atrium', 'stamp-seal', 'corners-rounded']) assert.ok(!mods.includes(t), `${t} in data: ${mods}`);
  });

  test('the layout registers stay behind as data, like any other authored modifier', () => {
    const cls = classOf(out);
    assert.ok(!cls.includes('claim-hero') && !cls.includes('cards-top'), cls.join(' '));
    assert.deepEqual(modsOf(out).sort(), ['cards-top', 'cat-3', 'claim-hero']);
  });
});

describe('core: the backdrop wrapper', () => {
  const LOGO = '<img class="deck-logo" src="l.svg" alt="" aria-hidden="true">';

  test('lands first on a finish section, and not at all on a plain one', () => {
    assert.equal(applyBackdropToHtml('<section class="a finish"><p>x</p></section>'), `<section class="a finish">${BACKDROP}<p>x</p></section>`);
    assert.equal(applyBackdropToHtml('<section class="a"><p>x</p></section>'), '<section class="a"><p>x</p></section>');
  });

  test('lands AFTER a leading deck logo, so the logo stays the first child', () => {
    const out = applyBackdropToHtml(`<section class="a finish">${LOGO}<p>x</p></section>`);
    assert.equal(out, `<section class="a finish">${LOGO}${BACKDROP}<p>x</p></section>`);
  });

  test('is idempotent with and without a logo — no second wrapper', () => {
    for (const s of [`<section class="a finish">${BACKDROP}<p>x</p></section>`, `<section class="a finish">${LOGO}${BACKDROP}<p>x</p></section>`]) {
      assert.equal(applyBackdropToHtml(s), s);
    }
  });

  test('whitespace between the tag, the logo and the wrapper does not read as unwrapped', () => {
    for (const s of [`<section class="a finish">\n${BACKDROP}<p>x</p></section>`, `<section class="a finish">\n${LOGO}\n${BACKDROP}<p>x</p></section>`]) {
      assert.equal(applyBackdropToHtml(s), s);
    }
  });

  test('a preset alone implies the compositor class', () => {
    assert.match(applyBackdropToHtml('<section class="a finish-atrium"><p></p></section>'), /class="a finish-atrium finish"><div class="backdrop"/);
  });
});

describe('core: a split run of a finish deck is finished on EVERY page', () => {
  const cap = { cards: { axis: 'item', hard: 4 } };
  const list = (n) => `<ul>${Array.from({ length: n }, (_, i) => `<li>item ${i + 1}</li>`).join('')}</ul>`;
  const doc = `<section data-lattice-slide="1" class="cards finish finish-atrium form">${BACKDROP}<h2>T</h2>${list(3)}</section>`;
  const { html, changed } = splitDoc(doc, cap);
  const pages = html.split(/(?=<section\b)/).filter((p) => p.startsWith('<section'));

  test('the cover and every body page carry the finish class and exactly one wrapper', () => {
    assert.equal(changed, 1);
    assert.equal(pages.length, 4, 'cover + three bodies');
    for (const p of pages) {
      const open = p.match(/^<section\b[^>]*>/)[0];
      assert.ok(classOf(open).includes('finish-atrium'), `no finish: ${open}`);
      assert.equal((p.match(/class="backdrop"/g) || []).length, 1, `backdrop count on ${open}`);
      assert.ok(p.slice(open.length).startsWith(BACKDROP), `the wrapper is not the first child: ${open}`);
    }
    assert.match(pages[0], /data-split-role="cover"/);
  });

  test('a deck with no finish gets no wrapper — the re-application is not a stamp', () => {
    const plain = splitDoc(`<section data-lattice-slide="1" class="cards form"><h2>T</h2>${list(3)}</section>`, cap).html;
    assert.ok(!/class="backdrop"/.test(plain));
  });
});
