const test = require('node:test');
const assert = require('node:assert/strict');
const { describe } = test;
const { mulberry32 } = require('../../helpers/regex-differential');
const { assertLinearRegexes } = require('../../helpers/regex-trace');

test('a unicode-range face is fetched only for a slide that shows a character in its range', async () => {
  const { unusedRangeFaceUrls } = await import('../../../lib/core/slide-camera.mjs');
  const css = [
    "@font-face{font-family:'Noto Color Emoji';src:url(https://x.test/fonts/e0.woff2) format('woff2');unicode-range:U+1f1e6-1f1ff}",
    "@font-face{font-family:'Noto Color Emoji';src:url(https://x.test/fonts/e1.woff2) format('woff2');unicode-range:U+1f680, U+2705}",
    "@font-face{font-family:Outfit;src:url(https://x.test/fonts/o.woff2) format('woff2')}",
  ].join('\n');
  assert.deepEqual([...unusedRangeFaceUrls(css, 'plain text')].sort(), ['https://x.test/fonts/e0.woff2', 'https://x.test/fonts/e1.woff2']);
  assert.deepEqual([...unusedRangeFaceUrls(css, 'go \u{1F680}')], ['https://x.test/fonts/e0.woff2']);
  assert.deepEqual([...unusedRangeFaceUrls(css, '\u{1F1EB}\u{1F1F7} \u{2705}')], []);
});

test('withoutFontFaces drops every rule of the named family and keeps the rest', async () => {
  const { withoutFontFaces } = await import('../../../lib/core/slide-camera.mjs');
  const emoji = "@font-face{font-family:'Noto Color Emoji';src:url(https://x.test/e0.woff2) format('woff2');unicode-range:U+1f680}";
  const emojiBare = '@font-face{font-family:Noto Color Emoji;src:url(https://x.test/e1.woff2)}';
  const text = "@font-face{font-family:Outfit;src:url(https://x.test/o.woff2) format('woff2')}";
  const css = `${emoji}\n${text}\n${emojiBare}\nsection{font-family:Outfit,'Noto Color Emoji'}`;
  assert.equal(withoutFontFaces(css, ['Noto Color Emoji']), `\n${text}\n\nsection{font-family:Outfit,'Noto Color Emoji'}`);
  assert.equal(withoutFontFaces(css, ["'noto color emoji'"]).includes('e0.woff2'), false);
  assert.equal(withoutFontFaces(css, []), css, 'no family named: nothing changes');
  assert.equal(withoutFontFaces(css, ['']), css, 'an empty name matches nothing');
});

test('onlyUsedFontFaces keeps the faces of the families a slide draws with and drops the rest', async () => {
  const { onlyUsedFontFaces } = await import('../../../lib/core/slide-camera.mjs');
  const outfit = "@font-face{font-family:Outfit;src:url(data:font/woff2;base64,AAAA)}";
  const caveat = "@font-face{font-family:'Caveat';src:url(data:font/woff2;base64,BBBB)}";
  const emoji = "@font-face{font-family:\"Noto Color Emoji\";src:url(data:font/woff2;base64,CCCC);unicode-range:U+1f680}";
  const nameless = '@font-face{src:url(data:font/woff2;base64,DDDD)}';
  const css = `${outfit}\n${caveat}\n${emoji}\n${nameless}\nsection{color:red}`;
  assert.equal(onlyUsedFontFaces(css, new Set(['outfit', 'noto color emoji'])), `${outfit}\n\n${emoji}\n${nameless}\nsection{color:red}`);
  assert.equal(onlyUsedFontFaces(css, new Set()).includes('Outfit'), false, 'no family used: every named face goes');
});

test('onlyUsedFontFaces with no family list keeps every face', async () => {
  const { onlyUsedFontFaces } = await import('../../../lib/core/slide-camera.mjs');
  const css = "@font-face{font-family:Outfit;src:url(data:font/woff2;base64,AAAA)}";
  assert.equal(onlyUsedFontFaces(css, null), css);
});

test('pseudoElementFamilies resolves var() on the slide and reports what it cannot read', async () => {
  const { pseudoElementFamilies } = await import('../../../lib/core/slide-camera.mjs');
  const lookup = (name) => (name === '--font-label' ? ' "JetBrains Mono", monospace' : '');
  const viaVar = pseudoElementFamilies('.n::before{counter-increment:x;font-family:var(--font-label);content:counter(x)}', lookup);
  assert.deepEqual(viaVar, { families: ['"JetBrains Mono", monospace'], unresolved: false });
  const plain = pseudoElementFamilies('.a::before,.b::after{font-family:Outfit,serif}', lookup);
  assert.deepEqual(plain, { families: ['Outfit,serif'], unresolved: false });
  assert.equal(pseudoElementFamilies('.a::before{font-family:var(--nope)}', lookup).unresolved, true, 'a custom property the slide lacks');
  assert.equal(pseudoElementFamilies('.a::before{font:12px X}', lookup).unresolved, true, 'a font: shorthand');
  assert.deepEqual(pseudoElementFamilies('p{font-family:Outfit}', lookup), { families: [], unresolved: false }, 'a rule on an element is not a pseudo-element');
});

test('withoutDuplicateFaces drops a page face only when the host supplies the same face', async () => {
  const { withoutDuplicateFaces } = await import('../../../lib/core/slide-camera.mjs');
  const page = [
    '@font-face{font-family:Outfit;font-weight:400;src:url(data:x)}',
    '@font-face{font-family:Outfit;font-weight:700;src:url(data:y)}',
    '@font-face{font-family:Outfit;font-weight:400;font-stretch:75%;src:url(data:z)}',
  ].join('\n');
  const host = "@font-face{font-family:'Outfit';font-weight:400;src:url(data:h)}";
  assert.equal(withoutDuplicateFaces(page, host), '\n@font-face{font-family:Outfit;font-weight:700;src:url(data:y)}\n@font-face{font-family:Outfit;font-weight:400;font-stretch:75%;src:url(data:z)}');
  assert.equal(withoutDuplicateFaces(page, ''), page, 'no host faces: nothing changes');
});

test('pseudoElementFamilies reads every pseudo-element, not only ::before and ::after', async () => {
  const { pseudoElementFamilies } = await import('../../../lib/core/slide-camera.mjs');
  const lookup = (name) => (name === '--sketch-font' ? 'Caveat' : '');
  const css = [
    'li::marker{font-family:var(--sketch-font)}',
    'p::first-line{font-family:Hand !important}',
    'p::first-letter{font-family:Hand\\ Two}',
    '.a:before{font-family:Icons}',
    'p{font-family:Body}',
  ].join('\n');
  const { families, unresolved } = pseudoElementFamilies(css, lookup);
  assert.deepEqual(families.map((f) => f.trim()), ['Caveat', 'Hand', 'Hand Two', 'Icons']);
  assert.equal(unresolved, false);
});

test('urlSwap swaps each address once, longest first, and leaves $ in the replacement alone', async () => {
  const { urlSwap } = await import('../../../lib/core/slide-camera.mjs');
  assert.equal(urlSwap(new Map()), null, 'nothing to swap');
  const swap = urlSwap(new Map([
    ['https://x.test/a.png?a=1&b=2', 'data:image/png;base64,AAA$&'],
    ['https://x.test/a.png', 'data:image/png;base64,BBB'],
    ['https://x.test/gone.png', null],
  ]));
  assert.equal(
    swap('url(https://x.test/a.png?a=1&b=2) url("https://x.test/a.png") url(https://x.test/gone.png)'),
    'url(data:image/png;base64,AAA$&) url("data:image/png;base64,BBB") url(data:,)',
  );
});

test('the sheet scanners stay linear on a stylesheet that carries megabytes of base64 faces', async () => {
  const camera = await import('../../../lib/core/slide-camera.mjs');
  const face = (family, weight) => `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${'A'.repeat(1_500_000)}) format('woff2')}`;
  const css = [face('Outfit', 400), face('Playfair Display', 700), '.a::before{font-family:Icons}li::marker{font-family:var(--f)}', '@media (min-width:1px){.b::first-line{font-family:Hand}}', 'section{font-family:Outfit}'].join('\n');
  // No clock (HARD RULE #32): every regex these scans run must be one recheck calls linear (test/helpers/regex-trace.js).
  // The defect was a backtracking regex, which no count can see and a stopwatch sees only on a slow enough machine.
  // The `@font-face` and `var()` patterns that used to run here are polynomial; fontFaceRules and replaceVarRefs replaced them.
  const { result: pseudo } = assertLinearRegexes(() => camera.pseudoElementFamilies(css, () => 'Q'));
  assert.deepEqual(pseudo.families.map((f) => f.trim()), ['Icons', 'Q', 'Hand']);
  assert.equal(assertLinearRegexes(() => camera.onlyUsedFontFaces(css, new Set(['outfit']))).result.length, css.length - face('Playfair Display', 700).length);
  assert.equal(assertLinearRegexes(() => camera.withoutDuplicateFaces(css, face('Outfit', 400))).result.includes("font-family:'Outfit'"), false);
  assert.equal(assertLinearRegexes(() => camera.withoutFontFaces(css, ['Playfair Display'])).result.includes('Playfair'), false);
  assertLinearRegexes(() => camera.unusedRangeFaceUrls(css, 'plain text'));
});

describe('the linear scanners answer as the regexes they replaced (seeded differential fuzz, seed 3045)', () => {
  // The old patterns (tests are outside the census, which reads lib/** only). Both are recheck `polynomial`.
  const OLD_FACE = /@font-face\s*\{[^}]*\}/g;
  const OLD_VAR = /var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g;
  const draw = (rand, pieces, max) => {
    let s = '';
    const len = Math.floor(rand() * (max + 1));
    for (let i = 0; i < len; i++) s += pieces[Math.floor(rand() * pieces.length)];
    return s;
  };
  const FACE_PIECES = ['@font-face', '@font-face', '@font-fac', '{', '{', '}', '}', ' ', '\n', '\t', '\u00a0', 'a', ';', ':', 'x{', '@'];
  const VAR_PIECES = ['var(', 'var(', 'var', '(', ')', ')', ',', '--', '-', 'a', 'Z_9', ' ', '\t', '\n', '\u2028', '!', 'x'];

  test('fontFaceRules finds exactly the rules /@font-face\\s*\\{[^}]*\\}/g finds, over 20,000 draws', async () => {
    const { fontFaceRules } = await import('../../../lib/core/slide-camera.mjs');
    const rand = mulberry32(3045);
    for (let i = 0; i < 20000; i++) {
      const s = draw(rand, FACE_PIECES, 14);
      const want = [...s.matchAll(OLD_FACE)].map((m) => [m.index, m[0]]);
      assert.deepEqual(fontFaceRules(s).map((r) => [r.start, r.text]), want, JSON.stringify(s));
    }
  });

  test('replaceVarRefs rewrites exactly what the old var() replace rewrote, over 20,000 draws', async () => {
    const { replaceVarRefs } = await import('../../../lib/core/slide-camera.mjs');
    const rand = mulberry32(3045);
    for (let i = 0; i < 20000; i++) {
      const s = draw(rand, VAR_PIECES, 14);
      const seen = [];
      const want = s.replace(OLD_VAR, (_, name) => `<${name}>`);
      assert.equal(replaceVarRefs(s, (name) => (seen.push(name), `<${name}>`)), want, JSON.stringify(s));
      assert.deepEqual(seen, [...s.matchAll(OLD_VAR)].map((m) => m[1]), JSON.stringify(s));
    }
  });

  test('mutation arm: the trace fails a scan that still runs the old patterns', () => {
    // What the guard above would say about the code before the rewrite: both old patterns are in the census as polynomial.
    assert.throws(() => assertLinearRegexes(() => 'x@font-face{'.replace(OLD_FACE, '')), /polynomial|unknown|does not hold/);
    assert.throws(() => assertLinearRegexes(() => 'var(--a,'.replace(OLD_VAR, '')), /polynomial|unknown|does not hold/);
  });
});

test('the root rewrite re-points html, body and :root selectors and leaves CSS strings and comments as written', async () => {
  const { repointRootSelectors } = await import('../../../lib/core/slide-camera.mjs');
  const css = `html,body{margin:0} :root{--a:1} .x::before{content:" body "} /* body html */ .y::after{content:'html'} section body{color:red}`;
  assert.equal(
    repointRootSelectors(css),
    `.__lc-root,.__lc-body{margin:0} .__lc-root{--a:1} .x::before{content:" body "} /* body html */ .y::after{content:'html'} section .__lc-body{color:red}`,
  );
  assert.equal(repointRootSelectors(`.q::before{content:"a \\" body"}body{}`), `.q::before{content:"a \\" body"}body{}`.replace(/}body/, '}.__lc-body'), 'an escaped quote does not end the string');
});
