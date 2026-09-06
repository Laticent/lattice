/**
 * `tools/check-chart-fit.js` CAN FAIL — the falsifiability arm for the chart-fit gate.
 *
 * WHY THIS EXISTS. The gate's STAGE check counts the marks painted outside
 * `.cell-stage`, and #2084 taught it to skip `visibility: hidden` ones. That was a
 * real fix: `state-chart` keeps a hidden `<ol class="state-nodes">` purely so the
 * browser pass can measure real, font-dependent text, and `getClientRects()` is
 * non-empty for a hidden element while `getBoundingClientRect` ignores an
 * ancestor's clip — so the scaffold reported its full natural size and was counted
 * as content cut at the stage. Nothing was cut; there was nothing to cut.
 *
 * It shipped with two measurements and no test, and a filter is exactly the shape
 * that degrades quietly. `.filter((el) => getComputedStyle(el).visibility !==
 * 'hidden')` is one edit away from `.filter(() => false)`, and from then on the
 * gate reports "every chart fits its stage" for the same reason an unplugged smoke
 * alarm reports no fire — on the one component whose SVG is `overflow: visible`,
 * where this arm is the only channel that can see a clip at all.
 * `jank-sweep.test.js` names this gate as lacking such an arm; this is it.
 *
 * SO IT RUNS THE SAME GATE TWICE, against the real emulator render:
 *
 *   1. `examples/state-chart-branching.md` at `square` as it ships — the scaffold
 *      is hidden. Expect exit 0, and FIVE chart slides actually measured.
 *   2. The same deck with the scaffold made VISIBLE through the deck's own
 *      front-matter `style:` (the `--style` lever). Expect exit 1 and stage
 *      reports — the exact picture the filter was added to stop counting.
 *
 * The second half is the guard on the first: without it, "everything fits as
 * shipped" is indistinguishable from a rig that can no longer find a clip.
 *
 * WHY THIS DECK AT THIS SIZE, and not the four reports #2084 recorded. Those were
 * measured mid-branch, before §9.3's scale-box pin fix changed what the hidden
 * column lays out inside; on today's tree the branching deck is clean at landscape
 * with the scaffold visible. The pair below was re-measured rather than inherited
 * — 3 clips at `square`, 0 as shipped — which is the point the decision note keeps
 * making about numbers that are quoted rather than re-derived.
 *
 * ONE SIZE, ONE DECK. The gate costs an emulator render per size, and the property
 * under test is the filter, not the corpus. Corpus counts belong in a PR body.
 *
 * Slow tier (Chromium, one emulator render per arm).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const TOOL = path.join(ROOT, 'tools', 'check-chart-fit.js');
const DECK = path.join(ROOT, 'examples', 'state-chart-branching.md');
const TIMEOUT = 600000;

// The one declaration that separates the two runs. `state-chart` hides its
// measuring column with `[data-sc-svg="1"] .state-nodes { visibility: hidden }`
// once the SVG is painted; putting it back is precisely the input the filter
// exists to classify.
const SHOW_SCAFFOLD = '[data-sc-svg="1"] .state-nodes { visibility: visible !important }';

function fit(extraArgs) {
  const args = [TOOL, DECK, '--size', 'square', ...extraArgs];
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT,
    env: { ...process.env, CHROME_PATH: resolveChrome() },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  // Exit 2 is a SETUP failure (no Chromium, missing fixture), never a finding —
  // the gate keeps those distinct on purpose, and so must this arm, or a broken
  // runner would read as "the control fired".
  if (r.status === 2) assert.fail(`check-chart-fit could not run (exit 2): ${out}`);
  return { status: r.status, out };
}

describe('check-chart-fit can still see a clip', { skip: skipWithoutChrome(resolveChrome()), timeout: TIMEOUT }, () => {
  test('as shipped: the deck is clean, and five chart slides were actually measured', () => {
    const { status, out } = fit([]);
    assert.equal(status, 0, `expected a clean gate, got exit ${status}:\n${out}`);
    // THE ANTI-DEFANG ASSERTION, and the reason it reads a count rather than the
    // exit code. A filter that dropped every mark would leave `marks.length` at 0,
    // the slide would never be pushed to `stages`, and the gate would exit 0
    // having measured nothing — green for the worst possible reason. The count is
    // what distinguishes "five charts fit" from "no charts were looked at".
    assert.match(out, /check-chart-fit: 5 chart slide\(s\) fit their stage/,
      `the gate measured a different number of chart slides than the deck has — a filter that swallowed the marks would also read as a pass:\n${out}`);
  });

  test('with the hidden measuring scaffold made visible, the gate goes red', () => {
    const { status, out } = fit(['--style', SHOW_SCAFFOLD]);
    assert.equal(status, 1, `expected the control to fail the gate, got exit ${status}:\n${out}`);
    assert.match(out, /painted outside \.cell-stage/,
      `the control failed for some reason other than a stage clip:\n${out}`);
    // Named slides, not just a non-zero exit: a run that fell over for an
    // unrelated reason could also exit 1.
    const clips = (out.match(/painted outside \.cell-stage/g) || []).length;
    assert.ok(clips >= 1, `expected at least one stage report, got ${clips}:\n${out}`);
  });

  // `--style` is the lever the control rides. CSS that carries no rule block would
  // inject nothing, the run would match its baseline, and the control arm above
  // would pass while proving nothing — so the tool refuses rather than reporting
  // it. Exit 2, the setup-failure code, not 1.
  test('a --style that carries no CSS is refused, not silently ignored', () => {
    const r = spawnSync(process.execPath, [TOOL, DECK, '--size', 'square', '--style', 'not css'], {
      cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT,
      env: { ...process.env, CHROME_PATH: resolveChrome() },
    });
    assert.equal(r.status, 2, 'an empty style must be a setup refusal, not a finding and not a pass');
    assert.match(`${r.stdout || ''}${r.stderr || ''}`, /carries no rule block/);
  });
});
