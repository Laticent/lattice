/**
 * Integration: a text decoration survives the shared PDF writer.
 *
 * The writer (lib/core/pdf-compose) draws each word as real text and photographs the rest of
 * the slide with the drawn text hidden by `-webkit-text-fill-color: transparent`. A
 * decoration's default color is currentcolor, which Blink paints with the text FILL, so the
 * hide erased every underline and strikethrough with the words: a rejected option's struck
 * tag (compare-prose `rejected` / `decision`, gallery p.51) read as a live option in every
 * CLI PDF. `hideDrawn` now pins each declaring element's decoration color, and the line
 * stays in the photo where the browser placed it.
 *
 * The check: `pdftotext -bbox` finds the decorated word, and some pixel row across that word
 * (the strike through its middle, the underline just below it) must be ink from edge to
 * edge. Glyphs alone never make one unbroken row across a word — the gaps between letters
 * break it — so the row exists only if the line was drawn.
 *
 * FALSIFIABLE: without the pin in `hideDrawn`, both words lose their line and both
 * assertions fail. Needs Chromium and poppler (pdftotext, pdftoppm).
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'text-decoration.md');
const DPI = 96;
const PX = DPI / 72;

/** A binary PGM (P5) as { w, h, px }. */
function readPgm(file) {
  const buf = fs.readFileSync(file);
  const head = buf.toString('latin1', 0, 64).match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  return { w: Number(head[1]), h: Number(head[2]), px: buf.subarray(head[0].length) };
}

/** The longest run of ink in any row across a word box, as a fraction of the box's width. */
function longestRowRun(img, box, below) {
  const x0 = Math.ceil(box.xMin * PX), x1 = Math.floor(box.xMax * PX);
  const y0 = Math.floor(box.yMin * PX), y1 = Math.ceil(box.yMax * PX + below);
  // The page background's own gray, read at the word's left edge above it.
  const bg = img.px[Math.max(0, y0 - 2) * img.w + x0];
  let best = 0;
  for (let y = y0; y <= y1 && y < img.h; y++) {
    let run = 0;
    for (let x = x0; x <= x1; x++) {
      run = Math.abs(img.px[y * img.w + x] - bg) > 60 ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return best / (x1 - x0 + 1);
}

describe('pdf-text-decoration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-deco-'));
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, pdf, '--quiet'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('the CLI renders the fixture', () => {
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
  });

  const words = () => {
    const xml = execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8' });
    const out = {};
    for (const m of xml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)) {
      out[m[5]] = { xMin: +m[1], yMin: +m[2], xMax: +m[3], yMax: +m[4] };
    }
    return out;
  };
  let img;
  const page = () => {
    if (img) return img;
    execFileSync('pdftoppm', ['-gray', '-r', String(DPI), '-f', '1', '-l', '1', pdf, path.join(dir, 'p')]);
    const f = fs.readdirSync(dir).find((n) => n.startsWith('p') && n.endsWith('.pgm'));
    img = readPgm(path.join(dir, f));
    return img;
  };

  test('a line-through reaches the PDF across the whole struck word', () => {
    const w = words();
    assert.ok(w.Struck, 'the struck word is real text in the PDF');
    assert.ok(longestRowRun(page(), w.Struck, 0) > 0.95, 'one unbroken ink row runs through "Struck"');
    assert.ok(longestRowRun(page(), w.Keep, 0) < 0.6, 'control: the undecorated "Keep" has no such row');
  });

  test('an underline reaches the PDF under the whole underlined word', () => {
    const w = words();
    assert.ok(w.underlined, 'the underlined word is real text in the PDF');
    assert.ok(longestRowRun(page(), w.underlined, 4) > 0.95, 'one unbroken ink row runs under "underlined"');
    assert.ok(longestRowRun(page(), w.rejected, 4) < 0.6, 'control: the undecorated "rejected" has no such row');
  });
});
