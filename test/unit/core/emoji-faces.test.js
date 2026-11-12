const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EMOJI_SLICES, slicesFor } = require('../../../lib/fonts/emoji-faces.js');
const { emojiFaceCss } = require('../../../lib/fonts/face-css.js');

const ROOT = path.join(__dirname, '..', '..', '..');

test('plain text, digits and symbols need no emoji slice', () => {
  assert.deepEqual(slicesFor('Plan 2026 #1 (c) (R) TM → ←'), []);
  assert.deepEqual(slicesFor(''), []);
});

test('an emoji names only the slices that cover it', () => {
  const rocket = slicesFor('🚀');
  assert.ok(rocket.length >= 1 && rocket.length < EMOJI_SLICES.length);
  assert.deepEqual(slicesFor('🇫🇷'), ['noto-color-emoji-0']);
  assert.ok(slicesFor('1️⃣').includes('noto-color-emoji-2'));
});

test('a joiner or selector alone does not pull in the font', () => {
  assert.deepEqual(slicesFor('‍️⃣'), []);
});

test('every slice is on disk and the emoji sheet inlines only the needed ones', () => {
  for (const { file } of EMOJI_SLICES) assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'fonts', `${file}.woff2`)), file);
  assert.equal(emojiFaceCss(ROOT, 'no emoji here'), '');
  const css = emojiFaceCss(ROOT, '🇫🇷');
  assert.equal((css.match(/@font-face/g) || []).length, 1);
  assert.match(css, /font-family:'Noto Color Emoji'/);
  assert.match(css, /unicode-range:U\+1f1e6-1f1ff/);
  assert.match(css, /format\('woff2'\) tech\(color-COLRv1\)/, 'a renderer without COLR v1 must skip the face, not draw an empty box');
});

test('dist/lattice.css declares every slice with the COLR v1 guard', () => {
  const css = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
  const rules = css.match(/@font-face\{font-family:'Noto Color Emoji'[^}]*\}/g) || [];
  assert.equal(rules.length, EMOJI_SLICES.length);
  for (const r of rules) assert.match(r, /tech\(color-COLRv1\)/);
});

test('a numeric character reference is the emoji it spells', () => {
  assert.deepEqual(slicesFor('&#x1F1EB;&#x1F1F7;'), ['noto-color-emoji-0']);
  assert.deepEqual(slicesFor('&#127467;&#127479;'), ['noto-color-emoji-0']);
  assert.deepEqual(slicesFor('&#x41; &amp; &#0;'), []);
});

test('a CSS escape names the slices of the emoji it spells, as a pseudo-element would draw it', () => {
  assert.deepEqual(slicesFor('h1::after{content:" \\1F680"}'), slicesFor('\u{1F680}'));
  assert.deepEqual(slicesFor('h1::before{content:"\\201C"} a\\:b{}'), [], 'a quote mark or an escaped colon needs no emoji slice');
});

// The scan is a native regex now, not an array of every code point (a Webpage export hands it a 33 MB document of
// photo base64; 2026-11-11-deferred-asset-bytes.md §4). It must name exactly the slices the array walk named. The
// oracle below is that walk, verbatim; the inputs are seeded (HARD RULE #32: the seed is printed on failure) and
// mix ASCII, symbols around U+2190, selectors, keycaps, joiners, tags, flags, lone surrogates and references.
test('the regex scan names exactly the slices the code-point walk named', () => {
  const parsed = EMOJI_SLICES.map((s) => ({ ...s, ranges: s.range.split(',').map((r) => { const [a, b] = r.trim().slice(2).split('-'); const lo = Number.parseInt(a, 16); return [lo, b ? Number.parseInt(b, 16) : lo]; }) }));
  const oracle = (text) => {
    const need = new Set();
    const ref = (m, cp) => (cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m);
    const spelled = String(text || '').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (m, hex, dec) => ref(m, Number.parseInt(hex || dec, hex ? 16 : 10))).replace(/\\([0-9a-f]{1,6})/gi, (m, hex) => ref(m, Number.parseInt(hex, 16)));
    const cps = Array.from(spelled, (c) => c.codePointAt(0));
    const marks = new Set([0x200d, 0xfe0f, 0x20e3]);
    for (let i = 0; i < cps.length; i++) {
      const cp = cps[i];
      if (marks.has(cp) || (cp >= 0xe0000 && cp <= 0xe007f)) continue;
      const next = cps[i + 1];
      if (cp < 0x2190 && next !== 0xfe0f && next !== 0x20e3) continue;
      for (const s of parsed) if (s.ranges.some(([lo, hi]) => cp >= lo && cp <= hi)) need.add(s.file);
    }
    return EMOJI_SLICES.map((s) => s.file).filter((f) => need.has(f));
  };
  const pieces = ['a', 'Z', '9', '#', ' ', '\n', '→', '←', '←', '↏', '©', '™', '️', '⃣', '‍', '\u{e0067}', '\u{e007f}', '🚀', '🇫', '🇷', '👍🏽', '❤', '☀', '1', '\ud83d', '\ude00', '&#x1F680;', '&#128512;', '\\1F600', '&#0;', 'iVBORw0KGgo+/=='];
  const seed = 20261111;
  let x = seed;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  for (let n = 0; n < 4000; n++) {
    let s = '';
    const len = 1 + Math.floor(rand() * 12);
    for (let k = 0; k < len; k++) s += pieces[Math.floor(rand() * pieces.length)];
    assert.deepEqual(slicesFor(s), oracle(s), `seed ${seed}, case ${n}: ${JSON.stringify(s)}`);
  }
});

test('a document of photo base64 is scanned without an array per character', () => {
  const doc = `<p>Hi 🚀</p><img src="data:image/png;base64,${'iVBORw0KGgo+/=='.repeat(500000)}">`;
  // 7.5 MB of base64: the walk built 7.5 million numbers here. The answer is the rocket's slice and only that.
  assert.deepEqual(slicesFor(doc), slicesFor('🚀'));
});
