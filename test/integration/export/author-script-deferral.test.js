/**
 * Integration: the export does not wait on author timers, and SAYS SO. #1792.
 *
 * This is the real-surface half of the answer (HARD RULE #23). The unit tests
 * (`test/unit/core/author-deferral-probe.test.js`) pin the probe's logic against a
 * synthetic window; they cannot show what Chromium actually captured. These render the
 * real fixture through the real CLI and read the real PDF.
 *
 * THE PROPERTY THAT MATTERS is that the warning agrees with the artifact. An earlier
 * version of this comment called it a biconditional — "fires exactly when content was
 * lost" — which was too strong: an un-ticked housekeeping `setInterval` is reportable and
 * harmless. What is asserted here is the half that must hold, because a warning on a deck
 * that rendered correctly teaches authors to ignore the channel: the synchronous script on
 * slide 2 and the deferred one on slide 3 are checked TOGETHER, from the same render,
 * against what `pdftotext` actually finds.
 *
 * THE FIXTURE'S TIMER IS SIZED AGAINST THIS SUITE'S TIMEOUT, NOT AGAINST A MEASURED
 * WINDOW — see the comment on the `setTimeout` in `test/fixtures/author-script-deferral.md`.
 * It was 400 ms until #1835, where a loaded merge-queue runner beat it and ejected #1824
 * on a diff this suite cannot reach.
 *
 * Note for anyone revisiting #1835's options: "assert the warning rather than the
 * artifact" does NOT remove the race, and that is worth knowing before it is tried
 * again. The warning is computed from whether the task is still OUTSTANDING at capture
 * (`readAuthorDeferralProbe`), which is decided by the same clock as the artifact — when
 * the timer wins, the text lands AND the warning correctly falls silent, so both
 * assertions flip together. The two signals are not independent, so only re-sizing the
 * timer fixes anything. Asserting both, as this test does, is strictly stronger once the
 * timer can no longer lose: it is what pins the warning to the artifact.
 *
 * HOW TO REPRODUCE THE OLD FAILURE ON DEMAND, since #1835 recorded it as "once in maybe a
 * dozen runs" and a fix nobody can falsify is not a fix. CPU load alone does NOT do it —
 * twelve busy loops on 4 cores left the window at 160-230 ms, flat. What moves it is
 * CONCURRENT RENDERS competing for the same cores, which is what a CI runner is actually
 * doing to this suite. Six at once:
 *
 *   for i in $(seq 1 6); do (node lattice-emulator.js test/fixtures/author-script-deferral.md \
 *     /tmp/f$i.pdf >/tmp/o$i.txt 2>&1) & done; wait
 *
 * At 400 ms the window reached 450/458/870/941 ms and `LATE ARRIVED` landed in 4 of 6.
 * At 600000 ms the contract held 6 of 6 under that same contention.
 *
 * ═══ WHAT THIS FILE CAN NO LONGER FALSIFY — READ THIS BEFORE TRUSTING IT ═══
 *
 * The fixture's timer is sized against the suite's own timeout rather than a measured window
 * (#1835), which is what makes the verdict independent of runner load. It also costs
 * something, and the cost is worth stating at full strength because a green run will
 * otherwise read as evidence of a contract nothing here checks:
 *
 *     THIS FILE CANNOT DETECT A BOUNDED AUTHOR-TIMER WAIT OF ANY SIZE UP TO THE DELAY.
 *
 * Add `await sleep(5000)` before the probe read and capture — the shape
 * `engineering/decisions/2026-08-16-render-format-cost-assessment.md` §2a-ter explicitly
 * rejects — and every case below STAYS GREEN: the timer is still pending, the warning still
 * prints, the DOM is unchanged. The 400ms fixture caught exactly that regression as a side
 * effect of being racy. Measured by injecting it, not reasoned.
 *
 * It is given up because there is NO race-free formulation that keeps it. Detecting "the
 * export inserts no wait of size X" requires a timer of size X, and any such timer is the
 * same stopwatch on a machine whose speed is not ours — which is the defect #1835 fixed. The
 * agreement invariant (content landed <-> no warning) is race-free and blind to it for the
 * same reason; timing the export directly is the perf-guard hazard
 * (`engineering/decisions/2026-08-03-performance-guard.md`). Nothing cheap covers this;
 * nothing here covers it; do not read a green run as evidence that it does.
 *
 * What IS retained, and is deterministic: the synchronous script lands, the deferred one does
 * not, the warning names the call and the slide, no false alarm on the synchronous slide, and
 * — slide 4, added for this reason — a timer that DOES fire clears its record instead of
 * warning. That last one is the only real-browser coverage of the probe's settle path, which
 * a delay this large otherwise leaves unreachable.
 *
 * Slow tier: spawns Chromium once per case.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

describe('author-script-deferral', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'author-script-deferral.md');
  const TIMEOUT = 120000;

  const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-deferral-'));

  function render(out, ...args) {
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env },
      timeout: TIMEOUT,
    });
    // Name the SIGNAL and the error code, not just stderr. A `spawnSync` timeout kill sets
    // `status: null`, `signal: 'SIGTERM'`, `error.code: 'ETIMEDOUT'` — and the bare message
    // rendered that as truncated stderr plus `null !== 0`, which does not tell the next person
    // in CI that they hit the 120s cap. That case is load-bearing: it is the branch the
    // fixture's "sized against the suite's own timeout" argument exits through.
    const how = r.signal ? ` [killed by ${r.signal}${r.error?.code ? `, ${r.error.code}` : ''} — the ${TIMEOUT}ms harness cap]` : '';
    assert.equal(r.status, 0, `emulator failed${how}: ${r.stderr}`);
    // The warning goes to stderr (console.warn); read both so a move between streams does
    // not silently turn this suite green.
    return { ...r, output: `${r.stdout}\n${r.stderr}` };
  }

  test('a PDF export warns about the deferred script and NOT about the synchronous one', { timeout: TIMEOUT }, () => {
    const out = path.join(tmpDir(), 'deck.pdf');
    const { output } = render(out);
    const text = execFileSync('pdftotext', [out, '-'], { encoding: 'utf8' });

    // What actually shipped. This is the ground truth the warning has to agree with.
    assert.match(text, /SYNC LANDED/, 'a synchronous script writes before capture and must land');
    // NOT a claim that a small grace window is absent — see WHAT THIS FILE CAN NO LONGER
    // FALSIFY below. It is the weaker claim that a task which could not have run, did not.
    assert.doesNotMatch(text, /LATE ARRIVED/, 'a timer that has not fired by capture is lost — the contract, not a bug');
    // Slide 4's 0ms timer DID fire, and the probe must have cleared its record rather than
    // reporting it. Safe direction: a slower runner only makes this more certain.
    assert.match(text, /TICK LANDED/, 'a 0ms timer fires long before capture — if it is missing the export is dropping author script wholesale');

    // And what the author was told about it.
    assert.match(output, /deck-authored script task/, 'silent loss is the defect this closes');
    assert.match(output, /setTimeout\(600000ms\)/, 'the warning must name the call, not just complain');
    assert.match(output, /slide 3/, 'and the slide, so the author can find it');
    assert.ok(!/slide 2/.test(output), 'the synchronous script landed — warning about it would be a false alarm');
    // The settle-on-fire path. A record left open after its callback ran is a FALSE POSITIVE
    // on every deck whose timers do fire — the asymmetry the probe is deliberately tuned against.
    assert.ok(!/slide 4/.test(output), 'slide 4\'s timer fired, so its record must have settled — warning about it is the false-positive machine');
    assert.match(output, /1 deck-authored script task had not run/, 'exactly one outstanding record: the deferred timer, and not slide 4\'s');
  });

  test('--quiet stays quiet', { timeout: TIMEOUT }, () => {
    const out = path.join(tmpDir(), 'quiet.pdf');
    const { output } = render(out, '--quiet');
    assert.ok(!/deck-authored script task/.test(output), '--quiet suppresses this like every other render warning');
  });

  test('a plain .html export does NOT warn — the script ships live and nothing is lost', { timeout: TIMEOUT }, () => {
    const out = path.join(tmpDir(), 'deck.html');
    const { output } = render(out);
    const html = fs.readFileSync(out, 'utf8');
    // A claim about the BYTES, not the recipient: the fixture's timer is ten minutes, so
    // "their browser runs it" (what this line used to say) is false even though the export did
    // everything right. What matters is that the deck's script SHIPS, unstripped — the whole
    // difference from `--player` below, and why warning here would be a false alarm.
    assert.match(html, /LATE ARRIVED/, 'the sidecar carries the deck\'s own script rather than stripping it');
    assert.ok(
      !/deck-authored script task/.test(output),
      'nothing was captured and nothing was lost — warning here would be the false alarm that trains authors to ignore this',
    );
  });

  test('--player DOES warn — it strips every inline script from the file it ships', { timeout: TIMEOUT }, () => {
    const out = path.join(tmpDir(), 'player.html');
    const { output } = render(out, '--player');
    const html = fs.readFileSync(out, 'utf8');
    assert.ok(!html.includes('LATE ARRIVED'), 'player-core drops the deck script, so the timer never runs for the reader');
    assert.match(output, /deck-authored script task/);
  });

  test('every <script> the export emitted into the real sidecar is marked as the engine\'s', { timeout: TIMEOUT }, () => {
    // The source census (test/unit/export/engine-script-marker.test.js) reads the emitter;
    // this reads what Chromium was actually handed. An unmarked engine script is a false
    // positive machine — the probe would attribute the overflow watcher's own 2,000 ms
    // settleFonts race to the deck, on every deck in the repo.
    const out = path.join(tmpDir(), 'marked.pdf');
    render(out);
    const html = fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8');
    // Case-insensitive: an uppercase `<SCRIPT>` emitter would otherwise skip this census
    // entirely (CodeQL 190).
    const tags = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]);
    assert.ok(tags.length >= 3, `expected engine + deck scripts in the sidecar, found ${tags.length}`);
    const unmarked = tags.filter((a) => !a.includes('data-lattice-script'));
    // Exactly the fixture's two author scripts stay unmarked. Anything else means an engine
    // emitter lost its marker.
    assert.equal(
      unmarked.length,
      3,
      `expected only the fixture's 3 deck scripts to be unmarked, got ${unmarked.length}: ${JSON.stringify(unmarked)}`,
    );
  });
});
