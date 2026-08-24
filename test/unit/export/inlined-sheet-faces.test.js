/**
 * `resolveInlinedSheetFaces` — the two arms of the inlined-stylesheet font fix.
 *
 * THE DEFECT IT PINS. A stylesheet's relative `url()` resolves against THE STYLESHEET.
 * `dist/lattice.css` is authored that way — `url('fonts/<file>.woff2')`, correct beside
 * the `dist/fonts/` the build writes — and the export INLINES the sheet into the deck
 * document instead of linking it, which silently rebases every one of those urls onto the
 * OUTPUT directory. Measured on a real sidecar before the fix: 74 declared faces, 37
 * `loaded` + 37 `error`, every error an `ERR_FILE_NOT_FOUND`.
 *
 * It painted correctly anyway, which is why it survived: each doomed face has a working
 * twin in the same document (the base64 block, or KaTeX's `<link>`), and Chromium falls
 * back within the family group. So the OUTPUT was never the signal — these unit assertions
 * and the request count are.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { resolveInlinedSheetFaces } = require('../../../lib/fonts/face-css.js');

const SHEET_DIR = path.resolve('/pkg/dist');
const face = (family, url) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:400;src:url('${url}') format('woff2');}`;

describe('resolveInlinedSheetFaces: the COVERED arm drops', () => {
  test('a relative face whose family the document already supplies is removed', () => {
    const css = `a{color:red}${face('Outfit', 'fonts/outfit-400.woff2')}b{color:blue}`;
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: ['Outfit'] });
    assert.equal(r.dropped, 1);
    assert.equal(r.rebased, 0);
    assert.equal(r.css, 'a{color:red}b{color:blue}', 'the rule is spliced out, the rest untouched');
  });

  test('coverage matches case-insensitively — CSS family names are not case-sensitive', () => {
    const css = face('JetBrains Mono', 'fonts/jetbrains-400.woff2');
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: ['jetbrains mono'] });
    assert.equal(r.dropped, 1);
    assert.equal(r.css, '');
  });

  test('every rule is considered, not just the first — the real sheet has 37', () => {
    const css = [
      face('Outfit', 'fonts/outfit-400.woff2'),
      face('Outfit', 'fonts/outfit-700.woff2'),
      face('KaTeX_Main', 'fonts/KaTeX_Main-Regular.woff2'),
    ].join('');
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: ['Outfit', 'KaTeX_Main'] });
    assert.equal(r.dropped, 3);
    assert.equal(r.css, '');
  });
});

describe('resolveInlinedSheetFaces: the UNCOVERED arm rebases', () => {
  test('a face nothing else supplies is rewritten onto the sheet’s own directory', () => {
    const css = face('Author Sans', 'fonts/author.woff2');
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: ['Outfit'] });
    assert.equal(r.dropped, 0);
    assert.equal(r.rebased, 1);
    const want = pathToFileURL(path.join(SHEET_DIR, 'fonts/author.woff2')).href;
    assert.ok(r.css.includes(`url(${want})`), `expected ${want} in:\n${r.css}`);
    assert.ok(!/url\('fonts\//.test(r.css), 'no relative url may survive');
  });

  test('a parent-relative url resolves through the sheet directory', () => {
    const css = face('Author Sans', '../assets/author.woff2');
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: [] });
    const want = pathToFileURL(path.resolve('/pkg/assets/author.woff2')).href;
    assert.ok(r.css.includes(`url(${want})`), `expected ${want} in:\n${r.css}`);
  });
});

describe('resolveInlinedSheetFaces: what it must NOT touch', () => {
  test('a data: face is left alone — inlining does not change its meaning', () => {
    const css = "@font-face{font-family:'Outfit';src:url(data:font/woff2;base64,AAAA) format('woff2');}";
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: ['Outfit'] });
    assert.equal(r.dropped, 0, 'a covered family is still kept when its src is already absolute');
    assert.equal(r.rebased, 0);
    assert.equal(r.css, css);
  });

  test('an absolute and a root-relative url are both left alone', () => {
    const css = face('A', 'https://cdn.example/x.woff2') + face('B', '/abs/x.woff2');
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: ['A', 'B'] });
    assert.equal(r.dropped, 0);
    assert.equal(r.rebased, 0);
    assert.equal(r.css, css);
  });

  test('an `@font-face` inside a CSS COMMENT is prose, not a rule', () => {
    // 4 of dist/lattice.css's 41 `@font-face` occurrences are inside comments. A plain
    // rule regex edits those too — corrupting the sheet this function exists to fix.
    const comment = "/* the build emits @font-face{font-family:'Outfit';src:url('fonts/x.woff2')} per face */";
    const css = `${comment}${face('Outfit', 'fonts/outfit-400.woff2')}`;
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: ['Outfit'] });
    assert.equal(r.dropped, 1, 'exactly the real rule');
    assert.equal(r.css, comment, 'the comment survives byte-for-byte');
  });

  test('an `@font-face` inside a CSS STRING never synthesizes a rule', () => {
    // The scanner pairs an at-keyword with the NEXT `{`…`}`. Without a whitespace test
    // between the two, `content: "@font-face"` pairs with an unrelated block; when that
    // bogus span happens to carry a `font-family` and a relative `url()` it is judged
    // covered and SPLICED OUT, taking real CSS with it. This exact input truncated the
    // sheet to `p::after{content:"` — everything after it silently lost.
    const css = 'p::after{content:"@font-face";font-family:Outfit;background:url("img/x.png")}KEEPME{color:red}';
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: ['Outfit'] });
    assert.equal(r.dropped, 0);
    assert.equal(r.rebased, 0);
    assert.equal(r.css, css, 'not one byte may move');
  });

  test('a bogus at-keyword does not hide the real rule that follows it', () => {
    const css = `p{content:"@font-face"}${face('Outfit', 'fonts/outfit-400.woff2')}z{color:blue}`;
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: ['Outfit'] });
    assert.equal(r.dropped, 1, 'the real rule is still found and dropped');
    assert.equal(r.css, 'p{content:"@font-face"}z{color:blue}');
  });

  test('an unterminated rule is left alone rather than half-spliced', () => {
    const css = "a{color:red}@font-face{font-family:'Outfit';src:url('fonts/o.woff2')";
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: ['Outfit'] });
    assert.equal(r.css, css);
    assert.equal(r.dropped, 0);
  });

  test('an unterminated comment swallows the rest rather than corrupting it', () => {
    const css = `a{color:red}/* ${face('Outfit', 'fonts/o.woff2')}`;
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: ['Outfit'] });
    assert.equal(r.css, css, 'nothing inside an open comment is a rule');
  });

  test('a rule with no relative url is never dropped, however covered its family', () => {
    const css = "@font-face{font-family:'Outfit';src:local('Outfit');}";
    const r = resolveInlinedSheetFaces(css, { sheetDir: SHEET_DIR, covered: ['Outfit'] });
    assert.equal(r.css, css);
  });
});

describe('resolveInlinedSheetFaces: against the real engine sheet', () => {
  test('dist/lattice.css loses every relative face when both suppliers are present', () => {
    const fs = require('node:fs');
    const sheet = path.resolve(__dirname, '../../../dist/lattice.css');
    if (!fs.existsSync(sheet)) return; // pre-build tree
    const { TEXT_FACES } = require('../../../lib/fonts/text-faces.js');
    const katex = [...new Set([...fs.readFileSync(sheet, 'utf8')
      .matchAll(/font-family\s*:\s*(KaTeX_[A-Za-z0-9]+)/g)].map((m) => m[1]))];
    const covered = [...new Set(TEXT_FACES.map((f) => f.family)), ...katex];
    const r = resolveInlinedSheetFaces(fs.readFileSync(sheet, 'utf8'), {
      sheetDir: path.dirname(sheet), covered,
    });
    assert.equal(r.rebased, 0, 'the engine sheet declares no face outside the two suppliers');
    assert.ok(r.dropped >= 30, `expected the sheet's self-hosted block to go; dropped ${r.dropped}`);
    assert.ok(
      !/@font-face[^{}]*\{[^{}]*url\(\s*['"]?fonts\//.test(r.css.replace(/\/\*[\s\S]*?\*\//g, '')),
      'no relative-fonts/ @font-face may survive in the inlined copy',
    );
  });
});
