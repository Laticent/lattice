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
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
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
    assert.doesNotMatch(text, /LATE ARRIVED/, 'a timer that has not fired by capture is lost — the contract, not a bug');

    // And what the author was told about it.
    assert.match(output, /deck-authored script task/, 'silent loss is the defect this closes');
    assert.match(output, /setTimeout\(600000ms\)/, 'the warning must name the call, not just complain');
    assert.match(output, /slide 3/, 'and the slide, so the author can find it');
    assert.ok(!/slide 2/.test(output), 'the synchronous script landed — warning about it would be a false alarm');
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
    assert.match(html, /LATE ARRIVED/, 'the sidecar carries the deck\'s script, so the recipient\'s browser runs the timer');
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
      2,
      `expected only the fixture's 2 deck scripts to be unmarked, got ${unmarked.length}: ${JSON.stringify(unmarked)}`,
    );
  });
});
