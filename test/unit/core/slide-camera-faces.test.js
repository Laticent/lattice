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
