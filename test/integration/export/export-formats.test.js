/**
 * Integration: the owned multi-format export (PDF / PPTX / PNG) end-to-end.
 *
 * Renders the 3-slide fixture deck through lattice-emulator once per output
 * extension and asserts each artifact is real and well-formed:
 *   - .pdf  : the original vector path still works (regression guard).
 *   - .pptx : a valid OOXML zip with one slide part + one media image per slide.
 *   - .png  : one PNG per slide (`<base>.NNN.png`) at the 2× raster size.
 * No marp-cli — this is the marp-free export path. Slow tier (spawns Chromium);
 * kept tight with the same no-Mermaid fixture the screenshot suite uses.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { spawnSync, execFileSync } = require('child_process');

describe('export-formats', () => {
  const ROOT     = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const FIXTURE  = path.join(ROOT, 'test', 'fixtures', 'preview-deck.md');
  const TIMEOUT  = 60000;

  function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-export-'));
  }

  function run(out) {
    return spawnSync(process.execPath, [EMULATOR, FIXTURE, out, '--quiet'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env },
      timeout: TIMEOUT,
    });
  }

  function readPngDimensions(file) {
    const buf = fs.readFileSync(file);
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `not a PNG: ${file}`);
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  test('renders a valid vector PDF (regression guard)', { timeout: TIMEOUT }, () => {
    const out = path.join(tmpDir(), 'deck.pdf');
    const r = run(out);
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    assert.ok(fs.existsSync(out), 'pdf should exist');
    assert.equal(fs.readFileSync(out).subarray(0, 5).toString(), '%PDF-', 'not a PDF');
  });

  test('renders an OOXML .pptx with one slide + image per slide', { timeout: TIMEOUT }, async () => {
    const out = path.join(tmpDir(), 'deck.pptx');
    const r = run(out);
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    assert.ok(fs.existsSync(out), 'pptx should exist');

    const bytes = fs.readFileSync(out);
    assert.equal(bytes.subarray(0, 4).toString('hex'), '504b0304', 'pptx is not a zip');

    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    const media  = names.filter((n) => /^ppt\/media\/.+\.png$/i.test(n));
    assert.equal(slides.length, 3, `expected 3 slides, got ${slides.length}`);
    assert.equal(media.length, 3, `expected 3 images, got ${media.length}`);
  });

  // Parse a poppler P6 .ppm (raw RGB) into { w, h, data }.
  function readPPM(file) {
    const buf = fs.readFileSync(file);
    let pos = 0;
    const ws = (b) => b === 32 || b === 10 || b === 13 || b === 9;
    const tok = () => {
      while (ws(buf[pos])) pos++;
      const s = pos;
      while (!ws(buf[pos])) pos++;
      return buf.toString('ascii', s, pos);
    };
    assert.equal(tok(), 'P6', `not a P6 ppm: ${file}`);
    const w = +tok();
    const h = +tok();
    tok();      // maxval
    pos += 1;   // single whitespace separator before the pixel block
    return { w, h, data: buf.subarray(pos) };
  }

  // Count pixels near the overflow ring's danger red (#d4351c) along the bottom
  // and left edges — where the 4px inset ring lands, away from the top spectrum
  // band. The ring is a colour-only box-shadow (invisible to pdftotext), so this
  // raster check is what actually guards the strip.
  function ringRedPixels(ppm) {
    const { w, h, data } = readPPM(ppm);
    const red = (i) =>
      Math.abs(data[i] - 212) < 45 && Math.abs(data[i + 1] - 53) < 45 && Math.abs(data[i + 2] - 28) < 45;
    let n = 0;
    for (let y = h - 6; y < h; y++) for (let x = 0; x < w; x++) if (red((y * w + x) * 3)) n++;
    for (let y = 40; y < h; y++) for (let x = 0; x < 6; x++) if (red((y * w + x) * 3)) n++;
    return n;
  }

  test('warns on overflow but keeps the ring out of the exported PDF — even when the deck loads the live runtime', { timeout: TIMEOUT }, () => {
    // The overflow signal (a red inset ring + "OVERFLOWS" tab) is an authoring
    // aid for the live preview; the deliverable must stay clean — a red box in
    // front of a board is worse than the silent clip overflow:hidden already
    // applies. Two mechanisms can paint it: the emulator's own inline watcher
    // (the ring, via the `.overflow` class — removed by the export strip) and
    // the live-preview runtime (lattice-runtime.js — the ring AND the tab, on a
    // MutationObserver/ResizeObserver/rAF loop that would re-mark during print
    // unless the export neutralizes the runtime). The galleries embed that
    // runtime for VS Code preview, so reproduce that exact case: an overflowing
    // slide in a deck that loads the runtime. Assert the emulator (a) warns on
    // stderr and (b) leaves no danger-red ring in the export. Empirically: a
    // built-in render shows ~0 ring pixels; reverting either the strip or the
    // runtime abort shows thousands — so this fails if either regresses.
    const dir = tmpDir();
    // Copy the runtime next to the fixture so `src="lattice-runtime.js"` resolves;
    // without the export-time abort it re-marks the overflow and re-paints the ring.
    fs.copyFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'), path.join(dir, 'lattice-runtime.js'));
    const src = path.join(dir, 'overflow.md');
    const wall = Array.from({ length: 40 }, (_, i) =>
      `- Point ${i + 1}: a deliberately long line of body copy engineered to push this slide's content well past the bottom of the frame so the overflow watcher fires.`,
    ).join('\n');
    fs.writeFileSync(
      src,
      `<!-- _class: content -->\n\n## A slide that cannot possibly fit\n\n${wall}\n\n<script src="lattice-runtime.js"></script>\n`,
    );

    const out = path.join(dir, 'overflow.pdf');
    const r = spawnSync(process.execPath, [EMULATOR, src, out, '--quiet'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    assert.match(r.stderr, /OVERFLOW/, 'expected the emulator to warn about overflow on stderr');

    // Rasterize page 1 at 1:1 (96 dpi → the 4px ring stays 4px) and pixel-check.
    execFileSync('pdftoppm', ['-r', '96', '-f', '1', '-l', '1', out, path.join(dir, 'page')]);
    const ring = ringRedPixels(path.join(dir, 'page-1.ppm'));
    assert.ok(ring < 50, `overflow ring leaked into the export: ${ring} danger-red edge pixels (expected ~0)`);
  });

  // ── PDF portability: SVG-image rasterization, --raster, --embed-source ────

  // A 2-slide deck exercising both SVG image channels: a `![bg]` (CSS
  // background-image on .lattice-bg) and an inline `![](…)` <img> — plus a
  // speaker note and a marker string for the --embed-source round-trip.
  const SOURCE_MARKER = 'LATTICE-EMBED-SOURCE-MARKER-7f3a';
  const NOTE_MARKER   = 'Raster note marker 9c1d';
  function writeSvgFixture(dir) {
    fs.copyFileSync(
      path.join(ROOT, 'examples', 'assets', 'sample-photo-wide.svg'),
      path.join(dir, 'photo.svg'),
    );
    const src = path.join(dir, 'deck.md');
    fs.writeFileSync(src, [
      '---', 'paginate: true', '---', '',
      '<!-- _class: image -->', '',
      '![bg](photo.svg)', '',
      '# SVG background', '',
      `<!-- ${NOTE_MARKER} -->`, '',
      '---', '',
      '<!-- _class: content -->', '',
      '## Inline SVG image', '',
      `${SOURCE_MARKER}`, '',
      '![sample](photo.svg)', '',
    ].join('\n'));
    return src;
  }

  // Parse `pdfimages -list` output into data rows (skip the 2 header lines).
  function pdfImageRows(pdf) {
    const out = execFileSync('pdfimages', ['-list', pdf], { encoding: 'utf8' });
    return out.split('\n').slice(2).filter((l) => l.trim());
  }

  test('rasterizes SVG images in the vector PDF by default (#690 iOS Quartz portability)', { timeout: TIMEOUT }, () => {
    const dir = tmpDir();
    const src = writeSvgFixture(dir);
    const out = path.join(dir, 'deck.pdf');
    const r = spawnSync(process.execPath, [EMULATOR, src, out, '--quiet'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    // Every SVG placement must land as a plain raster image XObject — the
    // universally supported construct — not the shading-pattern / transparency-
    // group vectors Quartz mishandles. One image per placement (bg + inline).
    const rows = pdfImageRows(out);
    assert.ok(rows.length >= 2, `expected ≥2 raster image XObjects (bg + inline), got ${rows.length}:\n${rows.join('\n')}`);
    // The rest of the page stays vector: text must remain selectable.
    const text = execFileSync('pdftotext', [out, '-'], { encoding: 'utf8' });
    assert.match(text, /Inline SVG image/, 'vector text should survive the SVG swap');
  });

  test('--keep-vector-images keeps the SVG placements vector (opt-out)', { timeout: TIMEOUT }, () => {
    const dir = tmpDir();
    const src = writeSvgFixture(dir);
    const out = path.join(dir, 'deck.pdf');
    const r = spawnSync(process.execPath, [EMULATOR, src, out, '--quiet', '--keep-vector-images'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    assert.equal(pdfImageRows(out).length, 0, 'opt-out export should carry no raster image XObjects');
  });

  test('--raster prints one full-page JPEG per slide; notes + --embed-source still apply', { timeout: TIMEOUT }, async () => {
    const dir = tmpDir();
    const src = writeSvgFixture(dir);
    const out = path.join(dir, 'deck.pdf');
    const r = spawnSync(process.execPath, [EMULATOR, src, out, '--quiet', '--raster', '--embed-source'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);

    // One JPEG per page at the 2× raster size, and no fonts (no vector text).
    const rows = pdfImageRows(out);
    assert.equal(rows.length, 2, `expected exactly 1 image per page (2 pages), got:\n${rows.join('\n')}`);
    for (const row of rows) {
      assert.match(row, /\bjpeg\b/, `page image should be JPEG-encoded: ${row}`);
      assert.match(row, /\b2560\s+1440\b/, `page image should be the 2× HD raster: ${row}`);
    }
    const fonts = execFileSync('pdffonts', [out], { encoding: 'utf8' }).split('\n').slice(2).filter((l) => l.trim());
    assert.equal(fonts.length, 0, 'raster PDF should embed no fonts');

    // The speaker note survives as a page-1 annotation on the assembled PDF
    // (pdf-lib writes object streams, so inspect structurally — not raw bytes).
    const { PDFDocument, PDFName } = require('pdf-lib');
    const doc = await PDFDocument.load(fs.readFileSync(out));
    assert.equal(doc.getPageCount(), 2, 'one PDF page per slide');
    const annots = doc.getPage(0).node.Annots();
    assert.ok(annots && annots.size() > 0, 'page 1 should carry the speaker-note annotation');
    const annot = doc.context.lookup(annots.get(0));
    const contents = annot.get(PDFName.of('Contents'));
    const noteText = contents.decodeText ? contents.decodeText() : contents.asString();
    assert.ok(noteText.includes(NOTE_MARKER), `annotation should carry the note, got: ${noteText}`);

    // --embed-source round-trips: extract the attachment and compare bytes.
    const extractDir = path.join(dir, 'extract');
    fs.mkdirSync(extractDir);
    execFileSync('pdfdetach', ['-saveall', '-o', extractDir + path.sep, out]);
    const extracted = fs.readFileSync(path.join(extractDir, 'deck.md'), 'utf8');
    assert.ok(extracted.includes(SOURCE_MARKER), 'extracted attachment should be the deck source');
    assert.equal(extracted, fs.readFileSync(src, 'utf8'), 'attachment must be byte-identical to the source');
  });

  test('renders one PNG per slide at the 2× raster size', { timeout: TIMEOUT }, () => {
    const dir = tmpDir();
    const out = path.join(dir, 'deck.png');
    const r = run(out);
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);

    for (const n of ['001', '002', '003']) {
      const f = path.join(dir, `deck.${n}.png`);
      assert.ok(fs.existsSync(f), `expected ${f}`);
      const { width, height } = readPngDimensions(f);
      assert.equal(width, 2560, 'HD slide should rasterize at 2× width');
      assert.equal(height, 1440, 'HD slide should rasterize at 2× height');
      assert.ok(fs.statSync(f).size > 5000, 'PNG should be non-trivial (catches blank screenshots)');
    }
  });
});
