/**
 * Unit: the composed surfaces a COMPONENT paints, in both cascade orders.
 *
 * `test/unit/palette/theme-surface-aa.test.js` runs `tools/contrast-audit.js`'s
 * PAIRS — an ink against the two opaque canvases a palette declares. This runs
 * `tools/composed-contrast.js`'s SURFACES: the same inks on the surfaces
 * components actually build out of them — a 12% tint OF THE SAME TOKEN
 * (`redline`'s ins/del band, `checklist`'s state rows, `kpi`'s status pill,
 * `policy-recommendation`'s stance badge), that band on a second own-hue card,
 * and the OKLab ramp stops the BASE derives from a palette's `--seq-500` anchor
 * (`word-cloud spectrum`'s word fills).
 *
 * Born from #1640. Five brand palettes' redline runs and the word-cloud spectrum
 * on onyx / concrete / the four a11y palettes fell sub-threshold the moment the
 * palette wins the cascade (#1527) — and every gate in the repo stayed green,
 * because contrast-audit checks each ink against `--bg` and never against the
 * `-bg` mix a component paints it on.
 *
 * If REGRESSION fails: a palette's own curated value is below its bar AND worse
 * than the base default it overrides, on a surface a component composes. Re-tune
 * the palette's arm (hue kept, moved along the OKLab lightness axis) until it
 * clears — solve against the BAND, which moves with the value. Do not delete the
 * surface.
 *
 * If UNLISTED / DEGRADED fails: a change added a sub-threshold composed pair, or
 * made an existing one worse. Fix the cause. The baseline is a record of a tracked
 * backlog (#1697, #1698), not a place to park new defects.
 *
 * If STALE fails: a pair in the baseline now passes. Delete its line — that is how
 * the backlog shrinks.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  auditAll, listAllThemes, SURFACES, KNOWN_SUB_THRESHOLD, MODES,
} = require('../../../tools/composed-contrast.js');

const themes = listAllThemes();
const res = auditAll(themes);
const show = (r) => `${r.key}  ${r.ratio.toFixed(2)}:1 (need ${r.surface.min})`;

describe('composed-surface contrast (tools/composed-contrast.js)', () => {
  test('the surface catalog still describes rules that exist', () => {
    assert.deepEqual(res.evidence, [],
      `the catalog has drifted from the CSS it models:\n  ${res.evidence.join('\n  ')}`);
  });

  test('every surface resolves on every theme — an unresolved pair is not a pass', () => {
    const miss = res.unresolved.map((r) => `${r.key} — ${r.surface.ctx}`);
    assert.deepEqual(miss, [],
      `unresolved composed surfaces (extend the resolver, do not drop the pair):\n  ${miss.join('\n  ')}`);
  });

  test('no palette override is below its bar AND worse than the base default', () => {
    const bad = res.regressions.map(
      (r) => `${r.key}  base ${r.baseRatio.toFixed(2)} -> ${r.ratio.toFixed(2)}:1 `
        + `(need ${r.surface.min})\n      ${r.surface.ctx}`,
    );
    assert.deepEqual(bad, [],
      `${bad.length} composed surface(s) regress when the palette wins the cascade:\n  ${bad.join('\n  ')}`);
  });

  test('no NEW sub-threshold composed pair', () => {
    const bad = res.unlisted.map(show);
    assert.deepEqual(bad, [],
      `${bad.length} composed pair(s) are below their bar and not in KNOWN_SUB_THRESHOLD.\n  `
      + `${bad.join('\n  ')}\n\nFix the cause. A scaffolded palette inherits indaco's own rows — `
      + 'those are tracked in #1697 / #1698 and are the two arms to re-tune first.');
  });

  test('no already-failing pair gets worse', () => {
    const bad = res.degraded.map((r) => `${r.key}  ${r.frozen.toFixed(2)} -> ${r.ratio.toFixed(2)}:1`);
    assert.deepEqual(bad, [],
      `${bad.length} composed pair(s) were already below their bar and are now worse:\n  ${bad.join('\n  ')}`);
  });

  test('the baseline carries no stale entry', () => {
    assert.deepEqual(res.stale, [],
      `${res.stale.length} KNOWN_SUB_THRESHOLD entr(y|ies) no longer fail — delete them from `
      + `tools/composed-contrast.js:\n  ${res.stale.join('\n  ')}`);
  });

  test('coverage: every theme × mode × surface is scored', () => {
    assert.equal(res.rows.length, themes.length * MODES.length * SURFACES.length);
    assert.ok(themes.length >= 30, `only ${themes.length} themes scanned — the theme scan is broken`);
    assert.ok(KNOWN_SUB_THRESHOLD.size > 0, 'the frozen baseline is empty — did it get truncated?');
  });
});
