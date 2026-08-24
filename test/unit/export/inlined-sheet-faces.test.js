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
  test('an UNBALANCED `}` inside a COMMENT does not end the rule', () => {
    // UNBALANCED on purpose. The first version of this test used `/* TODO {see #123} */`,
    // whose braces are balanced — so `depth` went 1→2→1 and the case passed even with
    // comment-awareness deleted from the brace matcher. It was green for the wrong reason,
    // which a mutation run proved. This input is the one that actually kills that mutant.
    const css = '@font-face{font-family:"Outfit";src:url("fonts/a.woff2")'
      + '/* TODO see } #123 */;font-display:swap}KEEP{color:red}';
    const r = drop(css);
    assert.equal(r.dropped, 1);
    assert.equal(r.css, 'KEEP{color:red}', 'a wrong boundary leaves " #123 */;font-display:swap}KEEP…"');
  });

  test('a BALANCED brace pair inside a comment is also survivable', () => {
    const css = '@font-face{font-family:"Outfit";src:url("fonts/a.woff2")'
      + '/* TODO {see #123} */;font-display:swap}KEEP{color:red}';
    assert.equal(drop(css).css, 'KEEP{color:red}');
  });

  test('a real nested `{}` in the body is matched, not mistaken for the end', () => {
    const css = '@font-face{font-family:Outfit;src:url(fonts/o.woff2);x:{a:b}}h1{color:red}';
    assert.equal(drop(css).css, 'h1{color:red}');
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

describe('dropCoveredSheetFaces: the boundary bugs the SECOND checker found', () => {
  // The rewrite that closed the first four claimed "every ambiguity resolves toward
  // KEEPING the rule". These two were still counter-examples, and both DELETE real CSS.
  test('a backslash-escaped `}` is an identifier character, not a terminator', () => {
    // `font-feature-settings:x\}` is legal CSS. Chromium confirmed the loss: the h1 rule
    // went from rgb(255,0,0) to the UA default after the drop.
    const css = '@font-face{font-family:Outfit;src:url(fonts/o.woff2);'
      + 'font-feature-settings:x\\};font-display:swap}h1{color:red}';
    const r = drop(css);
    assert.equal(r.dropped, 1);
    assert.equal(r.css, 'h1{color:red}', 'previously left ";font-display:swap}h1{color:red}"');
  });

  test('a `}` inside an UNQUOTED url() is a url-token code point, not a terminator', () => {
    const css = "@font-face{font-family:'Outfit';src:url('fonts/o.woff2');-x:url(a}b)}h1{color:red}";
    const r = drop(css);
    assert.equal(r.dropped, 1);
    assert.equal(r.css, 'h1{color:red}', 'previously left "b)}h1{color:red}"');
  });

  test('a REPEATED font-family descriptor is last-wins, as in CSS', () => {
    // No exotic syntax needed — duplicated declarations are ordinary in concatenated
    // sheets. Reading the FIRST match deleted a face declaring a family nothing supplies.
    const css = "@font-face{font-family:'Outfit';font-family:'MyFont';src:url('fonts/my.woff2')}h1{c:red}";
    const r = drop(css);
    assert.equal(r.dropped, 0, 'the face really declares MyFont, which is not covered');
    assert.equal(r.css, css);
    assert.equal(scanFontFaceRules(css)[0].family, 'MyFont');
  });

  test('an unquoted at-keyword LOOK-ALIKE is not paired with the next block', () => {
    // What the whitespace/comment gap test actually guards. The quoted `content:"@font-face"`
    // case is handled by the top-level string skip and never reaches it.
    const css = '@font-face-legacy{font-family:Outfit;src:url("fonts/x.woff2")}h1{color:red}';
    assert.equal(scanFontFaceRules(css).length, 0);
    assert.equal(drop(css).css, css);
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

const sheetPath = path.resolve(__dirname, '../../../dist/lattice.css');

describe('dropCoveredSheetFaces: against the real engine sheet', () => {
  const sheet = sheetPath;

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

describe('the css-tree span guard', () => {
  // WHY THIS EXISTS. The scanner above is hand-rolled and its worst failure is a wrong rule
  // boundary: the drop arm then splices out a span ending mid-rule, deleting real CSS and
  // reporting success. Two independent reviews each found a live instance of exactly that.
  // Rather than keep naming inputs, every span is now second-opinioned by a real parser
  // before it is removed — anything that is not exactly one whole `@font-face` is KEPT.
  //
  // Honest scope: differentially fuzzing the scanner against css-tree over 80 adversarial
  // inputs found 0 mis-spans and 10 misses, all in the safe direction. So this is a net for
  // the unknown, not a fix for a known bug, and its own live risk is a FALSE refusal —
  // which costs the perf win rather than the CSS. Both directions are pinned below.
  const { spanValidator } = require('../../../lib/fonts/face-css.js');

  test('accepts exactly one whole @font-face rule', () => {
    const ok = spanValidator();
    assert.equal(ok(face('Outfit', 'fonts/o.woff2')), true);
    assert.equal(ok('@font-face{font-family:Outfit;src:url(fonts/o.woff2);x:y\\}}'), true,
      'a backslash-escaped brace is still one whole rule');
  });

  test('rejects the three shapes a MIS-SCAN produces', () => {
    const ok = spanValidator();
    assert.equal(ok('@font-face{font-family:Outfit;src:url(fonts/o.woff2)'), false,
      'truncated — no closing brace');
    assert.equal(ok('@font-face{font-family:Outfit}h1{color:red'), false,
      'rule plus the head of the next one');
    assert.equal(ok('@font-face{font-family:Outfit}h1{color:red}'), false,
      'rule plus a whole second rule');
    assert.equal(ok(''), false, 'nothing at all');
  });

  test('rejects a span that is not a font-face at all', () => {
    assert.equal(spanValidator()('@media screen{p{a:b}}'), false);
  });

  test('does NOT refuse any real rule in the engine sheet — the false-positive risk', () => {
    if (!fs.existsSync(sheetPath)) return;
    const css = fs.readFileSync(sheetPath, 'utf8');
    const { TEXT_FACES } = require('../../../lib/fonts/text-faces.js');
    const katex = [...new Set(scanFontFaceRules(css).map((r) => r.family)
      .filter((f) => f?.startsWith('KaTeX_')))];
    const covered = [...new Set(TEXT_FACES.map((f) => f.family)), ...katex];
    const guarded = dropCoveredSheetFaces(css, { covered, validate: true });
    const plain = dropCoveredSheetFaces(css, { covered, validate: false });
    assert.equal(guarded.refused, 0, 'the guard must not reject a legitimate rule');
    assert.equal(guarded.dropped, plain.dropped, 'guarded and unguarded must agree');
    assert.equal(guarded.css, plain.css, 'byte-identical either way');
  });

  test('a refusal KEEPS the rule rather than dropping it, and is counted', () => {
    // The wiring test. No natural input reaches the refusal path (0 mis-spans in the fuzz),
    // so a stub predicate is the only way to prove the guard is actually consulted —
    // without it, deleting the guard leaves every other test in this file green.
    const css = `a{color:red}${face('Outfit', 'fonts/o.woff2')}b{color:blue}`;
    const refusing = dropCoveredSheetFaces(css, { covered: ['Outfit'], validate: () => false });
    assert.equal(refusing.dropped, 0, 'a refused span must not be removed');
    assert.equal(refusing.refused, 1, 'and the refusal must be reported, not swallowed');
    assert.equal(refusing.css, css, 'not one byte moves when the guard refuses');

    const accepting = dropCoveredSheetFaces(css, { covered: ['Outfit'], validate: () => true });
    assert.equal(accepting.dropped, 1, 'the same input drops when the guard accepts');
    assert.equal(accepting.refused, 0);
  });
});
