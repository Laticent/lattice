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
    assert.doesNotMatch(text, /LATE ARRIVED/, 'a 400ms timer loses the race — that is the contract, not a bug');

    // And what the author was told about it.
    assert.match(output, /deck-authored script task/, 'silent loss is the defect this closes');
    assert.match(output, /setTimeout\(400ms\)/, 'the warning must name the call, not just complain');
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
