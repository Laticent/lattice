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
});
