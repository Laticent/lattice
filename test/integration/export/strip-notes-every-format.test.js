/**
 * Integration: `--strip-notes` removes the speaker note from EVERY exported format.
 *
 * This suite exists because the three leaks it now guards (#1837 PPTX, the raster-PDF
 * notes sidecar, #1833 the player's notes sheet) all survived for the same reason:
 * coverage was PER-PATH. Each export path had its own test, so a path nobody thought
 * about was simply untested, and `--strip-notes` — a flag whose entire job is privacy —
 * shipped the author's private text out of three separate channels.
 *
 * So the shape here is the point, not the assertions. Two rules make a fourth channel
 * hard to open quietly:
 *
 *   1. The case list is checked against the emulator's OWN closed format table
 *      (`OUT_FORMATS` in lattice-emulator.js, which its comment calls closed: "A format
 *      is added by adding a row here"). Add a row without adding a case and this suite
 *      fails, naming the uncovered format. The next format is covered by construction
 *      rather than by someone remembering.
 *
 *      WHAT THIS LOCKS IS THE **FORMAT** AXIS, NOT THE CHANNEL AXIS — say it plainly,
 *      because the stronger claim is tempting and false. Four output channels are written
 *      OUTSIDE that table: the `<out>.html` sidecar (emitted for every non-html format),
 *      the `<out>.notes.txt` sidecar, the `.vtt` caption sidecar, and the `--player` /
 *      `--fluid` rewrite (which sits outside the format if/else, so it applies to pdf,
 *      pptx, png and zip too). Those are caught here only because `producedFiles` walks
 *      the whole output directory — real coverage, but incidental, and only for the flag
 *      combinations `CASES` happens to name. A new SIDECAR would not fail this suite the
 *      way a new format does.
 *
 *   2. A format is not one write path. The raster-PDF sidecar leak was in `.pdf` — the
 *      SAME table row as the vector path that was already correct — because `--raster`
 *      selects a different branch with its own `writeNotesSidecar` call. A per-format
 *      loop alone would have walked straight past it. Cases therefore enumerate format
 *      × the flags that select a different write path.
 *
 * TWO THINGS THAT WOULD MAKE THIS GATE LIE, both defended against below:
 *
 *   · A PDF note is NOT greppable. `embedNotesInPdf` writes the note as a text
 *     annotation and pdf-lib deflates the object stream that carries it, so a raw byte
 *     scan of a leaking PDF returns ZERO hits. Measured while writing this suite. The
 *     probe therefore inflates every `stream…endstream` region before scanning, and
 *     `scanFile` treats an archive (.pptx / .zip) as a container and scans its entries.
 *   · A gate that can never see the token passes on an empty deck just as happily. The
 *     CONTROL test renders the same fixture WITHOUT the flag and asserts the probe DOES
 *     find the note — so a pass here means "absent", not "unlooked-for". The control is
 *     asserted PER ARTIFACT (`carriesNote`), not per directory: a directory-scoped control
 *     was satisfied by the `<out>.html` sidecar alone in all eight cases, which meant both
 *     the PDF-inflate and the zip layer could have been deleted with every control still
 *     green — the two layers the raw string match cannot stand in for.
 *
 * Slow tier (spawns Chromium once per case). See engineering/pipeline.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const JSZip = require('jszip');

describe('strip-notes: every export format', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'strip-notes-deck.md');
  // The note text the fixture carries on all three slides. Absence of THIS is the claim.
  const TOKEN = 'PRIVATELEAKTOKEN';
  const TIMEOUT = 180000;

  // ── The emulator's own closed format table, read from source ────────────────────
  // Parsed rather than duplicated: a hand-copied list is exactly the per-path coverage
  // this suite exists to replace. If the table is renamed or restructured the parse
  // fails loudly here, which is the correct outcome — someone must then look.
  function outFormatsFromSource() {
    const src = fs.readFileSync(EMULATOR, 'utf8');
    const block = /const OUT_FORMATS = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(src);
    assert.ok(block, 'could not find the OUT_FORMATS table in lattice-emulator.js — has it moved?');
    // TWO passes, and the second is the one that matters. Counting ROWS is deliberately
    // permissive (any key shape, any value shape); reading VALUES is necessarily narrower.
    // If the narrow pass reads fewer rows than the permissive one saw, some row is written in
    // a shape this parser cannot understand — and the failure mode without this check is the
    // WORST one available: `formats` silently comes back short, `missing` is empty, the
    // coverage arm passes, and the new format ships untested. Measured: a row added as
    // "svgz": "svgSet" (double quotes, or a camelCase value, or a hyphenated one, or a
    // multi-dot key) vanished from the old single-pass parse with no test failing. That is
    // #1837 all over again, which is the exact thing this file exists to prevent.
    const rows = [...block[1].matchAll(/^\s*(?:'[^']*'|"[^"]*"|\[[^\]]*\]|[A-Za-z_$][\w$]*)\s*:/gm)].length;
    const pairs = [...block[1].matchAll(/['"]\.[A-Za-z0-9.]+['"]\s*:\s*['"]([A-Za-z0-9_-]+)['"]/g)];
    assert.ok(rows > 0, 'OUT_FORMATS parsed to zero rows');
    assert.equal(
      pairs.length, rows,
      `OUT_FORMATS has ${rows} row(s) but only ${pairs.length} could be read as '<ext>': '<format>'. `
      + 'A row is written in a shape this parser cannot read, so it would be silently EXCLUDED '
      + 'from the coverage check below — the failure this cross-check exists to make loud. '
      + 'Widen the pair pattern (and add the --strip-notes case for the new format).'
    );
    return [...new Set(pairs.map((m) => m[1]))];
  }

  // ── The cases: format × the flags that select a different write path ────────────
  // `format` must match a value in OUT_FORMATS; the coverage test below enforces it.
  // `--notes` is passed everywhere so the sidecar is produced wherever a path writes
  // one, and the scan walks the whole output directory rather than one named file.
  // `carriesNote` says whether the NAMED artifact can itself hold note text. It drives the
  // control assertion below, and it is not a detail: for `png` and `imageset` the note never
  // enters the deliverable at all (a raster has no text layer; the zip holds images plus a
  // manifest), so demanding it there would assert something false. Those two cases still earn
  // their place — they prove the sidecars written ALONGSIDE them are clean.
  const CASES = [
    { name: 'pdf (vector)', format: 'pdf', out: 'deck.pdf', args: ['--notes'], carriesNote: true },
    // The raster branch: its own writeNotesSidecar call site, and the second leak found.
    { name: 'pdf --raster', format: 'pdf', out: 'raster.pdf', args: ['--notes', '--raster'], carriesNote: true },
    // Paper-fit lands in the same branch as --raster but through a different flag.
    { name: 'pdf --paper', format: 'pdf', out: 'paper.pdf', args: ['--notes', '--paper', 'a4'], carriesNote: true },
    // #1837: PowerPoint shows ppt/notesSlides/*.xml to anyone who opens the file.
    { name: 'pptx', format: 'pptx', out: 'deck.pptx', args: ['--notes'], carriesNote: true },
    { name: 'png', format: 'png', out: 'deck.png', args: ['--notes'], carriesNote: false },
    { name: 'imageset (.zip)', format: 'imageset', out: 'deck.zip', args: ['--notes'], carriesNote: false },
    { name: 'html', format: 'html', out: 'deck.html', args: ['--notes'], carriesNote: true },
    // #1833: the self-contained player, the copy you email to someone.
    { name: 'html --player', format: 'html', out: 'player.html', args: ['--notes', '--player'], carriesNote: true },
    // `--embed-source` bakes the deck's own MARKDOWN into the artifact, and its privacy depends
    // on a TEXT MATCHER (`stripNotesFromSource`) rather than on an all-null array like every
    // case above. That makes it the one channel here that can regress from a change nowhere
    // near the writers — which is exactly why it is worth a case of its own.
    { name: 'pdf --embed-source', format: 'pdf', out: 'src.pdf', args: ['--notes', '--embed-source'], carriesNote: true },
  ];

  function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-stripnotes-'));
  }

  function render(dir, c, extra = []) {
    const out = path.join(dir, c.out);
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out, '--quiet', ...c.args, ...extra], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed for ${c.name}: ${r.stderr}`);
    return out;
  }

  // Every file the render produced, not just the named deliverable — a sidecar leak is
  // still a leak, and the HTML sidecar is written alongside every non-html format.
  function producedFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (entry.isFile()) out.push(path.join(entry.parentPath || entry.path || dir, entry.name));
    }
    return out;
  }

  // Does this file carry the token ANYWHERE a reader could reach it? Three layers,
  // because the artifacts hide text three different ways.
  async function scanFile(file) {
    const buf = fs.readFileSync(file);
    if (buf.includes(TOKEN)) return true;
    // A zip container (.pptx, .zip) — scan each entry's decompressed bytes.
    //
    // jszip, NOT the `unzip` binary, for two measured reasons. `unzip -p` GLOB-matches the
    // entry name it is given, so an entry called `chart[1].xml` exits 11 and the catch below
    // swallowed it: a leak in any entry whose name contains `[`, `*` or `?` was invisible.
    // And `ci.yml` never installs `unzip` — it installs poppler-utils and the emoji font — so
    // this arm rode on the runner image happening to carry it. jszip is already a
    // devDependency and is what every other zip assertion in this repo uses (HARD RULE #15).
    if (buf.subarray(0, 2).toString() === 'PK') {
      try {
        const zip = await JSZip.loadAsync(buf);
        for (const entry of Object.values(zip.files)) {
          if (entry.dir) continue;
          if ((await entry.async('nodebuffer')).includes(TOKEN)) return true;
        }
      } catch { /* not readable as a zip after all — the raw scan above stands */ }
      return false;
    }
    // A PDF hides its note annotation in a DEFLATED object stream: the raw scan above
    // finds nothing in a PDF that is definitely leaking. Inflate and re-scan.
    if (buf.subarray(0, 5).toString() === '%PDF-') {
      for (const m of buf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
        try {
          if (zlib.inflateSync(Buffer.from(m[1], 'latin1')).includes(TOKEN)) return true;
        } catch { /* not a deflate stream (raw image data, etc.) — nothing to read */ }
      }
    }
    return false;
  }

  async function leakingFiles(dir) {
    const out = [];
    for (const f of producedFiles(dir)) if (await scanFile(f)) out.push(path.relative(dir, f));
    return out;
  }

  // ── 1. The loop enumerates the emulator's table, not a list someone typed ───────
  test('every format in the emulator OUT_FORMATS table has a case', () => {
    const declared = outFormatsFromSource();
    const covered = new Set(CASES.map((c) => c.format));
    const missing = declared.filter((f) => !covered.has(f));
    assert.deepEqual(
      missing, [],
      `OUT_FORMATS gained ${missing.join(', ')} with no --strip-notes case. Add one to CASES: `
      + 'a format nobody adds a case for is a format nobody tests, which is how #1837 shipped.'
    );
    // And the reverse — a case naming a format the table does not have is a stale case.
    const unknown = [...covered].filter((f) => !declared.includes(f));
    assert.deepEqual(unknown, [], `CASES names formats absent from OUT_FORMATS: ${unknown.join(', ')}`);
  });

  // ── 2. The control: the probe can actually SEE the note when it is there ────────
  // Without this, "no hits" proves nothing about the strip — only that we did not look
  // hard enough. Every artifact class is represented (deflated PDF, zip container,
  // plain HTML), because each is scanned by a different layer of scanFile.
  for (const c of CASES) {
    test(`CONTROL — the note IS present without --strip-notes: ${c.name}`, { timeout: TIMEOUT }, async () => {
      const dir = tmpDir();
      render(dir, c);
      const found = await leakingFiles(dir);
      // PER-ARTIFACT, not per-directory. A directory-scoped control was worthless: every render
      // also writes the `<out>.html` sidecar, which carries the note in plain text, so ONE raw
      // string match satisfied every control at once. The PDF-inflate layer and the zip layer
      // could both have been deleted with all controls still green — the two layers that exist
      // precisely because the raw match does NOT reach those artifacts.
      if (c.carriesNote) {
        assert.ok(
          found.includes(c.out),
          `the probe found no note in the UNSTRIPPED ${c.out}. The strip assertion for this case `
          + `would pass without proving anything about ${c.out} itself — fix the probe, not the `
          + `assertion. (It did find: ${found.join(', ') || 'nothing at all'})`
        );
      } else {
        // The deliverable structurally cannot hold text, so the honest control is the sidecar.
        assert.ok(
          found.length > 0 && !found.includes(c.out),
          `expected the note in a sidecar beside ${c.out} but not in ${c.out} itself (a raster / `
          + `image zip has no text layer). Found: ${found.join(', ') || 'nothing at all'}`
        );
      }
    });
  }

  // ── 3. The claim ───────────────────────────────────────────────────────────────
  for (const c of CASES) {
    test(`--strip-notes leaves no note in: ${c.name}`, { timeout: TIMEOUT }, async () => {
      const dir = tmpDir();
      render(dir, c, ['--strip-notes']);
      assert.deepEqual(
        await leakingFiles(dir), [],
        `${c.name}: --strip-notes was passed and "${TOKEN}" still ships in these artifacts`
      );
    });
  }
});
