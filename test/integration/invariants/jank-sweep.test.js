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

/** A sweep with NO anchor — the natural first invocation, and the one CROWDING is read from. */
function sweepRawJson(extraArgs) {
  const args = [TOOL, 'divider numbered', '--json', ...extraArgs];
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, CHROME_PATH: resolveChrome() },
  });
  if (r.status === 2) assert.fail(`check-jank could not run (exit 2): ${r.stderr || r.stdout}`);
  return parse(r);
}

/** A sweep naming an anchor other than the divider's numeral. */
function sweepAnchor(anchorSel, extraArgs, max) {
  const args = [TOOL, 'divider numbered', '--anchor', anchorSel, '--max', max, '--json', ...extraArgs.flatMap((s) => ['--style', s])];
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, CHROME_PATH: resolveChrome() },
  });
  if (r.status === 2) assert.fail(`check-jank could not run (exit 2): ${r.stderr || r.stdout}`);
  return parse(r);
}

/** Discovery mode: what marks does this component HAVE. */
function anchors(component, max) {
  const args = [TOOL, component, '--anchors', '--max', max, '--json'];
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
      + 'un-styled). TWO SUSPECTS: (1) the divider\'s eyebrow is no longer a `p` wrapping a `code`, '
      + 'so this style targets nothing; (2) the pseudo branch of ink() in tools/check-jank.js');
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
      // `existsSync` is true for a DIRECTORY and the read then threw EISDIR at module scope,
      // outside `main()`'s catch — so Node exited **1**, which is this tool's "a collision was
      // found". A wrapper keying on the exit code read a mistyped path as a found defect.
      { why: 'a --style path that is a directory', args: ['--anchor', 'h2::after', '--style', 'tools'] },
      // `withAnchor.length < measured.length` is false when BOTH are zero, so a sweep whose
      // every slide came back empty skipped the refusal and printed no DRIFT line, no
      // COLLISION line and exit 0 — with an anchor named.
      {
        why: 'a sweep with no ink on any slide',
        args: ['--anchor', 'h2::after', '--style', 'section.divider.numbered > * { display: none; }'],
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

  // ── The measurements that had no arm at all ─────────────────────────────────────────
  //
  // Two independent mutation passes ran the nine arms above against one-line mutants of
  // `tools/check-jank.js` and agreed: only the COLLISION path was guarded. `const drift = 0`,
  // dropping the horizontal axis, `const crowded = null`, `applyTransform` returning its
  // input unchanged, `unplaced.push` as a no-op, an empty candidate list, and `establishesCb`
  // narrowed back to `position` — every one of them passed all nine. DRIFT is one of the two
  // verdicts that can set exit 1 and nothing proved the tool could go red on it.

  test('DRIFT alone reds the run, and it is measured on BOTH axes', () => {
    // A mark hung on a shrink-to-fit centered heading rides the heading's left edge as the
    // words accumulate, and sits 300px above the ink so nothing collides. Two mutants die
    // here: `drift = 0` (or dropping drift from the exit code) makes this exit 0, and
    // `drift = driftAxes.vertical` reports the 70px the heading also fell instead of the
    // 460px it slid — the exact regression `0e1e731` fixed, where a mark that walked 604px
    // sideways reported `0.0px  ok`.
    const r = sweep(['--style',
      'section.divider.numbered { align-items: center; }'
      + 'section.divider.numbered h2 { position: relative; display: inline-block; max-width: 40ch; }'
      + 'section.divider.numbered h2::after { top: -300px; left: 0; }'], { max: '12' });

    assert.equal(r.summary.collision, null, 'this case is meant to drift WITHOUT colliding');
    assert.equal(r.status, 1, 'drift over the limit did not fail the run — either the anchor '
      + 'stopped moving (the injection no longer bites) or drift left the exit code');
    assert.ok(r.summary.driftAxes.horizontal > 200,
      `expected the mark to slide sideways, got ${JSON.stringify(r.summary.driftAxes)}`);
    assert.ok(r.summary.driftAxes.horizontal > r.summary.driftAxes.vertical * 2,
      'this case is horizontal-dominant by construction; if it is not, the injection changed');
    assert.equal(r.summary.driftAxis, 'horizontal');
    assert.equal(r.summary.drift, r.summary.driftAxes.horizontal,
      'drift reported the smaller axis — the block axis is not the whole of a position');
  });

  test('CROWDING is measured, and it says what is sitting in the band', () => {
    // Unmodified CSS, no anchor named: the divider's own numeral lives in the reserved top
    // band, so the ink is 168px into the section's top padding with nothing overflowing.
    // `const crowded = null` passes all nine of the arms above.
    const r = sweepRawJson(['--max', '4']);
    assert.ok(r.summary.crowded, 'CROWDING went unreported on a component whose mark sits in '
      + 'the reserved band — either the band moved or the measurement is dead');
    assert.equal(r.summary.crowded.edge, 'top');
    // And the band names its occupant. Without this the number is ambiguous in a way that
    // reads as a broken tool: the same component reports 168px of crowding on its own and
    // none under `--anchor 'h2::after'`, because the 168px IS the numeral you would name.
    assert.ok(r.summary.crowdedBand.includes('h2::after'),
      `the crowded band did not name the box in it: ${JSON.stringify(r.summary.crowdedBand)}`);
  });

  test('the anchor box tracks the two things that move it: its own transform, and its containing block', () => {
    // `applyTransform` returning its argument unchanged passed all nine arms, and the
    // `translate(-50%, 50%)` centering idiom it exists for displaces a box by half its own
    // size — 15.3px on shipped `cycle`. `establishesCb` narrowed to `position` likewise.
    const base = sweep([], { max: '3' });
    const shifted = sweep(['--style', 'section.divider.numbered h2::after { transform: translateY(-100px); }'], { max: '3' });
    assert.ok(Math.abs((base.rows[0].anchorTop - shifted.rows[0].anchorTop) - 100) < 1,
      `a 100px transform on the anchor moved its reported box by `
      + `${(base.rows[0].anchorTop - shifted.rows[0].anchorTop).toFixed(1)}px — the pseudo's own `
      + 'transform is being ignored, so the box is reported where it does not paint');

    // `filter` makes a STATIC element the containing block for an absolutely positioned
    // descendant. The browser re-resolves the mark against the heading; a walk that looks at
    // `position` alone does not, and reports the old box for a mark that moved.
    const cb = sweep(['--style', 'section.divider.numbered h2 { filter: blur(0px); }'], { max: '3' });
    assert.notEqual(cb.rows[0].anchorTop, base.rows[0].anchorTop,
      'making the heading a containing block did not move the reported anchor — `establishesCb` '
      + 'is resolving on `position` alone, which places every nested mark against the wrong origin');
  });

  test('a generated box it cannot place is named, with the reason it could not place it', () => {
    // `unplaced.push` as a no-op passed all nine arms. Three shapes, three DIFFERENT reasons:
    // the report used to attribute all of them to "an offset in-flow pseudo", pointing the
    // next debugger at the wrong branch of `placedBox`.
    const r = sweep(['--style',
      'section.divider.numbered p::before { content: "x"; position: relative; top: 40px; }'
      + 'section.divider.numbered p::after { content: "y"; position: absolute; top: 0; left: 0;'
      + ' width: 20px; height: 20px; translate: 0 400px; }'
      // And a box that paints nothing at all must not enter the ink as if it did.
      + 'section.divider.numbered code::before { content: "z"; position: absolute; top: 0; left: 0;'
      + ' width: 900px; height: 900px; background: red; opacity: 0; }'], { max: '3' });

    const joined = r.summary.unplaced.join(' | ');
    assert.ok(/p::before .* static position/.test(joined),
      `the offset in-flow pseudo went unreported: ${joined}`);
    assert.ok(/p::after .*translate/.test(joined),
      `an individual \`translate\` was silently dropped instead of refused: ${joined}`);
    // The `opacity: 0` box is neither ink nor a candidate — it paints nothing, whatever its
    // background says. The bundle ships one (`.scene-control`).
    const cands = r.rows.flatMap((row) => row.candidates.map((c) => c.sel));
    assert.ok(!cands.includes('code::before'),
      `a fully transparent box entered the measurement: ${JSON.stringify(cands)}`);
  });

  test('discovery reaches the marks that hang below TEXT, and the ones that are not pseudos at all', () => {
    // Shipped `pricing`, whose badge marks hang off a `<li>` that carries the card title.
    // The walk used to stop at any element with its own text, so 2 positioned pseudos per
    // slide were reached 0 times and `--anchors` answered "this component draws no positioned
    // pseudo the walk can place" over marks it places fine. An empty candidate list passed
    // all nine arms above.
    const r = anchors('pricing', '4');
    const sels = r.candidates.map((c) => c.sel);
    assert.ok(sels.some((s) => /\.badge.*::after$/.test(s)),
      `discovery missed the marks below the card title: ${JSON.stringify(sels)}`);
    // And `pricing`'s corner tag is an absolutely positioned ELEMENT, not a pseudo — invisible
    // to a walk that enumerates pseudos only, for the same reason it was invisible to the ink.
    assert.ok(sels.includes('em'),
      `discovery is pseudo-only: it missed the positioned element mark: ${JSON.stringify(sels)}`);
  });

  test('a section-level running mark can be named and measured', () => {
    // The engine's whole running-mark family is `section::before` / `section::after` — the
    // archetype in the tool's own opening paragraph — and `sec.querySelectorAll` matches
    // descendants, so the section is not its own. `--anchor 'section::before'` refused with
    // "no match" on every one of them.
    const args = [TOOL, 'divider numbered mark-orbit', '--anchor', 'section::before', '--max', '3', '--json'];
    const raw = spawnSync(process.execPath, args, {
      cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, CHROME_PATH: resolveChrome() },
    });
    assert.notEqual(raw.status, 2, `a shipped section mark could not be measured: ${raw.stderr}`);
    const r = JSON.parse(raw.stdout);
    assert.ok(r.rows.every((row) => row.anchorTop != null), 'the section mark resolved on some slides only');

    // And it has to be in the INK WALK, not just resolvable as an anchor — those are two
    // different code paths, and a mutant that drops the section from the walk leaves the
    // anchor working while the mark stops being an obstacle to anything else and stops
    // appearing in discovery.
    const d = anchors('divider numbered mark-orbit', '3');
    assert.ok(d.candidates.some((c) => /^section[\w.-]*::/.test(c.sel)),
      `discovery did not reach the section's own mark: ${JSON.stringify(d.candidates.map((c) => c.sel))}`);
  });

  test('readable content that is out of flow is ink, and a mark drawn in reserved padding is not a collision', () => {
    // TWO failures that pull in opposite directions, on the same run pair.
    //
    // The false CLEAN: the walk used to return on any absolutely positioned element, so
    // laying the eyebrow straight through the numeral out of flow reported COLLISION none
    // and exit 0. The engine positions readable content all over — `image`'s spotlight
    // headline, `scene`'s text block, `pricing`'s corner tag.
    const overlaid = sweep(['--style',
      'section.divider.numbered p { position: absolute; top: 100px; left: 200px; font-size: 36px; }'], { max: '3' });
    assert.equal(overlaid.status, 1, 'an out-of-flow eyebrow laid over the mark did not register as a strike');
    assert.ok(overlaid.summary.collision, 'no collision recorded for a two-axis overlap on readable text');

    // The false POSITIVE, which is the more corrosive one: padding is how the engine RESERVES
    // room for a mark, so a bullet drawn in its own host's `padding-left` intersects that
    // host's BORDER box by construction. Shipped `roadmap` reported `clearance -233.5px`
    // against unmodified CSS on the sweep its own `--anchors` output told you to run.
    const reserved = 'section.divider.numbered code { position: relative; padding-left: 30px; }'
      + 'section.divider.numbered code::before { content: ""; position: absolute; left: 6px; top: 0.3em;'
      + ' width: 12px; height: 12px; background: red; }';
    const inPadding = sweepAnchor('code::before', [reserved], '3');
    assert.equal(inPadding.status, 0,
      `a mark drawn inside its own host's reserved padding was called a collision `
      + `(clearance ${inPadding.summary.collision?.clearance})`);

    // And the control, so this is not just a tool that stopped looking: take the padding
    // away and the same mark lands on the words.
    const noPadding = sweepAnchor('code::before', [reserved.replace('padding-left: 30px', 'padding-left: 0')], '3');
    assert.equal(noPadding.status, 1,
      'with the reserved padding gone the mark sits on the text and the tool still said nothing');
  });
});
