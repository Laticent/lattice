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
