/**
 * Unit: the kpi ledger divides its stage — it never sizes itself from its own content.
 *
 * `kpi`'s metric list is a flex child of the bounded stage Cell (flex cell-tree §6). It
 * carried `flex: 1` and NO `min-height`, so its `min-height: auto` floor stayed live and
 * its used height was the LARGER of the stage it was flexed into and its own content
 * height. For a grid variant that content height is computed against an INDEFINITE block
 * size, where `1fr` rows cannot divide a stage they have not been given and instead
 * equalize to the tallest row — so the list demanded three rows of the tallest support no
 * matter what the stage offered, and no matter how many supports were authored. It
 * measured the same 1485px on twelve different decks by twelve different authors (#1277):
 * a constant, because it was a property of the component rather than of anyone's content.
 * Eighteen slides in the shipped corpus clipped on it, every one of them a THREE-metric
 * slide paying for a fourth row that held nothing.
 *
 * Three source invariants keep that from coming back, and they are load-bearing together:
 *
 *   1. the list declares `min-height: 0` — the block size is definite, so `1fr` divides
 *      the stage;
 *   2. no ROW track is `minmax(0, …)` — a definite grid whose rows can shrink to zero
 *      squeezes a row under its own content and overprints the next one, which trades a
 *      visible clip for a silent overlap. Every row track carries a `min-content` floor,
 *      so the ledger yields, then spills, and the stage's clip + the export's overflow
 *      report make the failure visible. (COLUMN tracks may still be `minmax(0, 1fr)` —
 *      an inline track shrinking below content is how a long label wraps.)
 *   3. the briefing and spotlight row COUNTS are keyed on the metrics actually authored,
 *      via `:has()`, rather than hard-coded at three.
 *
 * A SOURCE check, deliberately. The geometry itself is guarded corpus-wide by the overflow
 * ratchet (`npm run overflow:check` against test/integration/overflow-baseline.json), which
 * needs ~248 real Chromium renders and is on-demand; this pins the structure that ratchet
 * depends on, in the inner loop, and claims nothing about pixels.
 * See engineering/decisions/2026-07-30-overflow-marker-register.md.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const KPI_CSS = path.join(ROOT, 'lib', 'components', 'evidence', 'kpi', 'kpi.styles.css');

/** Strip comments so prose about `minmax(0, 1fr)` never trips a declaration check. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The declaration block a selector-substring opens, comments removed. */
function blockContaining(css, needle) {
  const at = css.indexOf(needle);
  assert.notEqual(at, -1, `expected kpi.styles.css to contain ${needle}`);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('components: the kpi ledger divides its stage', () => {
  const css = stripComments(fs.readFileSync(KPI_CSS, 'utf8'));

  test('the stage list yields to the stage — min-height: 0, not the auto floor', () => {
    const block = blockContaining(css, 'section.kpi > .cell-stage > ol,\nsection.kpi > .cell-stage > ul');
    assert.match(block, /flex:\s*1\b/, 'the list still fills the stage');
    assert.match(
      block,
      /min-height:\s*0\b/,
      'the list must declare min-height: 0 — without it the auto floor makes the list size '
        + 'from its own content and the grid rows equalize instead of dividing the stage (#1277)',
    );
  });

  test('no ROW track can shrink below its content (yield, then spill — never overlap)', () => {
    const offenders = [];
    for (const prop of ['grid-template-rows', 'grid-auto-rows']) {
      const re = new RegExp(`${prop}\\s*:([^;]*);`, 'g');
      for (const m of css.matchAll(re)) {
        if (/minmax\(\s*0/.test(m[1])) offenders.push(`${prop}:${m[1].trim()}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'a kpi row track floored at 0 lets a definite grid squeeze a row under its content and '
        + 'overprint the next metric — use minmax(min-content, 1fr) so the failure is a visible clip',
    );
  });

  test('briefing and spotlight size their row count to the metrics authored', () => {
    // Both variants place the hero with `grid-row: 1 / -1`, so the explicit row count IS the
    // number of support rows opposite it. Hard-coding three made a 3-metric slide — 67 of the
    // 81 bare-kpi slides in the corpus — reserve a row for a metric nobody wrote.
    for (const marker of ['li:nth-child(3)', 'li:nth-child(4)']) {
      assert.match(
        css,
        new RegExp(`ol:has\\(>\\s*${marker.replace(/[()]/g, '\\$&')}\\)`),
        `expected a :has(> ${marker}) rule keying the row count on the authored metric count`,
      );
    }
    assert.match(css, /section\.kpi\.spotlight > \.cell-stage > ol:has\(/, 'spotlight is count-aware too');
  });
});
