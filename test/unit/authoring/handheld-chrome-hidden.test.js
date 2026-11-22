/**
 * Unit: `handheld-chrome-hidden` (lib/authoring/lint-core.js `findHandheldChromeHidden`), the owner's 2026-11-22 ask.
 *
 * A square, portrait or story deck reads at the phone venue unless it names another, and a phone page hides the deck's
 * running header and footer text (stage.css HANDHELD CHROME). A deck that writes `footer:` or `header:` lost that line
 * on every page with no word. The rule names it as INFO and never blocks.
 *
 *   FIRES      a portrait deck with `footer:` and no venue; `venue: phone` / `tablet`; header and footer named together
 *   QUIET      a 16:9 deck, a room venue (`laptop`), the deck class `with-footer`, a deck with neither key
 *
 * FALSIFIABLE: without the rule every FIRES case reports nothing.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core');
const { buildVocab } = require('../../../lib/authoring/lint');

const vocab = buildVocab();
const deck = (fm) => `---\ntheme: indaco\n${fm}\n---\n\n<!-- _class: content -->\n\n## A slide\n\nBody text here.\n`;
const found = (fm) => core.lintTextWith(deck(fm), vocab).filter((f) => f.rule === 'handheld-chrome-hidden');

test('FIRES: a portrait deck with a footer and no venue gets one info finding that names the line and the fix', () => {
  const f = found('size: portrait\nfooter: Source: internal ticket system');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'info');
  assert.equal(f[0].slide, 0);
  assert.equal(f[0].line, 'footer:');
  assert.match(f[0].fix, /venue: laptop/);
  assert.match(f[0].fix, /with-footer/);
});

test('FIRES: a handheld venue named outright, and header and footer together in one finding', () => {
  assert.equal(found('size: story\nfooter: Q3\nvenue: tablet').length, 1);
  const both = found('size: square\nheader: Confidential\nfooter: Q3\nvenue: phone');
  assert.equal(both.length, 1);
  assert.match(both[0].message, /footer and header/);
  assert.match(both[0].fix, /with-footer with-header/);
});

test('QUIET: a 16:9 deck, a room venue, the with- class, and a deck with neither key', () => {
  assert.equal(found('footer: Q3').length, 0, '16:9 keeps its chrome');
  assert.equal(found('size: portrait\nfooter: Q3\nvenue: laptop').length, 0);
  assert.equal(found('size: portrait\nfooter: Q3\nvenue: hall').length, 0);
  assert.equal(found('size: portrait\nfooter: Q3\nclass: with-footer').length, 0);
  assert.equal(found('size: portrait').length, 0);
});

test('QUIET for the half the class brings back: with-footer leaves only the header named', () => {
  const f = found('size: portrait\nheader: Confidential\nfooter: Q3\nclass: with-footer');
  assert.equal(f.length, 1);
  assert.equal(f[0].classToken, 'header');
});
