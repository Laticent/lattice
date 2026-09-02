/**
 * Integration: a `--strip-notes` / `--strip-captions` export is byte-identical to the same
 * deck written WITHOUT the channel it strips.
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
 * THE CAPTION ARMS ARE THE SAME CLAIM ONE CHANNEL OVER (#2003). The #1985 fix was note-only:
 * `stripCaptionsFromSource` stayed a span-only replace and nothing re-rendered from it, so a
 * captioned slide carried the byte a noted slide had just stopped carrying. That the two flags
 * now share one cut is pinned in `test/unit/authoring/notes-core.test.js`; what CANNOT be pinned
 * there is the wiring — whether the export renders the composed source it ships — which is
 * exactly where #1985 lived and where #2003 lived after it. So these are real CLI exports too.
 *
 * Slow tier: ten CLI player exports (~10s each — the player bakes its DOM in Chromium).
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
  // A deck whose notes sit where a comment line is load-bearing — no blank line on either side.
  const BOUNDARY = path.join(ROOT, 'test', 'fixtures', 'strip-notes-deck-boundary.md');
  // The caption channel's three (#2003). CAPTIONED carries an inline caption on slide 1, a
  // front-matter `captions:` entry for slide 3 and a speaker note on slide 2 — so the two flags
  // can be measured apart. NO_CAPTIONS is the same deck with the caption material never typed
  // and the note kept; BARE has neither channel.
  const CAPTIONED = path.join(ROOT, 'test', 'fixtures', 'strip-captions-deck.md');
  const NO_CAPTIONS = path.join(ROOT, 'test', 'fixtures', 'strip-captions-deck-no-captions.md');
  const BARE = path.join(ROOT, 'test', 'fixtures', 'strip-captions-deck-bare.md');
  const CAPTION_BOUNDARY = path.join(ROOT, 'test', 'fixtures', 'strip-captions-deck-boundary.md');
  // A deck whose ATTACHED document is not the one the export renders: a Mermaid fence makes the
  // two differ, and a note indented inside a list item makes the cut choice change the bytes.
  const PREPROCESSED = path.join(ROOT, 'test', 'fixtures', 'strip-notes-deck-preprocessed.md');
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

  // Returns the artifact path, and records the run's own log under it — the fidelity guard
  // reports a fallback there, and a test that cannot see the fallback cannot tell a scrub that
  // preserved the deck from a guard that rescued one that did not.
  const logs = new Map();
  function exportHtml(dir, deck, name, args) {
    const out = path.join(dir, name);
    const r = spawnSync(process.execPath, [EMULATOR, deck, out, '--quiet', ...args], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed for ${name}: ${r.stderr}`);
    logs.set(out, `${r.stdout}${r.stderr}`);
    return out;
  }

  // A note comment is an HTML BLOCK, so it separates what is above it from what is below.
  // Removing it without putting the boundary back MOVES THE DECK, and both shapes below were
  // measured doing exactly that on this CLI: `Some text` / note / `---` exported THREE slides
  // where the author wrote two (`Some text\n---` is a setext H2, not a slide break) and the
  // `.vtt` bound the author's front-matter caption for slide 2 onto the phantom; and a note
  // between two paragraphs merged them into one with a `<br>`.
  //
  // Slide COUNT is the assertion because it is the one a reader can check against the fixture
  // by eye, and because it is what mis-binds every per-slide channel downstream — captions,
  // narration cues, PDF page mapping. A privacy flag must not restructure a deck.
  test('a --strip-notes export does not gain or lose a slide', { timeout: TIMEOUT }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-boundary-'));
    const authored = sections(exportHtml(dir, BOUNDARY, 'authored.html', ['--player']));
    const strippedPath = exportHtml(dir, BOUNDARY, 'stripped.html', ['--player', '--strip-notes']);
    const stripped = sections(strippedPath);
    assert.equal(authored.length, 2, 'guard: the fixture is a two-slide deck');
    // THE SCRUB ITSELF must hold, not merely the guard behind it. Both keep the artifact
    // correct, so without this arm a scrub that re-cut the deck would pass here silently —
    // and that export DOES still name which slides carried a note.
    assert.doesNotMatch(
      logs.get(strippedPath), /could not remove a note comment/,
      'the fidelity guard had to fall back, so the scrub is not preserving the block boundary'
    );
    assert.equal(
      stripped.length, authored.length,
      `--strip-notes exported ${stripped.length} slides for a ${authored.length}-slide deck: `
      + 'a note comment was acting as a block boundary and removing it re-cut the deck'
    );
    // The paragraph on slide 2 must still be two paragraphs, not one joined by a <br>.
    assert.equal(
      (stripped[1].match(/<p>/g) || []).length,
      (authored[1].match(/<p>/g) || []).length,
      'slide 2: the two paragraphs the author wrote are still two paragraphs'
    );
  });

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

  // ── The caption channel (#2003) ────────────────────────────────────────────────────────────
  test('a --strip-captions export and the caption-free twin render identical bytes', { timeout: TIMEOUT }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-caption-fingerprint-'));
    // `--strip-captions` ALONE, with the note channel left on: the configuration the issue
    // measured, and the one that had no second pass at all before this fix.
    const stripped = sections(exportHtml(dir, CAPTIONED, 'stripped.html', ['--player', '--strip-captions']));
    const twin = sections(exportHtml(dir, NO_CAPTIONS, 'twin.html', ['--player']));
    const asAuthored = sections(exportHtml(dir, CAPTIONED, 'authored.html', ['--player']));

    assert.equal(stripped.length, 3, `expected the fixture's three slides, got ${stripped.length}`);
    assert.equal(stripped.length, twin.length, 'the two fixtures must be the same deck minus its captions');
    // CONTROL — without the flag the caption comment's whitespace residue is still in the
    // rendered bytes, so the sections MUST differ. This is the defect itself, held in place: a
    // probe that could not see it would pass the claim below on any pair of blind arrays.
    assert.notDeepEqual(asAuthored, twin, 'control failed: the captioned deck should differ from the caption-free one');

    for (let i = 0; i < stripped.length; i++) {
      assert.equal(
        stripped[i], twin[i],
        `slide ${i + 1}: a --strip-captions export differs from the caption-free deck by `
        + `${stripped[i].length - twin[i].length} byte(s), which names this slide as one that carried a caption`
      );
    }
  });

  test('the SOURCE the envelope ships is the caption-free deck, byte for byte', { timeout: TIMEOUT }, () => {
    // THE ARM THE RENDERED-BYTES ONE CANNOT REPLACE, and the mutation that proved it: give the
    // caption strip its old span-only cut back and every section arm above still passes, because
    // pass 2 re-renders and markdown-it collapses the blank line the span left behind. The tell
    // survives one level down — in the source the envelope carries for re-import, where a blank
    // line, or a `\n\n\n` run, marks each slide that had a caption. That one is the CHEAPER tell:
    // `grep -c` on the shipped file, no re-render needed. So compare the shipped source itself.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-caption-source-'));
    const { parseEnvelope } = require(path.join(ROOT, 'lib', 'core', 'lattice-doc.js'));
    const sourceOf = (file) => parseEnvelope(fs.readFileSync(file, 'utf8')).source;

    const stripped = sourceOf(exportHtml(dir, CAPTIONED, 'stripped.html', ['--player', '--strip-captions']));
    const twin = sourceOf(exportHtml(dir, NO_CAPTIONS, 'twin.html', ['--player']));
    const asAuthored = sourceOf(exportHtml(dir, CAPTIONED, 'authored.html', ['--player']));

    // The probe can see something, and the control shows it can see the caption material when
    // it is there — otherwise "identical" would just mean "read nothing".
    assert.match(stripped, /Second slide/, 'guard: the envelope carries the deck source');
    assert.match(asAuthored, /CAPTIONLEAKTOKEN alpha/, 'control: the unstripped export carries the caption');
    assert.doesNotMatch(twin, /CAPTIONLEAKTOKEN/, 'guard: the twin never had a caption');

    assert.doesNotMatch(stripped, /CAPTIONLEAKTOKEN/, 'no caption text survives in the shipped source');
    assert.doesNotMatch(stripped, /\n[ \t]*\n[ \t]*\n/, 'no blank-line run marks where a caption was');
    assert.equal(
      stripped, twin,
      'the shipped source differs from the deck written without captions, so it still names which '
      + 'slides carried one'
    );
  });

  test('the SOURCE the envelope ships is the note-free deck, byte for byte (#2039)', { timeout: TIMEOUT }, () => {
    // THE ARM THE NOTE CHANNEL WAS MISSING, and its absence is why a one-byte residue shipped
    // for two releases. The caption channel got the byte-for-byte arm above in #2003; the note
    // channel had only the rendered-bytes arms, which cannot see this class at all — a trailing
    // blank line renders identically, and one blank is not a `\n\n\n` run either. So both of the
    // probes that exist looked straight past it, and the fixture's own hand-written twin — the
    // deck "as a person would have written it with nothing to say" — was sitting in the tree
    // holding the answer. When the artifact IS the bytes, assert on the bytes.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-note-source-'));
    const { parseEnvelope } = require(path.join(ROOT, 'lib', 'core', 'lattice-doc.js'));
    const sourceOf = (file) => parseEnvelope(fs.readFileSync(file, 'utf8')).source;

    const stripped = sourceOf(exportHtml(dir, NOTED, 'stripped.html', ['--player', '--strip-notes']));
    const twin = sourceOf(exportHtml(dir, TWIN, 'twin.html', ['--player']));
    const asAuthored = sourceOf(exportHtml(dir, NOTED, 'authored.html', ['--player']));

    // The probe can see something, and the control shows it can see the note when it is there.
    assert.match(stripped, /Third slide/, 'guard: the envelope carries the deck source');
    assert.match(asAuthored, /PRIVATELEAKTOKEN alpha/, 'control: the unstripped export carries the note');
    assert.doesNotMatch(twin, /PRIVATELEAKTOKEN/, 'guard: the twin never had a note');

    assert.doesNotMatch(stripped, /PRIVATELEAKTOKEN/, 'no note text survives in the shipped source');
    assert.doesNotMatch(stripped, /\n[ \t]*\n[ \t]*\n/, 'no blank-line run marks where a note was');
    assert.equal(
      stripped, twin,
      'the shipped source differs from the deck written without notes, so it still names which '
      + 'slides carried one'
    );
  });

  test('the PDF attachment is cut under a boundary measured on the document it ships (#2040)', { timeout: TIMEOUT }, () => {
    // `--embed-source` attaches `md` — the deck as the author wrote it, pre-Mermaid — while the
    // boundary was measured against `rawMd`, the pre-rendered source pass 2 renders. On a deck
    // where those differ, the cut used to be one measured on the other document.
    //
    // THE FIXTURE IS BUILT TO REACH THAT, and no deck this repo ships does: it needs BOTH a
    // Mermaid fence (so the two documents differ) AND a note where the cut choice changes the
    // bytes (indented inside a list item — `preserve` puts a blank line there and turns the
    // author's TIGHT list LOOSE, `drop` reproduces it). The assertion is the list: `- Revenue`
    // followed directly by `- Costs`, which is the author's own tight list.
    //
    // WHAT THIS ARM DOES NOT PROVE, stated because the obvious reading is wrong: it is NOT
    // mutation-discriminating for the boundary. Back the `attachmentCut` change out and it still
    // passes — the Mermaid pre-render does not touch the lines around a note inside a list, so
    // `rawMd` and `md` happen to want the SAME cut here and the old code reached the right answer
    // by luck. Making it discriminate needs a deck where the pre-render changes a comment's own
    // neighbors, and no realistic shape was found that does. That is the same fact the guard was
    // written for and #2040 records: the exposure is structural, with zero live instances. So this
    // is PATH COVERAGE — it drives the three-step guard end to end on a real export and pins that
    // the attachment stays the author's document, notes gone, list intact.
    //
    // NOTHING ELSE COVERS THE DECISION, and it would be wrong to imply otherwise: no test names
    // `attachmentCut`, and `notes-core.test.js` cannot — it exercises a pure kernel that knows
    // nothing of `md`, `rawMd` or `scrubBoundary`. What bounds the risk is not coverage but the
    // shape of the thing: `boundary` only ever changes WHITESPACE, never which comments are
    // removed, so a wrong answer here costs re-import fidelity and cannot leak a note.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-attach-'));
    const out = path.join(dir, 'attached.pdf');
    const r = spawnSync(
      process.execPath,
      [EMULATOR, PREPROCESSED, out, '--quiet', '--embed-source', '--strip-notes'],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT }
    );
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);

    // DO NOT grep the PDF: pdf-lib deflates the object stream carrying the attachment, so a raw
    // byte scan of a definitely-leaking file returns zero hits (same trap as `embedNotesInPdf`,
    // see engineering/gotchas/export.md). Inflate first.
    const zlib = require('zlib');
    const bytes = fs.readFileSync(out);
    const attached = [...bytes.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)endstream/g)]
      .map((m) => { try { return zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('utf8'); } catch { return m[1]; } })
      .find((t) => t.includes('Revenue up 12 percent'));
    assert.ok(attached, 'control: the attachment is readable — if this fails the probe proves nothing');

    assert.doesNotMatch(attached, /PREPROCLEAKTOKEN/, 'the attached source carries no note text');
    assert.match(attached, /```mermaid/, 'the attachment is the AUTHOR\'s source, not the pre-rendered one');
    assert.match(
      attached, /- Revenue up 12 percent\n- Costs flat/,
      'the list stays tight: the cut was measured on the attached document, not on the rendered one'
    );
  });

  test('a deck with nothing to strip gets NO block-boundary warning from --embed-source (#2040)', { timeout: TIMEOUT }, () => {
    // A REGRESSION THIS PR CAUSED AND AN INDEPENDENT CHECKER CAUGHT. `attachmentCut` reports
    // whether the boundary it used was measured, and it inherits that from pass 2. But pass 2
    // has an early return for "this deck has nothing either flag removes" — and that path set
    // the boundary without recording that it had settled the question. So `--embed-source
    // --strip-notes` on a deck with no comments at all printed a warning telling the author to
    // move a comment out of a list, on a deck with neither.
    //
    // The class matters more than the case: a warning that fires when nothing is wrong is how a
    // privacy flag's real warnings stop being read. Nothing in the suite covered the flag's
    // no-op path, which is why 8001 unit tests and the whole export tier stayed green.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-nowarn-'));
    const r = spawnSync(
      process.execPath,
      // NOT `--quiet`: the control below needs the run's own log to be observable, and `--quiet`
      // suppresses the very line that proves the probe is reading the right channel.
      [EMULATOR, BARE, path.join(dir, 'bare.pdf'), '--embed-source', '--strip-notes', '--strip-captions'],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT }
    );
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    const log = `${r.stdout}${r.stderr}`;
    assert.doesNotMatch(
      log, /could not have a note or caption comment removed/,
      'the deck has neither channel, so there is nothing the cut could have failed to remove'
    );
    // Control: the probe can see that log at all, and the export really did attach the source.
    assert.match(log, /source embedded/, 'control: this run did attach the source');
  });

  test('--strip-notes and --strip-captions compose to the deck with neither channel', { timeout: TIMEOUT }, () => {
    // The two flags scrub ONE document, so the export measures ONE cut for the composed source.
    // Running them separately and hoping they agree is the shape this arm exists to refuse.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-caption-compose-'));
    const strippedPath = exportHtml(dir, CAPTIONED, 'stripped.html', ['--player', '--strip-notes', '--strip-captions']);
    const stripped = sections(strippedPath);
    const bare = sections(exportHtml(dir, BARE, 'bare.html', ['--player']));

    assert.equal(stripped.length, bare.length, 'the two fixtures must be the same deck minus both channels');
    assert.doesNotMatch(
      logs.get(strippedPath), /could not remove/,
      'the fidelity guard had to fall back, so one of the two scrubs is not preserving the block boundary'
    );
    for (let i = 0; i < stripped.length; i++) {
      assert.equal(
        stripped[i], bare[i],
        `slide ${i + 1}: a --strip-notes --strip-captions export differs from the deck written with `
        + `neither channel by ${stripped[i].length - bare[i].length} byte(s)`
      );
    }
  });

  test('a --strip-captions export does not gain or lose a slide', { timeout: TIMEOUT }, () => {
    // A caption comment is an HTML BLOCK exactly as a note comment is, so removing one can
    // re-cut the deck the same way — `Some text\n---` is a setext H2, not a slide break. The
    // fixture puts a caption in both load-bearing positions the note fixture uses.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-caption-boundary-'));
    const authored = sections(exportHtml(dir, CAPTION_BOUNDARY, 'authored.html', ['--player']));
    const strippedPath = exportHtml(dir, CAPTION_BOUNDARY, 'stripped.html', ['--player', '--strip-captions']);
    const stripped = sections(strippedPath);
    assert.equal(authored.length, 2, 'guard: the fixture is a two-slide deck');
    assert.doesNotMatch(
      logs.get(strippedPath), /could not remove/,
      'the fidelity guard had to fall back, so the caption scrub is not preserving the block boundary'
    );
    assert.equal(
      stripped.length, authored.length,
      `--strip-captions exported ${stripped.length} slides for a ${authored.length}-slide deck: `
      + 'a caption comment was acting as a block boundary and removing it re-cut the deck'
    );
    assert.equal(
      (stripped[1].match(/<p>/g) || []).length,
      (authored[1].match(/<p>/g) || []).length,
      'slide 2: the two paragraphs the author wrote are still two paragraphs'
    );
  });
});
