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
 *     find the note in each artifact class — so a pass here means "absent", not
 *     "unlooked-for".
 *
 * Slow tier (spawns Chromium once per case). See engineering/pipeline.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawnSync, execFileSync } = require('child_process');

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
    const formats = [...block[1].matchAll(/'\.([a-z0-9]+)'\s*:\s*'([a-z]+)'/g)].map((m) => m[2]);
    assert.ok(formats.length > 0, 'OUT_FORMATS parsed to zero rows');
    return [...new Set(formats)];
  }

  // ── The cases: format × the flags that select a different write path ────────────
  // `format` must match a value in OUT_FORMATS; the coverage test below enforces it.
  // `--notes` is passed everywhere so the sidecar is produced wherever a path writes
  // one, and the scan walks the whole output directory rather than one named file.
  const CASES = [
    { name: 'pdf (vector)', format: 'pdf', out: 'deck.pdf', args: ['--notes'] },
    // The raster branch: its own writeNotesSidecar call site, and the second leak found.
    { name: 'pdf --raster', format: 'pdf', out: 'raster.pdf', args: ['--notes', '--raster'] },
    // Paper-fit lands in the same branch as --raster but through a different flag.
    { name: 'pdf --paper', format: 'pdf', out: 'paper.pdf', args: ['--notes', '--paper', 'a4'] },
    // #1837: PowerPoint shows ppt/notesSlides/*.xml to anyone who opens the file.
    { name: 'pptx', format: 'pptx', out: 'deck.pptx', args: ['--notes'] },
    { name: 'png', format: 'png', out: 'deck.png', args: ['--notes'] },
    { name: 'imageset (.zip)', format: 'imageset', out: 'deck.zip', args: ['--notes'] },
    { name: 'html', format: 'html', out: 'deck.html', args: ['--notes'] },
    // #1833: the self-contained player, the copy you email to someone.
    { name: 'html --player', format: 'html', out: 'player.html', args: ['--notes', '--player'] },
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
  function scanFile(file) {
    const buf = fs.readFileSync(file);
    if (buf.includes(TOKEN)) return true;
    // A zip container (.pptx, .zip) — scan each entry's decompressed bytes.
    if (buf.subarray(0, 2).toString() === 'PK') {
      try {
        const names = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).split('\n').filter(Boolean);
        for (const n of names) {
          try {
            if (execFileSync('unzip', ['-p', file, n], { maxBuffer: 1 << 28 }).includes(TOKEN)) return true;
          } catch { /* an entry that will not extract cannot be carrying readable text */ }
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

  function leakingFiles(dir) {
    return producedFiles(dir).filter(scanFile).map((f) => path.relative(dir, f));
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
    test(`CONTROL — the note IS present without --strip-notes: ${c.name}`, { timeout: TIMEOUT }, () => {
      const dir = tmpDir();
      render(dir, c);
      assert.ok(
        leakingFiles(dir).length > 0,
        `the probe found no note in an UNSTRIPPED ${c.name} export. The strip assertion for this `
        + 'case would therefore pass without proving anything — fix the probe, not the assertion.'
      );
    });
  }

  // ── 3. The claim ───────────────────────────────────────────────────────────────
  for (const c of CASES) {
    test(`--strip-notes leaves no note in: ${c.name}`, { timeout: TIMEOUT }, () => {
      const dir = tmpDir();
      render(dir, c, ['--strip-notes']);
      assert.deepEqual(
        leakingFiles(dir), [],
        `${c.name}: --strip-notes was passed and "${TOKEN}" still ships in these artifacts`
      );
    });
  }
});
