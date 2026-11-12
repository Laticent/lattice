// `glyphScanText` (lib/fonts/glyph-scan-text.js) drops the bulk of each base64 run before the export's glyph scans
// read a document. Every scan must answer exactly as it does on the full text: the emoji slices (`slicesFor`, which
// now applies it itself, so the oracle here is the slices of the FULL text read the old way, through a run-free copy
// of the same characters) and the icon scan (`drawsIconGlyphs`). The documents are built to hit the edges: a run
// ending in `+class=` before the attribute's quote, an emoji or a keycap mark right after a run, digits at a
// run's end, references and escapes beside one. Seeded (HARD RULE #32).
const test = require('node:test');
const assert = require('node:assert/strict');
const { glyphScanText } = require('../../../lib/fonts/glyph-scan-text.js');
const { drawsIconGlyphs } = require('../../../lib/fonts/icon-fallback.js');
const { slicesFor } = require('../../../lib/fonts/emoji-faces.js');

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

test('the scans answer the same on the full text and on the scan text', () => {
  const seed = 31;
  let x = seed;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const run = (n) => Array.from({ length: n }, () => B64[Math.floor(rand() * B64.length)]).join('');
  const tails = ['', '9', '+class=', '/class=', 'x+class=', '1'];
  const after = ['"', '"️', '⃣', '🚀', '" class="lat-icon-glyph"', '" alt="lat-icon-glyph x"', ')', '&#x1F680;', '\\1F600 '];
  const before = ['<img src="data:image/png;base64,', "<section class='lat-pill-glyph' style=\"background:url(data:image/png;base64,", 'url(data:font/woff2;base64,', '<section><p>☀️</p><img src="data:image/jpeg;base64,'];
  let n = 0;
  for (const pre of before) for (const tail of tails) for (const post of after) for (const len of [0, 5, 17, 300]) {
    const doc = `${pre}${run(len)}${tail}${post}</section>`;
    const scanned = glyphScanText(doc);
    assert.equal(drawsIconGlyphs(scanned), drawsIconGlyphs(doc), `icon scan, seed ${seed}, case ${n}: ${JSON.stringify(doc.slice(-60))}`);
    // `slicesFor` applies the same reduction inside; compare it to the slices of a copy with the run's bulk spelled
    // out as plain letters that are not base64-introduced, so the old full-text walk reads every character.
    const unprefixed = doc.replace(/;base64,/g, ';b64x,');
    assert.deepEqual(slicesFor(doc), slicesFor(unprefixed), `emoji scan, seed ${seed}, case ${n}`);
    n++;
  }
  assert.ok(n > 800);
});

test('a photo-sized run shrinks to its header and last 16 characters', () => {
  const doc = `<img src="data:image/png;base64,${'QUJD'.repeat(400000)}">`;
  assert.equal(glyphScanText(doc), `<img src="data:image/png;base64,${'QUJD'.repeat(4)}">`);
  assert.equal(glyphScanText('no runs here'), 'no runs here');
});
