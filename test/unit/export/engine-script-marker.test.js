/**
 * CENSUS: every `<script>` the export EMITS into the rendered document is marked as ours.
 *
 * `lib/core/author-deferral-probe.js` tells the deck's script from the engine's by one
 * thing — whether the `<script>` element carries `data-lattice-script`. That makes an
 * unmarked emitter a FALSE POSITIVE machine: the export's own bootstrap schedules a timer,
 * the probe finds no marker, and every deck using that feature is told it lost content it
 * did not lose. The function-plot bootstrap and the state-chart bootstrap both schedule;
 * the overflow watcher arms a 2,000 ms `settleFonts` race on EVERY deck in the repo.
 *
 * A census rather than a spot check, and by TEXT, for the reason the style-guard census
 * gives: the guard is a convention, and a convention with no counter drifts the moment
 * someone adds a fifth emitter. This is the fast half — it reads the source that builds
 * the document. The other half drives a real render and inspects the real sidecar
 * (`test/integration/export/author-script-deferral.test.js`), because source text cannot
 * prove what Chromium actually parsed.
 *
 * SCOPE: `lattice-emulator.js`, the one module that assembles the document the probe runs
 * in. The `--player` document is out of scope by construction — `player-core.mjs` deletes
 * every inline `<script>` from the doc it ships and injects one hashed transport block, and
 * no probe ever runs there.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ENGINE_SCRIPT_ATTR } = require('../../../lib/core/author-deferral-probe');

const EMULATOR = path.join(__dirname, '..', '..', '..', 'lattice-emulator.js');

// The placeholder form as it appears in the SOURCE — matched with a regex rather than a
// string so the linter does not read the literal as a template string someone forgot to
// backtick. It is the un-interpolated text on purpose.
const ATTR_PLACEHOLDER_RE = /\$\{ENGINE_SCRIPT_ATTR\}/;

/**
 * Blank the places a `<script` is DISCUSSED rather than emitted — line and block comments,
 * and regex literals. What survives is markup the file writes into the document.
 *
 * Regex literals are matched narrowly (`/…/` with flags, on one line, not preceded by a
 * word character or `*`) rather than by a general JS parse: the only two in this file are
 * `RUNTIME_SCRIPT` and the `</script` escape in `toFluidViewer`, and both MATCH markup
 * rather than emitting it — `RUNTIME_SCRIPT` in particular exists to strip a DECK-authored
 * runtime tag, which must never be marked as ours.
 *
 * The alternation keeps `[` out of the catch-all branch so exactly one branch can open a
 * character class. With both able to, the pattern was ambiguous and CodeQL measured
 * exponential backtracking — 22,459 ms on 59 characters of `/[][][]…`, against 0 ms now.
 */
function emittedMarkupOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1')
    .replace(/(^|[^\w*/])\/(?:\\.|\[[^\]\n]*\]|[^/\n\\[])+\/[gimsuy]*/g, '$1 ');
}

describe('engine-script-marker census', () => {
  const source = fs.readFileSync(EMULATOR, 'utf8');
  const markup = emittedMarkupOnly(source);

  test('every emitted <script> opening tag carries the engine marker', () => {
    // Opening tags only: `</script>` closes one, and a `<script` inside a template that the
    // file writes out is what this census is about.
    const opens = [...markup.matchAll(/<script\b([^>]*)>/gi)];
    assert.ok(opens.length >= 2, `expected the emitter set to be non-trivial, found ${opens.length}`);
    // The source is JavaScript, so a marked tag reads either as the literal attribute or as
    // the `${ENGINE_SCRIPT_ATTR}` placeholder the template interpolates. Both count; a tag
    // with neither is unmarked in the document that ships.
    const unmarked = opens
      .map((m) => m[1])
      .filter((attrs) => !attrs.includes(ENGINE_SCRIPT_ATTR) && !ATTR_PLACEHOLDER_RE.test(attrs));
    assert.deepEqual(
      unmarked,
      [],
      `an unmarked <script> emitter makes the author-deferral probe blame the deck for the engine's own timers.\n` +
        `Open it with ENGINE_SCRIPT_OPEN (or add \`${ENGINE_SCRIPT_ATTR}\` to the tag).\nUnmarked: ${JSON.stringify(unmarked)}`,
    );
  });

  test('the marker constant is the one the probe reads, not a second spelling', () => {
    // Two copies of the string is how this gate goes green while the probe looks for
    // something else. The emulator imports the constant; the probe's own injected source
    // inlines it (it travels alone) — so the literal must match the export.
    assert.equal(ENGINE_SCRIPT_ATTR, 'data-lattice-script');
    assert.match(source, /ENGINE_SCRIPT_OPEN = `<script \$\{ENGINE_SCRIPT_ATTR\}>`/);
    const probeSrc = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'lib', 'core', 'author-deferral-probe.js'),
      'utf8',
    );
    assert.match(probeSrc, /const MARKER = 'data-lattice-script';/);
  });

  test('the deck-runtime strip regex is NOT treated as an emitter', () => {
    // Guards the census's own blind spot in the other direction: `RUNTIME_SCRIPT` matches a
    // tag the DECK wrote. Marking it would be wrong, so the comment-and-regex blanking above
    // has to keep removing it — if a refactor turns it into a plain string, this fails and
    // says why rather than the census failing with a confusing "unmarked emitter".
    assert.match(source, /const RUNTIME_SCRIPT = \//, 'still a regex literal');
    assert.ok(
      !/<script\\b/i.test(markup),
      'a regex that MATCHES a <script> tag must not survive into the emitted-markup view — it would be censused as an emitter and "fixed" by marking a tag the deck wrote',
    );
  });
});
