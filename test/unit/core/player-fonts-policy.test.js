const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { subsetEmbeddedFonts } = require('../../../lib/export/player-fonts.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const b64 = fs.readFileSync(path.join(ROOT, 'assets', 'fonts', 'outfit-400.woff2')).toString('base64');
const html = `<style id="lattice-embedded-fonts">@font-face{font-family:'Outfit';font-weight:400;src:url(data:font/woff2;base64,${b64}) format('woff2');}</style><p>Hello</p>`;

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

test('system drops only the engine faces: KaTeX stays, and slide text that looks like a rule is untouched', async () => {
  const katex = "@font-face{font-family:KaTeX_Main;src:url(data:font/woff2;base64," + b64 + ") format('woff2');}";
  const rule = "@font-face { font-family: Brand; src: url(brand.woff2); }";
  const page = html.replace('</style>', katex + '</style>').replace('<p>Hello</p>', `<p>Write <code>${rule}</code> in your sheet.</p>`);
  const out = await subsetEmbeddedFonts(page, { text: 'system', emoji: 'system' });
  assert.ok(out.html.includes('KaTeX_Main'), 'math keeps its faces');
  assert.ok(!out.html.includes("font-family:'Outfit'"), 'the engine face is gone');
  assert.ok(out.html.includes(rule), 'slide text is not a font rule');
});
