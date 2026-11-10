// The chart text ladder (lib/plugins/chart-family/shared/chart-roles.js): every text a chart prints plays one role,
// and on a page read on a phone each role has one size, weight, ink and case. This file is the role audit as a test,
// so the three places the ladder is written cannot drift apart:
//   - ROLE_PT, the sizes in phone pt, which the drawn kinds convert to their own units;
//   - the `--chart-role-*` cqi tokens the HTML kinds read (chart-family.styles.css § THE PHONE LADDER);
//   - CHART_TEXT_ROLES, the class-to-role map the stylesheet's role block is generated from.
// engineering/decisions/2026-11-03-responsive-tables.md § 32.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const roles = require(path.join(ROOT, 'lib/plugins/chart-family/shared/chart-roles'));
const { CHART_TEXT_ROLES } = require(path.join(ROOT, 'lib/plugins/chart-family/shared/chart-text-roles'));
const wc = require(path.join(ROOT, 'lib/plugins/chart-family/kinds/word-cloud/word-cloud.transform'));
const { run } = require(path.join(ROOT, 'lib/plugins/chart-family/chart-family.dispatch'));

const CSS = fs.readFileSync(path.join(ROOT, 'lib/plugins/chart-family/chart-family.styles.css'), 'utf8');
const BLOCK = CSS.slice(CSS.indexOf('/* ── THE PHONE LADDER: one style per ROLE'));

test('no role prints under the 11pt floor, and the ladder runs 11 to 13pt', () => {
  const sizes = Object.values(roles.ROLE_PT);
  assert.equal(Math.min(...sizes), 11);
  assert.equal(Math.max(...sizes), 13);
  assert.ok(wc.WC_STEPS_PT.every((pt) => pt >= 11), 'the smallest word cloud step is at the floor');
});

test('every --chart-role-* cqi token equals its ROLE_PT size', () => {
  const seen = new Set();
  for (const m of BLOCK.matchAll(/--chart-role-([a-z]+): calc\(([\d.]+) \* var\(--_sec-1cqi, 1cqi\)\);/g)) {
    assert.ok(m[1] in roles.ROLE_PT, `--chart-role-${m[1]} names no role`);
    assert.equal(Number(m[2]), roles.ptCqi(roles.ROLE_PT[m[1]]), `--chart-role-${m[1]}`);
    seen.add(m[1]);
  }
  assert.deepEqual([...seen].sort(), [...roles.ROLES].sort());
});

test('the stylesheet role block matches the role map, class for class', () => {
  // Each rule in the block opens with a `/* role */` comment and lists `section.<kind>… .chart-body …<class>`.
  const placed = new Map();
  let role = null;
  for (const line of BLOCK.split('\n')) {
    const head = /^\/\* ([a-z]+) \*\/$/.exec(line);
    if (head) { role = head[1]; continue; }
    const sel = /^section\.([a-z-]+):where\(.*\) \.chart-body (?:svg\[data-chart-roles\] )?\.?([a-z-]+)(?::not\(text, tspan\))?[,{ ]/.exec(line);
    if (sel && role && !line.includes('font-size')) {
      const key = `${sel[1]} ${sel[2]}`;
      if (!placed.has(key)) placed.set(key, role);
    }
  }
  const expected = new Map();
  for (const [kind, map] of Object.entries(CHART_TEXT_ROLES)) {
    if (kind === '_shared') continue;
    for (const [cls, r] of Object.entries(map)) if (r !== 'data') expected.set(`${kind} ${cls}`, r);
  }
  for (const [key, r] of expected) assert.equal(placed.get(key), r, `${key} is styled as ${placed.get(key)}, mapped ${r}`);
  for (const key of placed.keys()) assert.ok(expected.has(key), `${key} is styled but missing from chart-text-roles.js`);
});

test('a drawn chart on a phone page carries its role sizes; a landscape one draws as before', () => {
  const html = '<h2>Where the hours went.</h2><ul><li>Decks <code>46%</code></li><li>Meetings <code>22%</code></li>' +
    '<li>Realigning <code>18%</code></li><li>Deciding <code>14%</code></li></ul>';
  const ctx = (aspect) => ({ cls: 'piechart', classTokens: ['piechart'], orientation: aspect < 1 ? 'portrait' : undefined, aspect });
  const phone = run('piechart', html, ctx(1080 / 2340)).built;
  const out = typeof phone === 'string' ? phone : phone.html;
  assert.match(out, /<svg data-chart-roles[^>]*--chart-fs-key:/);
  const wide = run('piechart', html, ctx(16 / 9)).built;
  assert.doesNotMatch(typeof wide === 'string' ? wide : wide.html, /data-chart-roles/);
});

test('roleU hands back the fallback outside a ladder draw', () => {
  assert.equal(roles.roleU('key', 16), 16);
  assert.equal(roles.ptU(11, 7), 7);
  assert.equal(roles.rolesBoxU(), null);
});
