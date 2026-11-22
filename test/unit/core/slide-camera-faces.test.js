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

// The chat's `render_slide` look sends the camera ONE slide's faces (deck-export.js `rasterizeSlidePreview`). With only
// `withoutDuplicateFaces`, every other weight of a family in a font stack stayed in the page sheet, twice (the theme's
// `fonts/` rules and the preview's bundled ones), and the camera fetched and inlined all of them: 16 files, 765 KB, for a
// title slide that draws four faces. Counted in the addresses the camera would fetch, not in time (HARD RULE #32).
test('withoutHostFamilies leaves the camera no page face to fetch for a family the host carries, and keeps the rest', async () => {
  const { withoutHostFamilies, withoutDuplicateFaces, cssUrlSpans } = await import('../../../lib/core/slide-camera.mjs');
  const pageFace = (dir, family, weight, style = 'normal') => `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};src:url(https://x.test/${dir}/${family.replace(/ /g, '-')}-${weight}-${style}.woff2) format('woff2')}`;
  const page = [];
  for (const dir of ['themes/fonts', '_astro']) {
    for (const w of [300, 400, 500, 600, 700]) page.push(pageFace(dir, 'Outfit', w));
    page.push(pageFace(dir, 'Playfair Display', 400), pageFace(dir, 'Playfair Display', 400, 'italic'), pageFace(dir, 'Playfair Display', 700, 'italic'));
  }
  page.push(pageFace('katex', 'KaTeX_Main', 400), 'section{font-family:Outfit,KaTeX_Main}');
  const pageText = page.join('\n');
  // The look's sheet: the faces the slide draws, as data: URIs (font-embed.js `buildFamilyFontCss`).
  const host = ["@font-face{font-family:'Outfit';font-style:normal;font-weight:300;src:url(data:font/woff2;base64,AAAA)}", "@font-face{font-family:'Playfair Display';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,BBBB)}"].join('');
  const fetched = (css) => cssUrlSpans(css).filter((sp) => sp.value.startsWith('https:')).map((sp) => sp.value);
  // Vendored: the theme's copies and the bundled files (font-embed.js `isVendoredFontUrl`). KaTeX's file is not ours.
  const vendored = (u) => /\/(themes\/fonts|_astro)\//.test(u);
  assert.equal(fetched(pageText).length, 17);
  assert.equal(fetched(withoutDuplicateFaces(pageText, host)).length, 13, 'by key, only the two drawn faces leave, from each copy');
  assert.deepEqual(fetched(withoutHostFamilies(pageText, host, vendored)), ['https://x.test/katex/KaTeX_Main-400-normal.woff2'], 'by family, every vendored weight of a carried family leaves; KaTeX, which the host does not carry, stays');
  assert.ok(withoutHostFamilies(pageText, host, vendored).endsWith('section{font-family:Outfit,KaTeX_Main}'), 'the rest of the sheet is untouched');
  assert.equal(withoutHostFamilies(pageText, '', vendored), pageText, 'no host faces: nothing changes');
});

// What `withoutHostFamilies` must keep (the checker on this PR): the host's faces come from the slide's elements, so a
// face only an author file or a `::first-line` draws is not in it.
test('withoutHostFamilies keeps an author\'s own file under a vendored family name, and backs off on :first-line', async () => {
  const { withoutHostFamilies, withoutDuplicateFaces, cssUrlSpans } = await import('../../../lib/core/slide-camera.mjs');
  const vendored = (u) => u.includes('/themes/fonts/');
  const host = "@font-face{font-family:'Outfit';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,AAAA)}";
  const ours = "@font-face{font-family:'Outfit';font-style:normal;font-weight:700;src:url(https://x.test/themes/fonts/outfit-700.woff2) format('woff2')}";
  const author = "@font-face{font-family:'Outfit';font-style:normal;font-weight:800;src:url(https://author.test/outfit-black.woff2) format('woff2')}";
  const fetched = (css) => cssUrlSpans(css).filter((sp) => sp.value.startsWith('https:')).map((sp) => sp.value);
  assert.deepEqual(fetched(withoutHostFamilies(`${ours}\n${author}`, host, vendored)), ['https://author.test/outfit-black.woff2'], 'the vendored 700 leaves, the author\'s 800 stays');
  const mixed = "@font-face{font-family:'Outfit';font-weight:600;src:url(https://x.test/themes/fonts/outfit-600.woff2),url(https://author.test/o.woff2)}";
  assert.equal(fetched(withoutHostFamilies(mixed, host, vendored)).length, 2, 'a rule with any address of the author\'s stays whole');
  for (const rule of ['p::first-line{font-weight:700}', 'h1:first-letter{font-style:italic}']) {
    const page = `${ours}\n${author}\n${rule}`;
    assert.equal(withoutHostFamilies(page, host, vendored), withoutDuplicateFaces(page, host), `${rule}: every face withoutDuplicateFaces keeps stays`);
  }
});

// Every export takes the camera's old path: with the option unset the sheet is `withoutDuplicateFaces`, byte for byte, and
// only the chat's look passes the option (export bytes compared main against this branch: PDF, picture and editable PPTX).
test('pageFontSheet is withoutDuplicateFaces when hostFamilies is unset, and only the look passes the option', async () => {
  const { pageFontSheet, withoutDuplicateFaces } = await import('../../../lib/core/slide-camera.mjs');
  const page = ["@font-face{font-family:'Outfit';font-weight:400;src:url(https://x.test/themes/fonts/outfit-400.woff2)}", "@font-face{font-family:'Outfit';font-weight:700;src:url(https://x.test/themes/fonts/outfit-700.woff2)}", 'section{color:red}'].join('\n');
  const host = "@font-face{font-family:'Outfit';font-weight:400;src:url(data:font/woff2;base64,AAAA)}";
  for (const off of [undefined, null, false]) assert.equal(pageFontSheet(page, host, off), withoutDuplicateFaces(page, host));
  assert.notEqual(pageFontSheet(page, host, () => true), withoutDuplicateFaces(page, host), 'the predicate turns it on');
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../../../docs/src/components/studio/export/deck-export.js'), 'utf8');
  const shots = [...src.matchAll(/shootSection\(([^;]*?)\);?$/gm)].map((m) => m[1]);
  const passing = shots.filter((args) => args.includes('hostFamilies'));
  assert.equal(passing.length, 1, 'one shootSection call passes hostFamilies');
  const look = src.slice(src.indexOf('export async function rasterizeSlidePreview'));
  assert.ok(look.slice(0, look.indexOf('\n}\n')).includes(passing[0]), 'and it is the one in rasterizeSlidePreview');
  assert.equal((src.match(/hostFamilies/g) || []).length, 5, 'hostFamilies is named in shootSection (3) and rasterizeSlidePreview (2) only');
  for (const caller of ['lib/export/cli-camera.js', 'tools/build-pdf-compose.js']) {
    assert.equal(fs.readFileSync(path.join(__dirname, '../../..', caller), 'utf8').includes('hostFamilies'), false, `${caller} never sets it`);
  }
});

test('fontFaceFamilies names each family once, lower case and unquoted', async () => {
  const { fontFaceFamilies } = await import('../../../lib/core/slide-camera.mjs');
  const css = "@font-face{font-family:'Outfit';font-weight:400}@font-face{font-family:outfit;font-weight:700}@font-face{font-family:\"Noto Color Emoji\";src:url(x)}@font-face{src:url(y)}";
  assert.deepEqual(fontFaceFamilies(css), ['outfit', 'noto color emoji']);
  assert.deepEqual(fontFaceFamilies(''), []);
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
  // This sheet has a `::first-line` rule, so the by-family drop backs off and the 700 face stays; without the rule it goes.
  assert.equal(assertLinearRegexes(() => camera.withoutHostFamilies(css, face('Playfair Display', 400), () => true)).result.includes('Playfair'), true);
  const noFirstLine = css.replace('.b::first-line', '.b::after');
  assert.equal(assertLinearRegexes(() => camera.withoutHostFamilies(noFirstLine, face('Playfair Display', 400), () => true)).result.includes('Playfair'), false);
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
      assert.equal(
        replaceVarRefs(s, (name) => {
          seen.push(name);
          return `<${name}>`;
        }),
        want,
        JSON.stringify(s),
      );
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
