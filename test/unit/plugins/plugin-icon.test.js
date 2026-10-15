// A plugin's mark (spec/LPM.md §3.1 `icon`): path data in the manifest, drawn by
// lib/plugins/plugin-icon.mjs. The renderer is the one place the data becomes markup, so it must
// emit nothing a plugin chose but path numbers, and refuse anything else rather than pass it on.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '../../../lib/plugins');
const load = () => import('../../../lib/plugins/plugin-icon.mjs');
const ok = { viewBox: '0 0 128 128', paths: [{ ink: 'line', d: 'M0 0L10 10', width: 4 }, { ink: 'fill', d: 'M1 1H5V5Z' }] };

test('draws each path with its ink class, theme-colored and decorative', async () => {
  const { pluginIconSvg } = await load();
  const svg = pluginIconSvg(ok, { size: 40, className: 'x-mark' });
  assert.match(svg, /^<svg class="plugin-icon x-mark" viewBox="0 0 128 128" width="40" height="40" aria-hidden="true" focusable="false">/);
  assert.match(svg, /<path class="plugin-icon-line" d="M0 0L10 10" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"\/>/);
  assert.match(svg, /<path class="plugin-icon-fill" d="M1 1H5V5Z"\/>/);
  assert.doesNotMatch(svg, /fill="#|stroke="#|style=/, 'no color or style comes from the plugin');
});

test('refuses anything that is not path numbers, rather than escaping it', async () => {
  const { pluginIconSvg, isPluginIcon } = await load();
  const bad = [
    null,
    {},
    { ...ok, viewBox: '0 0 128 128" onload="x' },
    { ...ok, paths: [] },
    { ...ok, paths: [{ ink: 'line', d: 'M0 0"/><script>alert(1)</script><path d="' }] },
    { ...ok, paths: [{ ink: 'red', d: 'M0 0L1 1' }] },
    { ...ok, paths: [{ ink: 'line', d: 'M0 0L1 1', width: 99 }] },
    { ...ok, paths: Array.from({ length: 25 }, () => ({ ink: 'line', d: 'M0 0L1 1' })) },
    // As strict as the schema: no coercion, no unknown keys, no holes.
    { ...ok, viewBox: ['0 0 128 128'] },
    { ...ok, paths: [{ ink: ['fill'], d: 'M0 0L1 1' }] },
    { ...ok, color: 'red' },
    { ...ok, paths: [{ ink: 'line', d: 'M0 0L1 1', style: 'x' }] },
    // biome-ignore lint/suspicious/noSparseArray: the hole is the case under test
    { ...ok, paths: [, { ink: 'line', d: 'M0 0L1 1' }] },
    { ...ok, paths: [{ ink: 'line', d: 'M1e2 0' }] },
  ];
  for (const icon of bad) {
    assert.equal(isPluginIcon(icon), false, JSON.stringify(icon));
    assert.equal(pluginIconSvg(icon), '');
  }
  // A class name the host passes is held to a plain identifier too.
  assert.doesNotMatch(pluginIconSvg(ok, { className: '"><b>' }), /<b>/);
});

test('every shipped author-facing plugin carries a well-formed icon', async () => {
  const { isPluginIcon } = await load();
  // The six the website's Plugins hub introduces; chart-family and anima are internal.
  for (const name of ['math', 'mermaid', 'icons', 'avatars', 'function-plot', 'code']) {
    const file = join(ROOT, name, `${name}.manifest.json`);
    assert.ok(existsSync(file), file);
    const { icon } = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(isPluginIcon(icon), `${name}: icon is missing or malformed`);
  }
  // And no manifest carries a malformed one.
  for (const dir of readdirSync(ROOT, { withFileTypes: true })) {
    const file = join(ROOT, dir.name, `${dir.name}.manifest.json`);
    if (!dir.isDirectory() || !existsSync(file)) continue;
    const { icon } = JSON.parse(readFileSync(file, 'utf8'));
    if (icon !== undefined) assert.ok(isPluginIcon(icon), `${dir.name}: malformed icon`);
  }
});
