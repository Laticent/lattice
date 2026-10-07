/**
 * The chart frame's stylesheet is the chart family plugin's `styles` contribution, bundled in the
 * plugin slot of dist/lattice.css in the resolver's dependency order (lib/plugins/styles.generated.js).
 * Its place among the other plugins' sheets is therefore decided by a sort, not by a reviewed line in
 * tools/build-css.js — so a tie between two plugin sheets would be settled silently. Phase F measured
 * zero computed-style change when the sheet moved into the slot (plugin-system note §11); this pins
 * the property that kept it zero: no OTHER plugin's sheet styles the chart frame or a chart class.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const { PLUGIN_STYLE_SOURCES } = require('../../../lib/plugins/styles.generated.js');

test('the chart family\'s sheet is in the plugin slot, and no other plugin sheet selects the chart frame', () => {
  const own = 'lib/plugins/chart-family/chart-family.styles.css';
  assert.ok(PLUGIN_STYLE_SOURCES.includes(own), `${own} is not in the plugin slot`);
  const others = PLUGIN_STYLE_SOURCES.filter((f) => f !== own);
  assert.ok(others.length >= 1, 'no other plugin sheet to check — the arm would pass vacuously');
  for (const f of others) {
    const css = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const hits = css.match(/\.chart-(?:frame|body|key|status)\b[^{]*\{/g) || [];
    assert.deepEqual(hits, [], `${f} selects the chart frame; its order against chart-family.styles.css is decided by the resolver's sort, not by review`);
  }
});
