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
    //
    // It is DECORATION, so under the content rule it is reported and does not fail: the
    // assertion is that the tool SEES it. That is the whole point of the arm — the defect
    // it guards was the box being absent from the measurement, not the verdict it earns.
    const overlap = 'section.divider.numbered p::before { content:""; position:absolute; '
      + 'top:64px; left:100px; width:400px; height:120px; background:red; }';
    const base = sweep([], { max: '4' });
    const r = sweep(['--style', overlap], { max: '4' });

    // VISIBILITY IS ASSERTED ON THE INK, not on the verdict. An earlier cut asserted
    // `chromeTouch` and read as if it proved the box was collected — but `chromeTouch`
    // requires `!intersects`, so a mutation that reclassified the box flipped the arm red
    // with the message "the walk is blind to generated boxes again" while the walk was
    // seeing it perfectly. That sends the next debugger to the wrong half of the tool.
    // The box paints at y=64; the un-styled sweep's ink starts at 311.8.
    assert.ok(r.rows[0].inkTop < base.rows[0].inkTop - 200,
      `the painted pseudo is absent from the ink (ink top ${r.rows[0].inkTop} vs ${base.rows[0].inkTop} `
      + 'un-styled) — the walk is blind to generated boxes again');
    assert.ok(r.summary.chromeTouch, 'the anchor overlaps it, and no CHROME advisory was raised');
    assert.equal(r.summary.collision, null,
      'decoration overlapping decoration was failed on; that is the cry-wolf the content '
      + 'rule exists to stop');
    assert.equal(r.status, 0);
  });

  test('a slide with no readable content cannot pass by having nothing to measure', () => {
    // THE FALLBACK, which is the one safeguard the content rule leans on and was shipped
    // untested: deleting it passed all five arms. With every text box hidden, `contentRects`
    // is empty and the verdict falls back to the whole ink — so two painted boxes reaching
    // each other is a collision again, because there is no content for the rule to be about.
    const allChrome = [
      'section.divider.numbered code { display: none; }',
      'section.divider.numbered h2 { display: none; }',
      'section.divider.numbered p::before { content:""; position:absolute; top:200px; left:120px; width:200px; height:60px; background:red; }',
      'section.divider.numbered p::after { content:""; position:absolute; top:230px; left:150px; width:200px; height:60px; background:blue; }',
    ].join('\n');
    const r = spawnSync(process.execPath,
      [TOOL, 'divider numbered', '--anchor', 'p::before', '--max', '3', '--json', '--style', allChrome],
      { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, CHROME_PATH: resolveChrome() } });
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.summary.collision,
      'an all-chrome slide whose two painted boxes overlap reported nothing — the fallback '
      + 'is gone, and every text-free layout is now incapable of raising a collision');
    assert.equal(r.status, 1);
  });

  // THE CONTENT RULE, both directions, on REAL shipped CSS and on an injected defect.
  test('the verdict keys on readable content, not on any two boxes touching', () => {
    // `cycle` draws its hub dot centered ON the ring it straddles — real geometry, entirely
    // deliberate. Failing that is crying wolf on a component that works, which is the
    // failure mode opposite to a false clean and the more corrosive one: the next person to
    // see it stops trusting the tool. No injected CSS here; this is the shipped component.
    const shipped = spawnSync(process.execPath,
      [TOOL, 'cycle', '--anchor', 'ul::before', '--max', '6', '--json'],
      { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, CHROME_PATH: resolveChrome() } });
    assert.equal(shipped.status, 0,
      `shipped \`cycle\` reported a defect against unmodified CSS:\n${shipped.stderr}`);
    assert.equal(JSON.parse(shipped.stdout).summary.collision, null,
      'a deliberate decoration overlap was reported as a collision');

    // And the other direction, so this arm cannot pass by the tool simply never failing:
    // make the mark ride the heading and it lands ON the heading text — readable content —
    // which is the #2005 defect and must exit 1.
    const onText = sweep(['--style', 'section.divider.numbered h2 { position: relative; }'], { max: '4' });
    assert.ok(onText.summary.collision,
      'the mark was laid over the heading TEXT and the tool called it clean');
    assert.equal(onText.status, 1);
  });

  // THE CONTENT CLASSIFIER, guarded in the three places it can silently go wrong. All three
  // were shipped unguarded in the first cut of the content rule and found by a checker: every
  // one of these mutations passed the arms that existed.
  test('a painting ancestor does not turn the text beneath it into decoration', () => {
    // THE REGRESSION THAT ALMOST SHIPPED. A box that paints used to end the walk, so a
    // painting ANCESTOR swallowed every text box under it and left a stand-in rect carrying
    // no text — classified as decoration. The engine puts `border-bottom` on `.cell-masthead`,
    // so on every Form component the heading became chrome and a mark laid straight through
    // an `h2` exited 0. One cosmetic hairline decided whether a heading strike was a defect.
    const mark = 'section.cards-grid > .cell-stage::before { content:""; position:absolute; '
      + 'top:100px; left:80px; width:600px; height:50px; background:red; }';
    const run = (extra) => spawnSync(process.execPath,
      [TOOL, 'cards-grid', '--anchor', '.cell-stage::before', '--axis', 'count', '--max', '3',
        '--json', '--style', mark + extra],
      { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, CHROME_PATH: resolveChrome() } });

    const withBorder = run('');
    assert.equal(withBorder.status, 1,
      `a mark laid across the heading of a Form component was called clean:\n${withBorder.stdout.slice(-400)}`);
    // And the verdict must not depend on a decoration on some ancestor. Removing the
    // masthead's hairline is a cosmetic change; it must not change whether this is a defect.
    const withoutBorder = run(' section.cards-grid > .cell-masthead { border-bottom: none; }');
    assert.equal(withoutBorder.status, withBorder.status,
      'removing a 1px hairline from an ancestor changed the verdict on a heading strike');
  });

  test('a generated box carrying words is content, not decoration', () => {
    // The bundle has 20 absolutely positioned pseudo rules whose `content` is a counter, an
    // `attr()` or a quoted label — card numerals, 'DECISION', the matrix axis names. Calling
    // every generated box decoration printed "no readable content in it" over 32 characters
    // of set type.
    const label = 'section.divider.numbered p::before { content:"CONFIDENTIAL — DO NOT DISTRIBUTE"; '
      + 'position:absolute; top:100px; left:200px; font-size:28px; color:black; }';
    const r = sweep(['--style', label], { max: '3' });
    assert.ok(r.summary.collision,
      'a mark laid over a pseudo carrying 32 characters of text was reported as a decoration touch');
    assert.equal(r.status, 1);
  });

  test('a painted element is in the ink even though it carries no text', () => {
    // The `paints()` branch, which is how a card surface or a rule reaches the measurement.
    // Chrome belongs in `ink top`/`breathe`/CROWDING even when it never touches the anchor —
    // narrowing the ink to content left a painted box eating the top padding entirely
    // unprinted, while the commit message claimed nothing goes unseen.
    const band = 'section.divider.numbered p { background: red; position: relative; height: 420px; }';
    const base = sweep([], { max: '3' });
    const r = sweep(['--style', band], { max: '3' });
    // ASSERTED ON THE COUNT, not on the ink union. The union moves for layout reasons too —
    // a taller band pushes its own text down — so an arm written against it passed while
    // chrome collection was mutated out entirely.
    assert.ok(r.rows[0].chromeBoxes > base.rows[0].chromeBoxes,
      `a painted band never reached the measurement (chrome boxes ${r.rows[0].chromeBoxes} vs `
      + `${base.rows[0].chromeBoxes} un-styled)`);
    assert.ok(r.rows[0].inkBottom > base.rows[0].inkBottom,
      'and it is not in the ink either');
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
