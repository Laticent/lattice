const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { subsetEmbeddedFonts } = require('../../../lib/export/player-fonts.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const b64 = fs.readFileSync(path.join(ROOT, 'assets', 'fonts', 'outfit-400.woff2')).toString('base64');
const html = `<style>@font-face{font-family:'Outfit';font-weight:400;src:url(data:font/woff2;base64,${b64}) format('woff2');}</style><p>Hello</p>`;

test('exact cuts a text face to the characters shown', async () => {
  const out = await subsetEmbeddedFonts(html, { text: 'exact', emoji: 'exact' });
  assert.ok(out.applied);
  assert.ok(out.html.length < html.length * 0.7, `${out.html.length} of ${html.length}`);
});

test('used and full keep a text face whole, so edited text keeps every glyph', async () => {
  for (const text of ['used', 'full']) {
    const out = await subsetEmbeddedFonts(html, { text, emoji: 'exact' });
    assert.ok(out.html.includes(b64), text);
  }
});

test('system drops the text faces and nothing else', async () => {
  const out = await subsetEmbeddedFonts(html, { text: 'system', emoji: 'exact' });
  assert.ok(!out.html.includes('@font-face'));
  assert.ok(out.html.includes('<p>Hello</p>'));
});

test('without a policy it cuts like exact (the old behavior)', async () => {
  const out = await subsetEmbeddedFonts(html);
  assert.ok(out.html.length < html.length * 0.7);
});
