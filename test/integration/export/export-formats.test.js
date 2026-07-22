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
  // A deck carrying one keyed chart + one Mermaid diagram — exercises the image
  // set's standalone-SVG extraction (both kinds), which the no-Mermaid FIXTURE can't.
  const CHART_DIAGRAM_FIXTURE = path.join(ROOT, 'test', 'fixtures', 'chart-diagram-deck.md');
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

  test('--paper fits each slide onto a standard sheet with a baked paper MediaBox', { timeout: TIMEOUT }, () => {
    const out = path.join(tmpDir(), 'paper.pdf');
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out, '--quiet', '--paper', 'a4', '--orientation', 'portrait'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    // pdf-lib writes object streams (compressed), so read the geometry with poppler's
    // pdfinfo (the same toolchain the sibling raster tests use). A4 portrait = 794×1123px
    // @96dpi → 595.5×842.25pt (×0.75); one page per slide, on the sheet not the slide box.
    const info = execFileSync('pdfinfo', [out], { encoding: 'utf8' });
    assert.match(info, /Page size:\s*595\.5 x 842\.25 pts/, `expected A4 portrait, got:\n${info}`);
    assert.match(info, /Pages:\s*3\b/, 'one sheet per fixture slide');
  });

  test('--paper rejects an unknown sheet', () => {
    const out = path.join(tmpDir(), 'bad.pdf');
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out, '--quiet', '--paper', 'tabloid'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.notEqual(r.status, 0, 'should exit non-zero on an invalid --paper');
    assert.match(r.stderr, /--paper must be one of/);
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

  test('SVG swap is layout-neutral and robust: <img> box pinned, gradient scrims survive, malformed URLs skipped', { timeout: TIMEOUT }, () => {
    // Three checker-found failure modes pinned by one render:
    //  (a) an intrinsically-sized <img> must NOT re-lay-out at the twin's 2×
    //      natural size — pass 3 pins the element to its laid-out box;
    //  (b) a layered `linear-gradient(...), url(x.svg)` declaration must keep
    //      the gradient scrim — only the url() token is replaced;
    //  (c) one malformed background-image URL must not kill the export —
    //      URL resolution is guarded per token.
    const dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, 'small-red.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="#ff0000"/></svg>',
    );
    const src = path.join(dir, 'robust.md');
    fs.writeFileSync(src, [
      '---', 'html: true', 'paginate: false', '---', '',
      '<!-- _class: content -->', '',
      '## Intrinsic pin', '',
      '![red](small-red.svg)', '',
      '---', '',
      '<!-- _class: content -->', '',
      '## Scrim and bad URL', '',
      `<div style="width:200px;height:150px;background-image:linear-gradient(rgba(0,0,255,0.5),rgba(0,0,255,0.5)),url('small-red.svg')"></div>`, '',
      `<div style="width:10px;height:10px;background-image:url('http://[bad/x.svg')"></div>`, '',
    ].join('\n'));
    const out = path.join(dir, 'robust.pdf');
    const r = spawnSync(process.execPath, [EMULATOR, src, out, '--quiet'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    // (c) the malformed URL must not abort the render.
    assert.equal(r.status, 0, `emulator failed (malformed URL should be skipped, not fatal): ${r.stderr}`);
    assert.ok(pdfImageRows(out).length >= 2, 'both SVG placements should have been swapped for raster twins');

    // Rasterize at 96 dpi → 1 raster px per CSS px on the 1280×720 page.
    execFileSync('pdftoppm', ['-r', '96', out, path.join(dir, 'page')]);
    const isRed  = (d, i) => d[i] > 215 && d[i + 1] < 40 && d[i + 2] < 40;
    const isBlend = (d, i) => Math.abs(d[i] - 128) < 45 && d[i + 1] < 40 && Math.abs(d[i + 2] - 128) < 45;
    const count = (ppm, pred) => {
      const { w, h, data } = readPPM(ppm);
      let n = 0;
      for (let p = 0; p < w * h; p++) if (pred(data, p * 3)) n++;
      return n;
    };
    // (a) the 100×60 image must cover ~6000 px, not ~24000 (the 2× twin's box).
    const red1 = count(path.join(dir, 'page-1.ppm'), isRed);
    assert.ok(red1 > 4000 && red1 < 12000, `intrinsically-sized <img> should keep its 100×60 box (~6000 red px), got ${red1}`);
    // (b) the scrim must still blend the red tile (→ ~purple, ~0 pure red).
    const red2 = count(path.join(dir, 'page-2.ppm'), isRed);
    const blend2 = count(path.join(dir, 'page-2.ppm'), isBlend);
    assert.ok(red2 < 1000, `gradient scrim should survive the swap (pure-red pixels ≈ 0), got ${red2}`);
    assert.ok(blend2 > 15000, `scrim-over-image blend should cover the 200×150 box, got ${blend2}`);
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

  test('renders a .zip image set — slides + thumbnails + manifest, defaults to lossless PNG', { timeout: TIMEOUT }, async () => {
    const dir = tmpDir();
    const out = path.join(dir, 'deck.zip');
    const r = run(out);
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    assert.ok(fs.existsSync(out), 'zip should exist');
    assert.equal(fs.readFileSync(out).subarray(0, 4).toString('hex'), '504b0304', 'not a zip');

    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    const slides = names.filter((n) => /^deck\/slides\/deck-\d+\.png$/.test(n));
    const thumbs = names.filter((n) => /^deck\/thumbnails\/deck-\d+\.png$/.test(n));
    assert.equal(slides.length, 3, `expected 3 slide images, got ${slides.length}`);
    assert.equal(thumbs.length, 3, `expected 3 thumbnails, got ${thumbs.length}`);
    assert.ok(names.includes('deck/manifest.json'), 'manifest.json present');

    // The full raster is the 2× HD box; the thumbnail is a faithful shrink.
    const fullBuf = await zip.file(slides.sort()[0]).async('nodebuffer');
    assert.equal(fullBuf.readUInt32BE(16), 2560, 'full slide at 2× width');
    const thumbBuf = await zip.file(thumbs.sort()[0]).async('nodebuffer');
    assert.equal(thumbBuf.readUInt32BE(16), 480, 'thumbnail at the default 480px width');

    const manifest = JSON.parse(await zip.file('deck/manifest.json').async('string'));
    assert.equal(manifest.kind, 'lattice-image-set');
    assert.equal(manifest.format, 'png');
    assert.equal(manifest.counts.slides, 3);
    assert.equal(manifest.counts.thumbnails, 3);
    // The manifest self-describes the RESOLVED scheme, not the raw `inherit` default — a
    // downstream tool can tell these are light images without opening the pixels.
    assert.equal(manifest.colorMode, 'light');
  });

  test('--image-mode dark with no dark companion renders light and the manifest says so (no lie)', { timeout: TIMEOUT }, async () => {
    // a11y-* palettes ship no `-dark` companion; the export falls back to the base (light) palette.
    const out = path.join(tmpDir(), 'deck.zip');
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out, '--quiet', '--image-mode', 'dark', '-p', 'a11y-deuteranopia'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const manifest = JSON.parse(await zip.file('deck/manifest.json').async('string'));
    assert.equal(manifest.colorMode, 'light', 'manifest must record the scheme actually rendered, not the requested dark');
  });

  test('image set honors --image-format jpeg, --image-size 1x, and --no-thumbnails', { timeout: TIMEOUT }, async () => {
    const dir = tmpDir();
    const out = path.join(dir, 'deck.zip');
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out, '--quiet', '--image-format', 'jpeg', '--image-size', '1x', '--no-thumbnails'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);

    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    assert.ok(names.some((n) => /slides\/deck-\d+\.jpeg$/.test(n)), 'jpeg slides');
    assert.ok(!names.some((n) => n.includes('thumbnails/')), '--no-thumbnails omits the folder');

    const jpeg = await zip.file(names.filter((n) => n.endsWith('.jpeg')).sort()[0]).async('nodebuffer');
    assert.equal(jpeg[0], 0xff, 'JPEG SOI byte 0');
    assert.equal(jpeg[1], 0xd8, 'JPEG SOI byte 1');
    const manifest = JSON.parse(await zip.file('deck/manifest.json').async('string'));
    assert.equal(manifest.format, 'jpeg');
    assert.equal(manifest.pixel.scale, 1, '--image-size 1x rasters at 1×');
  });

  test('image set extracts standalone SVGs for BOTH keyed charts and Mermaid diagrams', { timeout: TIMEOUT }, async () => {
    const dir = tmpDir();
    const out = path.join(dir, 'deck.zip');
    const r = spawnSync(process.execPath, [EMULATOR, CHART_DIAGRAM_FIXTURE, out, '--quiet'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);

    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    const assets = names.filter((n) => /^deck\/assets\/deck-s\d+-c\d+\.svg$/.test(n)).sort();
    // One chart (slide 1) + one diagram (slide 2) → two standalone SVGs.
    assert.equal(assets.length, 2, `expected 2 SVG assets, got ${assets.join(', ')}`);
    assert.deepEqual(assets, ['deck/assets/deck-s01-c00.svg', 'deck/assets/deck-s02-c00.svg']);

    // Each is a real, self-contained SVG document (xmlns + embedded @font-face so it
    // opens with the right type outside the deck — the standalone contract).
    for (const a of assets) {
      const svg = await zip.file(a).async('string');
      assert.match(svg, /<svg[\s>]/, `${a} is not an <svg>`);
      assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${a} missing xmlns`);
      assert.match(svg, /@font-face/, `${a} missing embedded fonts`);
    }

    const manifest = JSON.parse(await zip.file('deck/manifest.json').async('string'));
    assert.equal(manifest.counts.assets, 2);
    assert.deepEqual(manifest.assets.map((x) => x.kind).sort(), ['chart', 'diagram']);
  });

  test('--no-svg omits the standalone SVG assets', { timeout: TIMEOUT }, async () => {
    const dir = tmpDir();
    const out = path.join(dir, 'deck.zip');
    const r = spawnSync(process.execPath, [EMULATOR, CHART_DIAGRAM_FIXTURE, out, '--quiet', '--no-svg'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    assert.ok(!names.some((n) => n.includes('/assets/')), '--no-svg should omit assets/');
    const manifest = JSON.parse(await zip.file('deck/manifest.json').async('string'));
    assert.equal(manifest.counts.assets, 0);
  });

  test('--image-mode dark renders the dark palette; --svg-background bakes a canvas', { timeout: TIMEOUT }, async () => {
    const dir = tmpDir();
    const out = path.join(dir, 'deck.zip');
    const r = spawnSync(process.execPath, [EMULATOR, CHART_DIAGRAM_FIXTURE, out, '--quiet', '--image-mode', 'dark', '--svg-background', 'dark'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const manifest = JSON.parse(await zip.file('deck/manifest.json').async('string'));
    assert.equal(manifest.colorMode, 'dark');
    assert.equal(manifest.svgBackground, 'dark');
    // Every extracted SVG carries the full-bleed dark backdrop rect.
    const svgNames = Object.keys(zip.files).filter((n) => /assets\/.+\.svg$/.test(n));
    assert.ok(svgNames.length >= 1, 'expected at least one SVG asset');
    for (const n of svgNames) {
      const svg = await zip.file(n).async('string');
      assert.match(svg, /<rect x="0" y="0" width="100%" height="100%" fill="#111317"\/>/, `${n} missing dark backdrop`);
    }
  });

  test('SVG look renders the chart/diagram independent of the slides (color slides + print SVGs)', { timeout: TIMEOUT }, async () => {
    const JSZip = require('jszip');
    const chartSvg = async (svgBackground) => {
      const out = path.join(tmpDir(), 'deck.zip');
      const r = spawnSync(process.execPath, [EMULATOR, CHART_DIAGRAM_FIXTURE, out, '--quiet', '--image-mode', 'light', '--svg-background', svgBackground], {
        cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
      });
      assert.equal(r.status, 0, `emulator failed (${svgBackground}): ${r.stderr}`);
      const zip = await JSZip.loadAsync(fs.readFileSync(out));
      const name = Object.keys(zip.files).find((n) => /assets\/deck-s01-c00\.svg$/.test(n)); // the piechart
      const manifest = JSON.parse(await zip.file('deck/manifest.json').async('string'));
      return { svg: await zip.file(name).async('string'), manifest };
    };
    const printLook = await chartSvg('print');
    const inheritLook = await chartSvg('inherit');

    // Same deck, same slide mode (light) — but the print-look chart is RE-RENDERED B&W, so it
    // differs from the as-slides (inherit) chart. This is the whole point of the look.
    assert.notEqual(printLook.svg, inheritLook.svg, 'print look should re-render the chart, not just re-backdrop it');
    // Print charts reference the B&W texture patterns (accessibility-textures `latt-*` ids);
    // the color as-slides chart does not.
    assert.match(printLook.svg, /latt-/, 'print-look chart should carry the B&W texture refs');
    assert.doesNotMatch(inheritLook.svg, /latt-/, 'the as-slides (color) chart has no print textures');
    // Print bakes the white paper canvas; inherit bakes none.
    assert.match(printLook.svg, /<rect [^>]*fill="#ffffff"\/>/);
    assert.doesNotMatch(inheritLook.svg, /<rect [^>]*width="100%"[^>]*fill=/);
    assert.equal(printLook.manifest.colorMode, 'light');
    assert.equal(printLook.manifest.svgBackground, 'print');
  });

  test('--image-mode print stamps the B&W handout canvas', { timeout: TIMEOUT }, async () => {
    const dir = tmpDir();
    const out = path.join(dir, 'deck.zip');
    const r = spawnSync(process.execPath, [EMULATOR, CHART_DIAGRAM_FIXTURE, out, '--quiet', '--image-mode', 'print'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const manifest = JSON.parse(await zip.file('deck/manifest.json').async('string'));
    assert.equal(manifest.colorMode, 'print');
    // transparent background by default → no backdrop rect baked
    const svgNames = Object.keys(zip.files).filter((n) => /assets\/.+\.svg$/.test(n));
    for (const n of svgNames) {
      assert.doesNotMatch(await zip.file(n).async('string'), /<rect [^>]*width="100%"[^>]*fill=/);
    }
  });

  test('the standalone --print flag (not --image-mode) is authoritative for the manifest scheme', { timeout: TIMEOUT }, async () => {
    // `deck.md out.zip --print` stamps the print canvas (WANT_PRINT) but leaves --image-mode at
    // its 'inherit' default — the manifest must still record 'print' to match the ink-on-white
    // pixels, not the palette-derived light/dark.
    const dir = tmpDir();
    const out = path.join(dir, 'deck.zip');
    const r = spawnSync(process.execPath, [EMULATOR, CHART_DIAGRAM_FIXTURE, out, '--quiet', '--print'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const manifest = JSON.parse(await zip.file('deck/manifest.json').async('string'));
    assert.equal(manifest.colorMode, 'print', 'manifest must record print when --print rendered the print canvas');
  });

  test('image set writes a v2 manifest (metadata, dpi, orientation) + embeds DPI in the PNG bytes', { timeout: TIMEOUT }, async () => {
    const dir = tmpDir();
    const out = path.join(dir, 'deck.zip');
    const r = spawnSync(process.execPath, [EMULATOR, CHART_DIAGRAM_FIXTURE, out, '--quiet'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
    });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const m = JSON.parse(await zip.file('deck/manifest.json').async('string'));

    assert.equal(m.version, 2);
    assert.ok(m.title && typeof m.title === 'string', 'has a deck title');
    assert.equal(m.palette, 'indaco');
    assert.equal(m.engine.name, 'lattice');
    assert.ok(m.engine.version, 'has an engine version');
    assert.match(m.createdAt, /^\d{4}-\d\d-\d\dT/, 'ISO createdAt');
    assert.equal(m.orientation, 'landscape');           // hd fixture
    assert.deepEqual(m.physical, { width: 13.333, height: 7.5, unit: 'in' });
    assert.equal(m.dpi, 192);                            // hd @2× → 192 dpi
    assert.deepEqual(m.thumbnail, { width: 480, height: 270 });
    // per-slide title + bytes; per-asset chartType + bytes
    assert.ok(m.slides[0].title, 'slide has a title');
    assert.ok(m.slides[0].bytes > 0 && m.slides[0].thumbnailBytes > 0, 'per-file bytes recorded');
    const chart = m.assets.find((a) => a.kind === 'chart');
    assert.equal(chart.chartType, 'piechart');
    assert.ok(chart.bytes > 0);

    // The full slide PNG carries a pHYs chunk at 192 dpi, and still decodes as a valid PNG.
    // (manifest paths are relative to the deck root folder; the zip prefixes them with the slug.)
    const png = await zip.file(`deck/${m.slides[0].image}`).async('nodebuffer');
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'valid PNG signature');
    assert.equal(png.subarray(12, 16).toString(), 'IHDR', 'IHDR intact');
    const pHYs = png.indexOf(Buffer.from('pHYs'));
    assert.ok(pHYs > 0, 'pHYs chunk present');
    const ppm = png.readUInt32BE(pHYs + 4);
    assert.equal(Math.round(ppm * 0.0254), 192, 'pHYs encodes 192 dpi');
    assert.equal(png[pHYs + 12], 1, 'pHYs unit = metre');
  });

  // Accessibility: the exported PDF shell must carry the deck's title + language, so a
  // screen reader announces both (was a tracked gap — untagged PDF, no /Lang, no title;
  // semantic-html-accessibility.md G1/G2). Chrome's print-to-PDF lifts them from the
  // shell's <title> + <html lang>.
  test('the exported PDF carries an accessible /Lang + title (WCAG 2.4.2 / 3.1.1)', { timeout: TIMEOUT }, () => {
    const dir = tmpDir();
    const src = path.join(dir, 'titled.md');
    fs.writeFileSync(src, '---\ntitle: Q3 Board Review\nlang: fr\ntheme: indaco\n---\n\n# Hello\n\nSome text.\n');
    const out = path.join(dir, 'titled.pdf');
    const r = spawnSync(process.execPath, [EMULATOR, src, out, '--quiet'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    const bytes = fs.readFileSync(out).toString('latin1');
    assert.match(bytes, /\/Lang ?\(fr\)/, 'PDF should carry /Lang from the deck lang: front-matter');
    assert.match(bytes, /Q3 Board Review/, 'PDF should carry the deck title from title: front-matter');
  });
});
