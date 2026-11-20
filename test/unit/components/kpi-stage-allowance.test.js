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
 * Three source invariants keep that from coming back:
 *
 *   1. the briefing and spotlight row COUNTS are keyed on the metrics actually authored,
 *      via `:has()`, rather than hard-coded at three. THIS is the fix — the corpus goes
 *      27 clipped slides to 9 on it alone;
 *   2. no ROW track is `minmax(0, …)` — a row that can shrink to zero overprints its
 *      neighbor instead of spilling. Every row track carries a `min-content` floor, so
 *      the ledger yields only to what its content needs. (COLUMN tracks may still be
 *      `minmax(0, 1fr)` — an inline track shrinking below content is how a label wraps.)
 *   3. the base list does NOT declare `min-height: 0`. Round two of this fix added one,
 *      and it passed the corpus too — but clamping the list to the stage does not remove
 *      the overflow, it moves it INSIDE the frame where the stage's clip cannot catch it:
 *      it sheared the ledger's head at tall/strip, and painted the grid on top of a
 *      trailing `.below-note` (25px of text over text) with the stage probe reading 0.
 *      Both silent to every gate. The list must be free to grow so the STAGE clips it
 *      and the probe reports it. `compliance` keeps a LOCAL min-height:0 — it is a flex
 *      column that re-flows rather than overprinting — so this checks the base rule only.
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

/**
 * Comments stripped (so prose about `minmax(0, 1fr)` never trips a declaration check)
 * and runs of whitespace collapsed to one space. The collapse keeps these assertions
 * about SEMANTICS: a selector list is matched by its text, and without normalizing, a
 * whitespace-only reformat of kpi.styles.css — a line rewrapped, a selector list put on
 * one line — would red the suite with nothing behavioral changed.
 */
function normalize(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
}

/** The declaration block a selector-substring opens. */
function blockContaining(css, needle) {
  const at = css.indexOf(needle);
  assert.notEqual(at, -1, `expected kpi.styles.css to contain ${needle}`);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('components: the kpi ledger divides its stage', () => {
  const css = normalize(fs.readFileSync(KPI_CSS, 'utf8'));

  test('the base list keeps its auto floor — it must be free to grow past the stage', () => {
    const block = blockContaining(css, 'section.kpi > .cell-stage > ol, section.kpi > .cell-stage > ul');
    assert.match(block, /flex:\s*1\b/, 'the list still fills the stage');
    assert.doesNotMatch(
      block,
      /min-height:\s*0\b/,
      'the BASE list must not clamp to the stage. Clamping does not remove the overflow, it '
        + 'moves it inside the frame: it shears the ledger head at tall/strip and overprints a '
        + 'trailing .below-note, both with the stage probe reading 0. Let it grow so the stage '
        + 'clips it and the probe reports it (#1277). compliance opts in locally; the base does not.',
    );
  });

  test('no ROW track can shrink below its content (yield, then spill — never overlap)', () => {
    const offenders = [];
    for (const prop of ['grid-template-rows', 'grid-auto-rows']) {
      // Stop at `;` OR `}` — a final declaration written without a trailing semicolon
      // would otherwise let `[^;]*` run past the closing brace into the next rule, which
      // turns a missing floor into a false pass instead of a clean failure.
      const re = new RegExp(`${prop}\\s*:([^;}]*)[;}]`, 'g');
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
    // number of support rows opposite it. Hard-coding three made a 3-metric slide — 68 of the
    // 81 bare-kpi slides in the corpus — reserve a row for a metric nobody wrote.
    // Literal substring checks, not a built regex: the selectors are fixed text, so
    // hand-escaping them into a pattern buys nothing and gets the escaping wrong
    // (CodeQL js/incomplete-sanitization — the `[()]` replace left backslashes alone).
    for (const marker of ['li:nth-child(3)', 'li:nth-child(4)']) {
      assert.ok(
        css.includes(`ol:has(> ${marker})`),
        `expected a :has(> ${marker}) rule keying the row count on the authored metric count`,
      );
    }
    assert.ok(
      css.includes('section.kpi.spotlight > .cell-stage > ol:has('),
      'spotlight is count-aware too',
    );
  });
});
