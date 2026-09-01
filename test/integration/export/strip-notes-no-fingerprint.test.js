/**
 * Integration: a `--strip-notes` export is byte-identical to the same deck written
 * WITHOUT notes.
 *
 * `strip-notes-every-format.test.js` asks "is the note text gone?". This file asks the
 * question that survived it: "can a recipient still tell WHICH slides had one?" — #1985.
 *
 * The old answer was yes, and cheaply. The export removed each note's comment NODE from
 * already-rendered HTML and left the whitespace the comment had occupied, so a stripped
 * slide carried exactly one byte more than the same slide written without a note. Five
 * noted slides, five one-byte tells, mapping 1:1 onto the export log's own note count.
 *
 * WHY THAT IS REACHABLE BY THE RECIPIENT and not just by us: the player ships the deck's
 * own scrubbed source in the `lattice-doc` envelope, for round-trip re-import. So the
 * counterfactual is computable FROM THE SHIPPED FILE ALONE — re-export that source with
 * the same engine and diff. No access to the original deck needed.
 *
 * THE SHAPE OF THE ASSERTION IS THE POINT, and it is why this is not a unit test.
 * `stripNotesFromSource` returning the right string proves nothing on its own: the leak
 * was in what the EXPORT did with it, and the fix (render pass 2 runs on the scrubbed
 * source — lattice-emulator.js) lives in the wiring, not in notes-core. So both sides
 * here are real CLI exports of real decks, compared as bytes.
 *
 * THE COUNTERFACTUAL IS COMMITTED, NOT COMPUTED. `strip-notes-deck-no-notes.md` is the
 * fixture as a person would have written it with nothing to say — single blank lines, no
 * residue of a deleted line. Deriving the twin here with a regex instead would let the
 * test drift into asserting that the scrub agrees with a second copy of the scrub, which
 * is exactly the tautology the measurement has to avoid. It also pins the harder version
 * of the claim: the blank-line RUN a removed line leaves behind must collapse to the same
 * render as the line never having existed.
 *
 * THE CONTROL is not optional. An assertion that two renders match passes just as happily
 * when the probe is blind — comparing the wrong slice, or two empty arrays. So the control
 * exports the SAME fixture WITHOUT `--strip-notes` and asserts the sections DO differ.
 * A pass here therefore means "identical", not "unlooked-for".
 *
 * WHY `--player` AND NOT A PLAIN `.html`: the player is the artifact the attack is against
 * — it is the file you email, and the one carrying the scrubbed source that makes the
 * counterfactual computable by its recipient. It is also the only one this probe can read
 * honestly: a plain `.html` export inlines the unminified engine stylesheet, whose CSS
 * COMMENTS contain the literal text `<section>`, and the depth-aware section walker counts
 * those as slides and returns nothing usable. Measured — the first cut of this file passed
 * its own claim on two empty arrays, which is precisely what the control below exists to
 * catch.
 *
 * Slow tier: three CLI player exports (~10s each — the player bakes its DOM in Chromium).
 * See engineering/pipeline.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { splitSections } = require('../../../lib/core/split-sections.js');

describe('strip-notes: no whitespace fingerprint', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const NOTED = path.join(ROOT, 'test', 'fixtures', 'strip-notes-deck.md');
  const TWIN = path.join(ROOT, 'test', 'fixtures', 'strip-notes-deck-no-notes.md');
  const TIMEOUT = 180000;

  // Rendered slide bytes, and ONLY those. A whole-file diff is not the question: the two
  // decks have different filenames and every export stamps a build time, so it would fail
  // for reasons that disclose nothing. The `<section data-lattice-slide>` elements are the
  // rendered deck.
  function sections(file) {
    const html = fs.readFileSync(file, 'utf8');
    return splitSections(html)
      .filter((p) => p.type === 'section' && /data-lattice-slide=/.test(p.openTag))
      .map((p) => `${p.openTag}${p.inner}</section>`);
  }

  function exportHtml(dir, deck, name, args) {
    const out = path.join(dir, name);
    const r = spawnSync(process.execPath, [EMULATOR, deck, out, '--quiet', ...args], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed for ${name}: ${r.stderr}`);
    return out;
  }

  test('a --strip-notes export and the note-free twin render identical bytes', { timeout: TIMEOUT }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-fingerprint-'));
    const stripped = sections(exportHtml(dir, NOTED, 'stripped.html', ['--player', '--strip-notes']));
    const twin = sections(exportHtml(dir, TWIN, 'twin.html', ['--player']));
    const asAuthored = sections(exportHtml(dir, NOTED, 'authored.html', ['--player']));

    // The probe can see something at all.
    assert.ok(stripped.length >= 3, `expected the fixture's slides, got ${stripped.length}`);
    assert.equal(stripped.length, twin.length, 'the two fixtures must be the same deck minus its notes');

    // CONTROL — without the flag the note is materialized, so the sections MUST differ.
    // Without this arm, a probe that returned two empty arrays would pass the claim below.
    assert.notDeepEqual(asAuthored, twin, 'control failed: the noted deck should differ from the note-free one');

    // THE CLAIM. Per slide, so a failure names which one — the fingerprint was per slide.
    for (let i = 0; i < stripped.length; i++) {
      assert.equal(
        stripped[i], twin[i],
        `slide ${i + 1}: a --strip-notes export differs from the note-free deck by `
        + `${stripped[i].length - twin[i].length} byte(s), which names this slide as one that carried a note`
      );
    }
  });
});
