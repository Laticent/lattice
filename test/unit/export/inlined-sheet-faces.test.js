/**
 * `dropCoveredSheetFaces` — the inlined-stylesheet font fix, and the scanner under it.
 *
 * THE DEFECT IT PINS. A stylesheet's relative `url()` resolves against THE STYLESHEET.
 * `dist/lattice.css` is authored that way — `url('fonts/<file>.woff2')`, correct beside
 * the `dist/fonts/` the build writes — and the export INLINES the sheet into the deck
 * document instead of linking it, which silently rebases those urls onto the OUTPUT
 * directory. Measured on a real sidecar before the fix: 74 declared faces, 37 `loaded`
 * + 37 `error`, every error an `ERR_FILE_NOT_FOUND`.
 *
 * It painted correctly anyway — each doomed face has a working twin (the base64 block,
 * or KaTeX's `<link>`) and Chromium falls back within the family group. So the RENDERED
 * OUTPUT was never the signal, and could not be: these assertions and the request count
 * are.
 *
 * WHY SO MANY SCANNER CASES. The covered arm DELETES text. A wrong rule boundary
 * therefore loses real CSS and reports success — silently, exit 0. The first cut of this
 * function located rules with `indexOf` and was broken four ways by the HARD RULE #25
 * checker; every one of those inputs is below, by name, because they are the failure
 * mode this file exists to prevent rather than hypotheticals.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { dropCoveredSheetFaces, scanFontFaceRules } = require('../../../lib/fonts/face-css.js');

const face = (family, url) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:400;src:url('${url}') format('woff2');}`;
const drop = (css, covered = ['Outfit']) => dropCoveredSheetFaces(css, { covered });

describe('dropCoveredSheetFaces: what it removes', () => {
  test('a relative face whose family the document already supplies', () => {
    const css = `a{color:red}${face('Outfit', 'fonts/outfit-400.woff2')}b{color:blue}`;
    const r = drop(css);
    assert.equal(r.dropped, 1);
    assert.equal(r.css, 'a{color:red}b{color:blue}', 'spliced out, the rest untouched');
  });

  test('coverage matches case-insensitively — CSS family names are not case-sensitive', () => {
    const r = drop(face('JetBrains Mono', 'fonts/jetbrains-400.woff2'), ['jetbrains mono']);
    assert.equal(r.dropped, 1);
    assert.equal(r.css, '');
  });

  test('every rule is considered, not just the first — the real sheet has 37', () => {
    const css = [
      face('Outfit', 'fonts/outfit-400.woff2'),
      face('Outfit', 'fonts/outfit-700.woff2'),
      face('KaTeX_Main', 'fonts/KaTeX_Main-Regular.woff2'),
    ].join('');
    const r = drop(css, ['Outfit', 'KaTeX_Main']);
    assert.equal(r.dropped, 3);
    assert.equal(r.css, '');
  });
});

describe('dropCoveredSheetFaces: what it must never touch', () => {
  const unchanged = (label, css, covered = ['Outfit']) =>
    test(label, () => {
      const r = dropCoveredSheetFaces(css, { covered });
      assert.equal(r.dropped, 0);
      assert.equal(r.css, css, 'not one byte may move');
    });

  unchanged('a data: face — inlining does not change its meaning',
    "@font-face{font-family:'Outfit';src:url(data:font/woff2;base64,AAAA) format('woff2');}");
  unchanged('an absolute url', face('Outfit', 'https://cdn.example/x.woff2'));
  unchanged('a root-relative url', face('Outfit', '/abs/x.woff2'));
  unchanged('a local() face with no url at all',
    "@font-face{font-family:'Outfit';src:local('Outfit');}");
  unchanged('a relative face whose family nothing else supplies — still broken, not deleted',
    face('Author Sans', 'fonts/author.woff2'));
  unchanged('an empty covered list disables the pass entirely',
    face('Outfit', 'fonts/outfit-400.woff2'), []);
  unchanged('an `@font-face` written inside a CSS comment is prose, not a rule',
    `/* the build emits ${face('Outfit', 'fonts/x.woff2')} per face */`);
  unchanged('an `@font-face` inside a CSS STRING is not a rule',
    'p::after{content:"@font-face";font-family:Outfit;background:url("img/x.png")}KEEPME{color:red}');
  unchanged('an unterminated rule leaves the tail of the sheet alone',
    "a{color:red}@font-face{font-family:'Outfit';src:url('fonts/o.woff2')");
});

describe('dropCoveredSheetFaces: the four boundary bugs the checker found', () => {
  // Each of these silently LOST real CSS under the first `indexOf`-based scanner.
  test('a `}` inside a COMMENT does not end the rule', () => {
    const css = '@font-face{font-family:"Outfit";src:url("fonts/a.woff2")'
      + '/* TODO {see #123} */;font-display:swap}KEEP{color:red}';
    const r = drop(css);
    assert.equal(r.dropped, 1);
    assert.equal(r.css, 'KEEP{color:red}', 'previously left " */;font-display:swap}KEEP{color:red}"');
  });

  test('a `}` inside a STRING does not end the rule', () => {
    // The family really is `Outfit}` — a different family — so the rule is KEPT, and
    // the point is that the sheet after it survives. Under the old scanner this
    // truncated to `"}h1{color:red}`, and on a minified sheet the dangling quote opened
    // an unterminated string that swallowed everything after it.
    const css = '@font-face{src:url("fonts/x.woff2");font-family:"Outfit}"}h1{color:red}';
    const r = drop(css);
    assert.equal(r.css, css);
    assert.ok(scanFontFaceRules(css)[0].end === css.indexOf('h1{color:red}'), 'rule ends at the real brace');
  });

  test('a `font-family` mentioned in a COMMENT cannot make a face look covered', () => {
    // Deleted a face nothing supplied, so its text silently fell back.
    const css = '@font-face{/* mirrors font-family: Outfit; above */'
      + "font-family:'MyFont';src:url('f/a.woff2')}h1{color:red}";
    const r = drop(css);
    assert.equal(r.dropped, 0);
    assert.equal(r.css, css);
    assert.equal(scanFontFaceRules(css)[0].family, 'MyFont');
  });

  test('a url mentioned in a COMMENT cannot make a data: face look relative', () => {
    // Deleted a face that was already WORKING.
    const css = "@font-face{font-family:'Outfit';/* was url('fonts/o.woff2') */"
      + 'src:url(data:font/woff2;base64,AAAA)}h1{color:red}';
    const r = drop(css);
    assert.equal(r.dropped, 0);
    assert.equal(r.css, css);
    assert.equal(scanFontFaceRules(css)[0].hasRelativeUrl, false);
  });
});

describe('dropCoveredSheetFaces: scanner cases that used to MISS a rule', () => {
  test('a `/*` inside a string does not abort the whole pass', () => {
    // Previously read as a comment start with no terminator: `i` jumped to EOF and every
    // face in the sheet survived, 0 dropped, no warning.
    const css = `p::before{content:"/*"}${face('Outfit', 'fonts/x.woff2')}h1{color:red}`;
    const r = drop(css);
    assert.equal(r.dropped, 1);
    assert.equal(r.css, 'p::before{content:"/*"}h1{color:red}');
  });

  test('a comment between the at-keyword and its brace is legal CSS', () => {
    const css = "@font-face /*x*/ {font-family:Outfit;src:url('fonts/x.woff2')}h1{color:red}";
    assert.equal(drop(css).dropped, 1);
  });

  test('a parenthesis inside a quoted url does not truncate the url', () => {
    const css = `@font-face{font-family:Outfit;src:url("fonts/a(1).woff2")}h1{color:red}`;
    assert.equal(drop(css).dropped, 1);
  });

  test('an unterminated comment swallows the rest rather than corrupting it', () => {
    const css = `a{color:red}/* ${face('Outfit', 'fonts/o.woff2')}`;
    assert.equal(drop(css).css, css, 'nothing inside an open comment is a rule');
  });
});

describe('dropCoveredSheetFaces: against the real engine sheet', () => {
  const sheet = path.resolve(__dirname, '../../../dist/lattice.css');

  test('every relative face goes, and NOT ONE style rule is lost', () => {
    if (!fs.existsSync(sheet)) return; // pre-build tree
    const css = fs.readFileSync(sheet, 'utf8');
    const { TEXT_FACES } = require('../../../lib/fonts/text-faces.js');
    const katex = [...new Set(scanFontFaceRules(css).map((r) => r.family)
      .filter((f) => f?.startsWith('KaTeX_')))];
    const r = dropCoveredSheetFaces(css, {
      covered: [...new Set(TEXT_FACES.map((f) => f.family)), ...katex],
    });
    assert.ok(r.dropped >= 30, `expected the sheet's self-hosted block to go; dropped ${r.dropped}`);
    assert.equal(scanFontFaceRules(r.css).filter((x) => x.hasRelativeUrl).length, 0,
      'no relative-url @font-face may survive in the inlined copy');

    // THE PROOF THAT NOTHING ELSE MOVED, from a real CSS parser rather than this
    // module's own scanner — an independent oracle, since a scanner bug would otherwise
    // be checked by the buggy scanner. css-tree is an OPTIONAL dependency; skip if absent.
    let csstree;
    try { csstree = require('css-tree'); } catch { return; }
    const selectors = (t) => {
      const acc = [];
      csstree.walk(csstree.parse(t), (n) => { if (n.type === 'Rule') acc.push(csstree.generate(n.prelude)); });
      return acc;
    };
    const before = selectors(css);
    const after = selectors(r.css);
    assert.equal(after.length, before.length, 'a style rule was lost');
    assert.deepEqual(after, before, 'the style-rule selectors must be identical');
  });
});
