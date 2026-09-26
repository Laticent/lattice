/**
 * The preset picker's pictures still show what each preset sets.
 *
 * docs/public/presets/<name>.webp are rendered once and committed
 * (tools/build-preset-thumbs.mjs). Change a preset in lib/core/front-matter-key.js — or the
 * sample slide — without re-running the tool, and the picker would show the author the OLD
 * look under the new name. The tool records a hash of both; this recomputes it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { PRESET_NAMES } = require(path.join(ROOT, 'lib/core/front-matter-key.js'));
const { presetThumbHash } = require(path.join(ROOT, 'tools/lib/preset-thumbs.cjs'));
const recorded = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/scripts/preset-thumbs-sources.json'), 'utf8'));

test('every preset has a committed thumbnail', () => {
  for (const name of PRESET_NAMES) {
    assert.ok(fs.existsSync(path.join(ROOT, 'docs/public/presets', `${name}.webp`)), `missing docs/public/presets/${name}.webp — run node tools/build-preset-thumbs.mjs`);
  }
  assert.deepEqual(recorded.presets, [...PRESET_NAMES]);
});

test('the thumbnails were cut from the current preset table and sample slide', () => {
  assert.equal(recorded.hash, presetThumbHash(), 'a preset or the sample slide changed since the thumbnails were rendered — run node tools/build-preset-thumbs.mjs');
});
