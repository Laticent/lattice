/**
 * Unit: test/fixtures/chart-finish-baseline.json — the FROZEN reference tools/chart-finish-reach.mjs
 * measures every chart finish against (its header says why it is frozen and not live).
 *
 * The tool needs Chrome and a few minutes, so it is not a unit test. What CAN be pinned here, cheaply and
 * on every run, is the file itself: that it exists, that it covers every theme in both modes it names (so a
 * new theme cannot ship without a reference), and that its numbers are plausible contrast ratios. A theme
 * added without `node tools/chart-finish-reach.mjs --all-themes --freeze` fails here, on purpose.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/chart-finish-baseline.json'), 'utf8'));

// The same list the tool sweeps with `--all-themes`.
const themes = fs.readdirSync(path.join(ROOT, 'themes'))
  .filter((d) => fs.existsSync(path.join(ROOT, 'themes', d, `${d}.css`)) && d !== 'a11y-base');

describe('chart-finish baseline (frozen unfinished heatmap contrast)', () => {
  test('says what it is and how to rewrite it', () => {
    assert.match(baseline.note, /FROZEN|frozen/);
    assert.match(baseline.note, /--freeze/);
    assert.deepEqual([...baseline.modes].sort(), ['dark', 'light', 'print']);
  });

  test('covers every theme in every mode it names, so a new theme cannot ship without a reference', () => {
    const missing = [];
    for (const t of themes) for (const m of baseline.modes) if (!baseline.entries[`${t}/${m}`]) missing.push(`${t}/${m}`);
    assert.deepEqual(missing, [], `re-freeze: node tools/chart-finish-reach.mjs --all-themes --freeze (missing ${missing.join(', ')})`);
  });

  test('holds no entry for a theme that is gone', () => {
    const known = new Set(themes);
    const stale = Object.keys(baseline.entries).filter((k) => !known.has(k.split('/')[0]));
    assert.deepEqual(stale, []);
  });

  test('every number is a believable contrast ratio, and a heatmap text run clears the 4.5:1 floor on the shipped paint', () => {
    for (const [key, v] of Object.entries(baseline.entries)) {
      assert.ok(v.topVsEmpty >= 1 && v.topVsEmpty <= 21, `${key} topVsEmpty ${v.topVsEmpty}`);
      assert.ok(v.heatmapText >= 4.5 && v.heatmapText <= 21, `${key}: the shipped heatmap text is ${v.heatmapText}:1`);
    }
  });
});
