/**
 * Integration: when the BATCHED Mermaid render fails, the deck still gets every
 * diagram mmdc can actually draw.
 *
 * A deck's fences render in ONE mmdc invocation (mmdc boots a Chromium per call,
 * and per-fence invocation was 92% of a diagram-heavy render). Batching trades a
 * failure boundary for that speed: one unparseable fence fails the whole batch,
 * where per-fence rendering would have failed only itself. The renderer therefore
 * falls back to one invocation per diagram when a batch cannot be completed, which
 * restores the old per-diagram retry and per-diagram degradation.
 *
 * That fallback is the thing this pins. It is invisible in a green run — every
 * corpus deck parses, so nothing exercises it — and if it silently broke, the
 * symptom would be a deck losing EVERY diagram because one fence had a typo. An
 * authoring mistake in one diagram must not cost the other thirteen.
 *
 * The fixture carries one valid fence and one deliberately malformed one. Asserts:
 *   - the run still succeeds (a bad fence is an authoring error, not a crash);
 *   - the valid fence renders as a real `.mermaid-svg`;
 *   - the malformed fence degrades to `<pre class="mermaid-fallback">`, carrying
 *     its source through so the author can see what failed;
 *   - stderr says the batch fell back, so the slower path is never silent.
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

    // The slower path must announce itself: a silent fallback is a 14x perf cliff
    // nobody can see. (stdout+stderr — the warning goes to stderr, the progress
    // line to stdout, and which stream carries it is not what this pins.)
    assert.match(
      `${r.stdout}${r.stderr}`,
      /falling back to one render per diagram/,
      'the batch fallback must be reported, not silent',
    );
  });
});
