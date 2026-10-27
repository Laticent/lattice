const test = require('node:test');
const assert = require('node:assert/strict');

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
  const timed = (fn) => {
    const t = Date.now();
    const out = fn();
    return [out, Date.now() - t];
  };
  const [pseudo, tPseudo] = timed(() => camera.pseudoElementFamilies(css, () => 'Q'));
  assert.deepEqual(pseudo.families.map((f) => f.trim()), ['Icons', 'Q', 'Hand']);
  assert.ok(tPseudo < 500, `pseudoElementFamilies took ${tPseudo} ms on a 3 MB sheet (a backtracking regex took 44 s on 300 KB)`);
  const [, tPrune] = timed(() => camera.onlyUsedFontFaces(css, new Set(['outfit'])));
  const [, tDup] = timed(() => camera.withoutDuplicateFaces(css, face('Outfit', 400)));
  const [, tOmit] = timed(() => camera.withoutFontFaces(css, ['Playfair Display']));
  const [, tRange] = timed(() => camera.unusedRangeFaceUrls(css, 'plain text'));
  for (const [name, ms] of Object.entries({ onlyUsedFontFaces: tPrune, withoutDuplicateFaces: tDup, withoutFontFaces: tOmit, unusedRangeFaceUrls: tRange })) assert.ok(ms < 500, `${name} took ${ms} ms on a 3 MB sheet`);
});
