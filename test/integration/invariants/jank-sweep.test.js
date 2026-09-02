/**
 * `tools/check-jank.js` CAN FAIL — the falsifiability arm for the jank sweep.
 *
 * The tool's whole claim is that it sees three things no other channel does: an anchor
 * that DRIFTS, a COLLISION that overflows nothing, and CROWDING inside the frame. A
 * diagnostic making that claim is worth exactly as much as its ability to go red, and a
 * geometry rig degrades quietly: a selector that stops matching, a measurement that reads
 * a wrapper instead of the ink, an anchor whose rect silently becomes `null`, and every
 * sweep from then on reports "no collision" for the same reason an unplugged smoke alarm
 * reports no fire. `check-chart-fit` and the calibrators have no such arm; this one is
 * cheap because the defect it needs is one declaration away.
 *
 * So it runs the SAME sweep twice against the real emulator render:
 *
 *   1. `divider numbered` as it ships — the band is reserved with symmetric padding and
 *      `justify-content: safe center` (#2005), so the mark holds position and the headline
 *      block never reaches it. Expect: exit 0, zero drift, no collision.
 *   2. The same sweep with those two declarations neutralized through the deck's own
 *      front-matter `style:` — the exact pre-fix picture. Expect: exit 1 and a collision,
 *      AND the overflow probe reporting that same slide as perfectly fine, which is the
 *      silence the tool exists to break.
 *
 * The second half is also the guard on the first: without it, "no collision as shipped"
 * is indistinguishable from a rig that can no longer find one.
 *
 * Slow tier (two emulator renders + Chromium).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const TOOL = path.join(ROOT, 'tools', 'check-jank.js');
const TIMEOUT = 300000;

// The band and the `safe` keyword, both removed. Either one alone is enough to reopen the
// collision — that is the trap the gotchas entry records, a plain `center`ed flex line
// overflows in BOTH directions and spills straight back through `padding-top` — so this
// removes both rather than claiming which single one matters.
const NO_BAND = 'section.divider.numbered { padding-top: 0; padding-bottom: 0; justify-content: center; }';

/** Run the sweep and hand back its exit code with the parsed `--json` payload. */
function sweep(extraArgs, { max = '18' } = {}) {
  const args = [TOOL, 'divider numbered', '--anchor', 'h2::after', '--max', max, '--json', ...extraArgs];
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, CHROME_PATH: resolveChrome() },
  });
  if (r.status === 2) assert.fail(`check-jank could not run (exit 2): ${r.stderr || r.stdout}`);
  return parse(r);
}

/** The same, for the runs that are SUPPOSED to refuse — exit 2 is the assertion there. */
function sweepRaw(extraArgs, { max = '6' } = {}) {
  const args = [TOOL, 'divider numbered', '--max', max, ...extraArgs];
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, CHROME_PATH: resolveChrome() },
  });
  return { status: r.status, stderr: r.stderr || '', stdout: r.stdout || '' };
}

function parse(r) {
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    assert.fail(`check-jank emitted no JSON (exit ${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
  return { status: r.status, ...parsed };
}

describe('check-jank measures what it claims to measure', { skip: skipWithoutChrome(resolveChrome()), timeout: TIMEOUT }, () => {
  test('as shipped the mark holds position and nothing reaches it; neutralize the band and the sweep goes red', () => {
    const shipped = sweep([]);

    // THE SWEEP HAS TO BE DOING SOMETHING. A sweep whose steps all lay out identically
    // reports a clean bill for the same reason an empty one would, so this is asserted
    // before any verdict is read from it.
    assert.equal(shipped.rows.length, 18, 'the sweep did not render one slide per step');
    assert.ok(!shipped.summary.vacuous && shipped.summary.inkHeightSpread > 40,
      `the heading never grew the block (ink-height spread ${shipped.summary.inkHeightSpread}px) — `
      + 'every verdict below would be vacuous');
    assert.ok(shipped.rows.some((r) => r.lines >= 3), 'the heading never wrapped past two lines');
    assert.deepEqual(shipped.summary.anchorErrors, [],
      'the anchor was unmeasurable on some slide — a null rect reads as "no collision" forever');

    assert.equal(shipped.summary.collision, null,
      'the shipped divider mark is being reached by the headline block — the reserved band regressed');
    assert.ok(shipped.summary.drift <= shipped.summary.maxDrift,
      `the shipped mark drifted ${shipped.summary.drift}px; it is pinned to the section and must not move`);
    assert.equal(shipped.status, 0, 'a clean sweep must exit 0');

    const broken = sweep(['--style', NO_BAND]);
    assert.equal(broken.rows.length, shipped.rows.length, 'the two sweeps must be the same experiment');
    assert.ok(broken.summary.collision, 'with the band removed the rig found no collision — it cannot fail');
    assert.ok(broken.summary.collision.clearance < 0,
      `a collision was reported at a non-negative clearance (${broken.summary.collision.clearance})`);
    assert.equal(broken.status, 1, 'a collision must exit 1');

    // THE POINT OF THE WHOLE TOOL: the engine's own overflow probe, running on that very
    // render, calls the colliding slide fine. If this ever flips to `true`, the collision
    // has become a real overflow and some other channel would have caught it — which
    // would make this tool less necessary, and is worth knowing loudly either way.
    const collided = broken.rows.find((r) => r.step === broken.summary.collision.step);
    assert.equal(collided.over, false,
      'the colliding slide now ALSO overflows — the collision is no longer silent, so the '
      + 'premise this tool was built on has changed');
    assert.equal(broken.summary.firstOverflow, null,
      'some slide in the swept range overflows, so the sweep no longer isolates a silent collision');
  });

  // THE THREE FALSE CLEANS AN INDEPENDENT CHECKER FOUND IN THE FIRST CUT. Each one is a
  // real defect the tool reported as `COLLISION none … ok`, exit 0 — the exact failure this
  // file exists to make impossible, and none of them was reachable through the sweep above,
  // because that one happens to pair an element carrying direct text with the pseudo it
  // names as the anchor.
  test('ink painted by a generated box is not invisible to the sweep', () => {
    // A pseudo on the eyebrow wrapper, painting a 400x120 block straight through the
    // section mark. The wrapper has no direct text and no background of its own, so the
    // walk used to treat it as a pure container and descend past it — and generated boxes
    // are not children, so every pixel it painted was absent from the measurement.
    const overlap = 'section.divider.numbered p::before { content:""; position:absolute; '
      + 'top:64px; left:100px; width:400px; height:120px; background:red; }';
    const r = sweep(['--style', overlap], { max: '4' });
    assert.ok(r.summary.collision, 'a painted pseudo lying on the anchor was not seen at all');
    assert.equal(r.status, 1);
  });

  test('text escaping its own box is not claimed as measured — the probe owns that case', () => {
    // THE COVERAGE BOUNDARY, pinned deliberately. Two richer ink measures were tried for
    // this case and both manufactured collisions on layouts that are fine: a Range union
    // (line boxes carry the font's leading) and `scrollWidth`/`scrollHeight` (they include
    // absolutely positioned descendants, so the named anchor came back in through its own
    // container and shipped `list-steps` reported a -219.1px collision against unmodified
    // CSS). The ink is the border box, and the escape is left to the channel that already
    // sees it. This arm asserts that division rather than a coverage claim we do not have.
    const r = sweep(['--style', 'section.divider.numbered h2 { white-space: nowrap; }'], { max: '20' });
    assert.equal(r.summary.vacuous, false,
      'the sweep declared itself inert while the heading was growing every step');
    assert.ok(r.summary.firstOverflow != null,
      'a heading running off the slide was flagged by no channel at all — the probe column is '
      + 'the coverage this tool defers to for inline escape, so if it goes quiet the case is '
      + 'genuinely unmeasured');
    assert.equal(r.summary.collision, null,
      'the ink measure grew a false collision on a heading that only escapes on the inline axis');
  });

  test('a sweep it cannot fully measure refuses instead of reporting clean', () => {
    // Four ways the first cut answered "clean, exit 0" to a question it had not measured.
    // Exit 2 is the contract for every one: the rig did not run, as distinct from the 1
    // that means it found something.
    const cases = [
      { why: 'an unknown flag', args: ['--ancor', 'h2::after'] },
      { why: 'a non-numeric limit', args: ['--anchor', 'h2::after', '--max-drift', 'banana'] },
      { why: 'a --style path that does not exist', args: ['--anchor', 'h2::after', '--style', './no-such-fix.css'] },
      {
        why: 'an anchor measurable on some slides but not all',
        args: ['--anchor', 'h2::after', '--style',
          'section[data-lattice-slide]:not([data-lattice-slide="1"]) h2::after { position: static !important; }'],
      },
    ];
    for (const c of cases) {
      const r = sweepRaw(c.args);
      assert.equal(r.status, 2, `${c.why}: expected exit 2, got ${r.status}\n${r.stderr}${r.stdout}`);
    }
    // And the flag form that silently dropped the anchor entirely: `--anchor=…` was never
    // matched by the old scanner, so the sweep ran with no anchor, printed no DRIFT and no
    // COLLISION line, and exited 0 looking clean.
    const eq = spawnSync(process.execPath,
      [TOOL, 'divider numbered', '--anchor=h2::after', '--max=4', '--json'],
      { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, CHROME_PATH: resolveChrome() } });
    const parsed = JSON.parse(eq.stdout);
    assert.equal(parsed.summary.anchor, 'h2::after', 'the --flag=value form dropped the anchor');
    assert.equal(parsed.rows.length, 4, 'the --flag=value form dropped --max');
  });
});
