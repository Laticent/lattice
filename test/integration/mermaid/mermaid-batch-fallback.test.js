/**
 * Integration: one unparseable fence costs only itself.
 *
 * A deck's fences render in ONE browser (Mermaid boots a Chromium per invocation, and
 * per-fence invocation was 92% of a diagram-heavy render). Batching used to trade a
 * failure boundary for that speed: `mmdc -i <markdown>` wrote `<out>-1.svg`,
 * `<out>-2.svg`, … and simply produced no file for a fence it could not parse, which
 * broke the index alignment the caller depends on — so ONE typo sent the whole deck
 * back through the one-at-a-time path and paid the per-fence Chromium boot again.
 *
 * #1674 removed that trade. The engine-owned render worker returns an index-aligned
 * result per diagram, each with its own `ok` flag, so a bad fence degrades in place and
 * the deck keeps both its diagrams and its speed. The whole-batch fallback still exists
 * for the case it is actually for — the worker not running at all — but a syntax error
 * no longer reaches it.
 *
 * What this pins is invisible in a green run, because every corpus deck parses. If it
 * silently broke, the symptom would be a deck losing EVERY diagram because one fence had
 * a typo. The fixture carries one valid fence and one deliberately malformed one:
 *   - the run still succeeds (a bad fence is an authoring error, not a crash);
 *   - the valid fence renders as a real `.mermaid-svg`;
 *   - the malformed fence degrades to `<pre class="mermaid-fallback">`, carrying its
 *     source through so the author can see what failed;
 *   - the failure is REPORTED, naming the diagram — a silent degradation is a diagram
 *     quietly missing from a board deck;
 *   - and the whole-batch fallback did NOT fire, which is the #1674 improvement. If it
 *     did, the deck still renders correctly and simply pays the old cost, so nothing
 *     above would catch the regression.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

describe('mermaid batch fallback', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'mermaid-batch-fallback.md');
  const TIMEOUT = 120000;

  test('a malformed fence costs only itself — the valid one still renders', { timeout: TIMEOUT }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-mmd-fb-'));
    const out = path.join(dir, 'deck.pdf');
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });

    assert.equal(r.status, 0, `emulator should survive an unparseable fence: ${r.stderr}`);
    const html = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');

    const rendered = (html.match(/class="mermaid-svg/g) || []).length;
    const degraded = (html.match(/mermaid-fallback/g) || []).length;
    assert.equal(rendered, 1, 'the valid fence must still render as a real diagram');
    assert.equal(degraded, 1, 'the malformed fence must degrade to the <pre> fallback, not vanish');

    // The failure must announce itself, naming the diagram: a silent degradation is a
    // diagram quietly absent from a deck somebody is about to present.
    const output = `${r.stdout}${r.stderr}`;
    assert.match(
      output,
      /Mermaid render failed for one diagram/,
      'the degraded diagram must be reported, not silent',
    );
    // …and the WHOLE-BATCH fallback must not have fired. Before #1674 it did, on exactly
    // this input, and the deck came out identical — just after paying a Chromium boot per
    // fence. Every assertion above would still pass, so this is the only thing standing
    // between that 14x cliff and a green run.
    assert.doesNotMatch(
      output,
      /falling back to one render per diagram/,
      'a single unparseable fence must degrade in place, not send the whole deck back '
      + 'through the one-at-a-time path',
    );
  });
});
