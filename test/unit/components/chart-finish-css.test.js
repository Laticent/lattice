/**
 * The generated chart-finish rules (tools/build-chart-finish-css.js). Pins the properties the
 * generator's header argues for, so a later edit cannot quietly undo one:
 *
 *   - every rule is `section|figure.chart-finish-X :where(…)` — (0,1,1) — so an a11y theme's
 *     texture fill, which is `!important` at (0,3,1) and loads later, always wins;
 *   - the status table agrees with the manifests on which marks carry text;
 *   - a ramp mixes toward its OWN member's empty end, never through a fallback chain;
 *   - no percentage sits inside light-dark(), which takes colors only.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { build, STATUS_MARKS } = require('../../../tools/build-chart-finish-css');
const { loadAll } = require('../../../lib/components');

const OUT = path.join(__dirname, '../../../lib/components/chart/_chart-family/chart-finish.generated.css');
const css = build();

/** Every rule's selector list, one entry per selector. */
const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)]
  .flatMap((m) => m[1].split(/,\n/).map((s) => s.trim()).filter(Boolean));

describe('chart-finish.generated.css', () => {
  test('the committed file is what the generator writes', () => {
    assert.equal(fs.readFileSync(OUT, 'utf8'), css, 'run `node tools/build-chart-finish-css.js`');
  });

  test('every selector is a finish head over a :where() mark — specificity (0,1,1)', () => {
    assert.ok(selectors.length > 100);
    for (const s of selectors) {
      assert.match(s, /^(section|figure)\.chart-finish-(pigment|etching|tone) :where\(.+\)$/, s);
    }
  });

  test('every declaration is !important — member paint arrives as inline url() fills', () => {
    const decls = [...css.matchAll(/^\s+([a-z-]+):[^;]*;$/gm)].map((m) => m[0]);
    assert.ok(decls.length > 100);
    for (const d of decls) assert.match(d, /!important;$/, d);
  });

  test('light-dark() never carries a bare percentage', () => {
    for (const m of css.matchAll(/light-dark\(([^;]*)\)/g)) {
      // Each argument must be a whole color (a color-mix / oklch / var), never "40%".
      assert.doesNotMatch(m[1], /light-dark\(\s*\d/, m[0]);
      assert.doesNotMatch(m[1], /^\s*\d+(\.\d+)?%/, m[0]);
    }
  });

  test('a ramp mixes toward its own member base, never through a var() fallback chain', () => {
    assert.doesNotMatch(css, /var\(--[a-z-]+,\s*var\(/, 'a token-to-token fallback chain');
    assert.match(css, /\.heatmap-cell[^{]*\{[^}]*var\(--heatmap-base\)/);
    assert.match(css, /\.map-region--on[^{]*\{[^}]*var\(--map-base\)/);
  });

  test('the status table agrees with the manifests on which marks carry text', () => {
    const bears = new Map();
    for (const m of loadAll()) for (const r of m.kernel?.marks || []) bears.set(r.class, r.bears);
    for (const s of STATUS_MARKS) {
      const classes = [...s.sel.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
      for (const c of classes) {
        assert.ok(bears.has(c), `${c} is declared in some manifest's kernel.marks`);
        assert.equal(bears.get(c), s.bears, `${c}: STATUS_MARKS says bears=${s.bears}, the manifest says ${bears.get(c)}`);
      }
    }
  });

  test('every finish reaches every encoding it names', () => {
    for (const f of ['pigment', 'etching', 'tone']) {
      for (const enc of ['hue', 'ramp', 'layered']) {
        assert.match(css, new RegExp(`chart-finish-${f} :where\\(.*data-encodes="${enc}"`), `${f} × ${enc}`);
      }
    }
  });
});
