const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { subsetColorFont } = require('../../../lib/fonts/subset-color.js');

const slice = (n) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'assets', 'fonts', `noto-color-emoji-${n}.woff2`));

test('one emoji out of a slice keeps its color tables and a few KB', async () => {
  const full = slice(5);
  const out = await subsetColorFont(full, '\u{1F680}');
  assert.ok(out.length < 6000, `${out.length} bytes`);
  assert.ok(out.length < full.length / 20);
  // A woff2 stores its table directory compressed; the TrueType form lists COLR and CPAL as plain tags.
  const ttf = await require('fontverter').convert(out, 'truetype');
  const tags = [];
  for (let i = 0; i < ttf.readUInt16BE(4); i++) tags.push(ttf.toString('latin1', 12 + i * 16, 16 + i * 16));
  assert.ok(tags.includes('COLR') && tags.includes('CPAL'), tags.join(','));
});

test('a flag keeps working from the regional-indicator slice', async () => {
  const out = await subsetColorFont(slice(0), '\u{1F1EB}\u{1F1F7}');
  assert.ok(out.length < 6000, `${out.length} bytes`);
});

test('the player cuts an emoji slice to the deck on exact and keeps it whole on used', async () => {
  const { subsetEmbeddedFonts } = require('../../../lib/export/player-fonts.js');
  const { EMOJI_SLICES } = require('../../../lib/fonts/emoji-faces.js');
  const row = EMOJI_SLICES[5];
  const b64 = slice(5).toString('base64');
  const html = `<style>@font-face{font-family:'Noto Color Emoji';src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${row.range};}</style><p>\u{1F680}</p>`;
  const exact = await subsetEmbeddedFonts(html, { text: 'used', emoji: 'exact' });
  assert.ok(exact.html.length < html.length / 10, `${exact.html.length} of ${html.length}`);
  const used = await subsetEmbeddedFonts(html, { text: 'used', emoji: 'used' });
  assert.ok(used.html.includes(b64), 'used keeps the slice whole');
});
