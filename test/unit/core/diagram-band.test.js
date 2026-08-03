/**
 * Unit: which band a slide's Mermaid diagram is baked for (lib/core/diagram-band.js).
 *
 * A Mermaid SVG bakes its colors to literal hex at render time, so the ink cannot
 * follow a later CSS restyle — while the chip underneath it is live, per-section
 * CSS. Ink and chip only agree if both halves resolve the band the same way, and
 * #1326 shipped four contrast regressions in a row (2.7:1, 1.28:1, 17.14:1 →
 * 1.55:1) that were all the two halves disagreeing. #1340 was the fifth.
 *
 * The regression this file exists for is #1340: deck-wide dark never reached a
 * diagram on a slide that named its own `_class:`. The emulator asked "did this
 * slide name ANY `_class:`?" instead of "did it name a COLOR-MODE token?", so
 * `_class: diagram` — the way essentially every component is selected — forced
 * light on a `color-mode: dark` deck. See the `#1340` describe block: it is the
 * non-vacuous one. Reverting the fix (swapping `slideNamesScheme` back for a
 * bare "any tokens at all" test) turns every case in it red.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolveDiagramBand, deckDarkBand, deckPrintBand } = require('../../../lib/core/diagram-band');
const { deckPrintBand: printBandFromColorMode } = require('../../../lib/core/resolve-color-mode');
const { COLOR_MODE_TOKENS } = require('../../../lib/core/color-mode');

/** Build a front-matter block from `key: value` lines. */
const fmOf = (...lines) => `---\n${['marp: true', 'theme: indaco', ...lines].join('\n')}\n---`;

/** The two spellings of a deck-wide color mode that must behave identically. */
const DECK_DARK_SPELLINGS = [
  ['color-mode: dark', fmOf('color-mode: dark')],
  ['class: dark', fmOf('class: dark')],
];

describe('resolveDiagramBand', () => {
  describe('#1340 — a slide that names a NON-scheme `_class:` inherits the deck', () => {
    // The regression table from the issue. Every row is a DARK deck; the only
    // variable is what the slide's own `_class:` names. Before the fix, every
    // row with a non-empty `_class:` resolved to `light`.
    const rows = [
      ['(no _class:)', '', 'dark'],
      ['diagram', 'diagram', 'dark'],
      ['piechart', 'piechart', 'dark'],
      // Multi-token component selections are the common real-world shape.
      ['diagram wide', 'diagram wide', 'dark'],
      // …and a slide MAY still pin its own scheme; rule 2 is not weakened.
      ['light', 'light', 'light'],
      ['dark', 'dark', 'dark'],
      ['diagram light', 'diagram light', 'light'],
      ['color-light', 'color-light', 'light'],
      ['print', 'print', 'print'],
    ];

    for (const [spelling, frontMatter] of DECK_DARK_SPELLINGS) {
      for (const [label, slideClass, expected] of rows) {
        test(`${spelling} + _class: ${label} → ${expected}`, () => {
          assert.equal(resolveDiagramBand({ frontMatter, slideClass }), expected);
        });
      }
    }
  });

  describe('deck-wide inheritance', () => {
    test('a light deck stays light on every slide', () => {
      const frontMatter = fmOf('color-mode: light');
      for (const slideClass of ['', 'diagram', 'diagram wide']) {
        assert.equal(resolveDiagramBand({ frontMatter, slideClass }), 'light');
      }
      // …and a slide that pins dark still goes dark.
      assert.equal(resolveDiagramBand({ frontMatter, slideClass: 'dark' }), 'dark');
    });

    test('`color-mode:` WINS over a leftover legacy `class:` alias', () => {
      // A half-migrated deck must not render light slides with dark-baked ink.
      assert.equal(resolveDiagramBand({ frontMatter: fmOf('color-mode: light', 'class: dark') }), 'light');
      assert.equal(resolveDiagramBand({ frontMatter: fmOf('color-mode: dark', 'class: light') }), 'dark');
    });

    test('system / inherited bake LIGHT — a static SVG cannot follow the OS or its host', () => {
      for (const value of ['system', 'inherited']) {
        assert.equal(resolveDiagramBand({ frontMatter: fmOf(`color-mode: ${value}`) }), 'light');
        assert.equal(resolveDiagramBand({ frontMatter: fmOf(`color-mode: ${value}`), slideClass: 'diagram' }), 'light');
      }
    });

    test('a raw `color-scheme: dark` in front matter is the last-resort dark signal', () => {
      assert.equal(resolveDiagramBand({ frontMatter: fmOf('style: "section { color-scheme: dark }"') }), 'dark');
    });

    test('no front matter at all → light', () => {
      assert.equal(resolveDiagramBand({}), 'light');
      assert.equal(resolveDiagramBand({ frontMatter: '', slideClass: 'diagram' }), 'light');
      assert.equal(resolveDiagramBand({ frontMatter: null, slideClass: null }), 'light');
    });
  });

  describe('print', () => {
    test('deck-wide print reaches a slide that pins its own scheme — print WINS over dark', () => {
      for (const frontMatter of [fmOf('color-mode: print'), fmOf('class: print')]) {
        assert.equal(resolveDiagramBand({ frontMatter }), 'print');
        assert.equal(resolveDiagramBand({ frontMatter, slideClass: 'diagram' }), 'print');
        assert.equal(resolveDiagramBand({ frontMatter, slideClass: 'dark' }), 'print');
        assert.equal(resolveDiagramBand({ frontMatter, slideClass: 'light' }), 'print');
      }
    });

    test('a per-slide `_class: print` beats a dark deck', () => {
      assert.equal(resolveDiagramBand({ frontMatter: fmOf('color-mode: dark'), slideClass: 'print' }), 'print');
      assert.equal(resolveDiagramBand({ frontMatter: fmOf('color-mode: dark'), slideClass: 'diagram print' }), 'print');
    });

    test('the engine --print flag prints a deck whose front matter says nothing', () => {
      assert.equal(resolveDiagramBand({ frontMatter: fmOf(), flagPrint: true }), 'print');
      assert.equal(resolveDiagramBand({ frontMatter: fmOf('color-mode: dark'), flagPrint: true }), 'print');
    });

    test('`printable` is not `print` — deck-wide OR per-slide', () => {
      assert.notEqual(resolveDiagramBand({ frontMatter: fmOf('class: printable') }), 'print');
      assert.notEqual(resolveDiagramBand({ frontMatter: fmOf(), slideClass: 'printable' }), 'print');
      // Whole-token membership, so a hyphenated neighbour is not a match either —
      // a `\bprint\b` regex WOULD fire on this one.
      assert.notEqual(resolveDiagramBand({ frontMatter: fmOf(), slideClass: 'print-safe' }), 'print');
    });
  });

  describe('parsing edge cases', () => {
    test('quoted front-matter values resolve', () => {
      assert.equal(resolveDiagramBand({ frontMatter: fmOf('color-mode: "dark"') }), 'dark');
      assert.equal(resolveDiagramBand({ frontMatter: fmOf("color-mode: 'print'") }), 'print');
      assert.equal(resolveDiagramBand({ frontMatter: fmOf('class: "lifted dark"') }), 'dark');
    });

    test('a deck `class:` LIST carries its color token', () => {
      assert.equal(resolveDiagramBand({ frontMatter: fmOf('class: lifted dark paginate') }), 'dark');
      assert.equal(resolveDiagramBand({ frontMatter: fmOf('class: lifted print') }), 'print');
    });

    test('CRLF front matter resolves the same as LF', () => {
      const crlf = fmOf('color-mode: dark').replace(/\n/g, '\r\n');
      assert.equal(resolveDiagramBand({ frontMatter: crlf }), 'dark');
      assert.equal(resolveDiagramBand({ frontMatter: crlf, slideClass: 'diagram' }), 'dark');
      const crlfPrint = fmOf('class: print').replace(/\n/g, '\r\n');
      assert.equal(resolveDiagramBand({ frontMatter: crlfPrint }), 'print');
    });

    test('slide class tokens split on any whitespace, including newlines and tabs', () => {
      assert.equal(resolveDiagramBand({ frontMatter: fmOf(), slideClass: '  diagram\tdark \n' }), 'dark');
      assert.equal(resolveDiagramBand({ frontMatter: fmOf('color-mode: dark'), slideClass: '   ' }), 'dark');
    });

    test('BODY prose that merely contains the words does not set the band', () => {
      // The caller may hand over a full deck source; only the front-matter block
      // may speak. A slide that talks ABOUT dark mode is not a dark slide.
      const source = `${fmOf()}\n\n## We print this deck in dark rooms\n\nclass: dark is not front matter here.\n`;
      assert.equal(resolveDiagramBand({ frontMatter: source }), 'light');
    });

    test('a full deck source resolves the same as its front-matter slice', () => {
      const fm = fmOf('color-mode: dark');
      const source = `${fm}\n\n# Title\n\n---\n\n## Second slide\n`;
      assert.equal(resolveDiagramBand({ frontMatter: source }), resolveDiagramBand({ frontMatter: fm }));
    });
  });

  describe('the contract itself', () => {
    test('every COLOR_MODE_TOKENS member counts as the slide naming its own scheme', () => {
      // The guard here and the deck-class propagation guard
      // (`slideHasOwnColorMode`) must agree on the SAME token list, or a token
      // the propagator suppresses would still be inherited by the bake. Each
      // token pins a band that does NOT follow the dark deck it sits on.
      const darkDeck = fmOf('color-mode: dark');
      for (const token of COLOR_MODE_TOKENS) {
        const band = resolveDiagramBand({ frontMatter: darkDeck, slideClass: token });
        const expected = token === 'dark' ? 'dark' : token === 'print' ? 'print' : 'light';
        assert.equal(band, expected, `_class: ${token} on a dark deck must bake ${expected}`);
      }
    });

    test('only ever returns one of the three bands', () => {
      const bands = new Set();
      for (const fm of ['', fmOf(), fmOf('color-mode: dark'), fmOf('class: print')]) {
        for (const slideClass of ['', 'diagram', 'dark', 'light', 'print', 'diagram dark']) {
          bands.add(resolveDiagramBand({ frontMatter: fm, slideClass }));
        }
      }
      assert.deepEqual([...bands].sort(), ['dark', 'light', 'print']);
    });

    test('deckPrintBand is RE-EXPORTED, not re-implemented — one spelling of the print test', () => {
      assert.equal(deckPrintBand, printBandFromColorMode);
    });

    test('deckDarkBand answers the deck half on its own', () => {
      assert.equal(deckDarkBand(fmOf('color-mode: dark')), true);
      assert.equal(deckDarkBand(fmOf('class: dark')), true);
      assert.equal(deckDarkBand(fmOf('color-mode: light')), false);
      assert.equal(deckDarkBand(fmOf()), false);
      assert.equal(deckDarkBand(''), false);
    });
  });
});
