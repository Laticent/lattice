// The standalone chart-SVG export (tools/lib/chart-font-embed.js) mirrors the engine's text faces by hand.
// It went stale once: the `typography:` set faces were missing, so a chart in Inter fell back to a system
// face. These pins tie the mirror to the one manifest, lib/fonts/text-faces.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { FACES, FONT_DIR, buildChartFontFaceCss } = require('../../../tools/lib/chart-font-embed.js');
const { TEXT_FACES, faceKey } = require('../../../lib/fonts/text-faces.js');

test('the chart-SVG mirror carries every engine text face, and each file exists', () => {
  const have = new Set(FACES.map((f) => faceKey(f.family, f.weight, f.style)));
  for (const f of TEXT_FACES) assert.ok(have.has(faceKey(f.family, f.weight, f.style)), `missing ${faceKey(f.family, f.weight, f.style)}`);
  for (const f of FACES) assert.ok(fs.existsSync(path.join(FONT_DIR, f.file)), `no file ${f.file}`);
});

test("a set face keeps the manifest's size-adjust; a face without one emits none", () => {
  assert.match(buildChartFontFaceCss(['Inter']), /size-adjust:87%/);
  assert.match(buildChartFontFaceCss(['Barlow Condensed']), /size-adjust:110%/);
  assert.doesNotMatch(buildChartFontFaceCss(['Outfit', 'Newsreader']), /size-adjust/);
});
