/**
 * The RENDER path repeats a retired Form opt-out on stderr.
 *
 * Form stopped being configurable on 2026-09-20
 * (`engineering/decisions/2026-09-20-form-is-not-configurable.md`). Three of the
 * retired shapes SUPPRESSED chrome — `form: off`, a deck-wide `class: no-form`,
 * and a slide's `no-form` — so a deck still carrying one renders differently
 * than it used to the moment it is built against a current engine: the masthead
 * band, the meta bay and the progress rail all come back.
 *
 * That is a breaking change to somebody's deck, and without this it happens with
 * a successful exit code and no other sign. The linter says the same thing with
 * a fix, but the person whose deck changed shape is RENDERING it, not linting it
 * — the same argument the CLI's refused deck-wide `class:` notice already makes
 * a few lines above this one in `lattice-emulator.js`.
 *
 * ASSERTED ON THE REAL CLI (HARD RULE #23), not on the detector. The detector's
 * `shapeChange` flag is pinned in `test/unit/components/lint-deck.test.js`; what
 * this file guards is the WIRING, which a unit test cannot see. Deleting the
 * loop in `lattice-emulator.js` leaves every other test in the repo green.
 *
 * Both directions matter, so both are here: a deck that moved must warn, and a
 * deck carrying only INERT retired shapes must stay silent. A warning on a deck
 * that renders identically is what teaches people to ignore warnings.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

describe('retired-form-warning', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const TIMEOUT = 120000;

  const fixture = (name) => path.join(ROOT, 'test', 'fixtures', name);

  function render(md) {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-retired-form-')), 'deck.pdf');
    const r = spawnSync(process.execPath, [EMULATOR, md, out], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    const how = r.signal
      ? ` [killed by ${r.signal}${r.error?.code ? `, ${r.error.code}` : ''} — the ${TIMEOUT}ms harness cap]`
      : '';
    // The render must still SUCCEED. HARD RULE #29's posture: we warn and coach,
    // we never refuse an author's deck.
    assert.equal(r.status, 0, `emulator failed${how}: ${r.stderr}`);
    assert.ok(fs.existsSync(out) && fs.statSync(out).size > 1000, 'no PDF was written');
    // Read both streams so a move between them does not silently turn this green.
    return `${r.stdout}\n${r.stderr}`;
  }

  const warnings = (output) => output.split('\n').filter((l) => l.startsWith('warning:'));

  test('a deck carrying the three chrome-suppressing shapes is told what moved',
    { timeout: TIMEOUT }, () => {
      const out = render(fixture('retired-form-shapes.md'));

      // Each shape is named on its own line, because each is a separate edit the
      // author has to make.
      assert.match(out, /`form: off` is retired/, 'the deck key');
      assert.match(out, /this deck-wide class opted EVERY slide out/, 'the deck-wide class token');
      assert.match(out, /a slide cannot opt out of Form/, 'the per-slide token');

      // The consequence, not just the fact — this is what makes it actionable.
      assert.match(out, /masthead band/);
      // And where to go for the fix.
      assert.match(out, /lattice lint/);

      // The per-slide finding carries its slide number; a bare list of identical
      // lines would not tell the author which slide to open.
      assert.match(out, /warning: slide \d+: `no-form` is retired/);
    });

  test('a deck carrying only INERT retired shapes is not nagged',
    { timeout: TIMEOUT }, () => {
      const out = render(fixture('retired-form-inert.md'));
      assert.deepEqual(
        warnings(out).filter((l) => /\bform\b/.test(l)), [],
        'an inert `form: standard` / `form` token renders identically — warning about it is noise');
    });
});
