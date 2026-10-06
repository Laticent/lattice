/**
 * Integration: an inline chip (a kpi pill) is drawn from the LIVE layout, not photographed.
 *
 * The shared PDF writer (lib/core/pdf-compose) draws text as vectors at the positions the
 * browser measured, and photographs the rest. A pill sits wherever the caption text before it
 * ends, and the Studio's camera (html-to-image) re-lays the slide out with every font size set
 * to floor(px) - 0.1: a 14.976px caption came out 13px short, so the photographed pill slid
 * left over the caption's last letters while the caption itself was drawn where it belonged
 * (followups.d/2532-p3, examples/studio-present.md p.4). `readSlide` now draws such a chip's
 * fill and border as vectors and `hideDrawn` takes them out of the photo, so no camera's text
 * metrics can move it.
 *
 * The CLI's camera is Chrome itself, which never drifted, so a rendered page alone cannot tell
 * the two designs apart. The oracle is the PHOTO: the pill must be absent from the page's
 * background image (no camera can misplace what it does not carry) and present on the page.
 *
 * FALSIFIABLE: with the chip pass removed, the pill's fill and border are back in the photo
 * and the first assertion fails. Needs Chromium and poppler (pdftotext, pdftoppm, pdfimages).
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');

const DECK = [
  '---', 'theme: cuoio', '---', '',
  '<!-- _class: kpi -->', '',
  '## Three numbers that made the case.', '',
  '1. 12 hrs', '   - per board deck', '   - most of it re-doing chrome `Ops`',
  '2. 40%', '   - reused, badly', '   - and drifting every quarter `Ops`',
  '3. 0', '   - talk tracks that survive export', "   - lost in the author's head `Gap`", '',
].join('\n');

/** A binary PNM (P5 gray / P6 color) as { w, h, ch, px }. */
function readPnm(file) {
  const buf = fs.readFileSync(file);
  const head = buf.toString('latin1', 0, 64).match(/^P([56])\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  return { w: Number(head[2]), h: Number(head[3]), ch: head[1] === '6' ? 3 : 1, px: buf.subarray(head[0].length) };
}
const lum = (img, x, y) => {
  const i = (y * img.w + x) * img.ch;
  return img.ch === 1 ? img.px[i] : (img.px[i] + img.px[i + 1] + img.px[i + 2]) / 3;
};

/** How many pixels in a box (in image px) differ from the box's top-left corner by > 24. */
function inked(img, x0, y0, x1, y1) {
  const bg = lum(img, x0, y0);
  let n = 0;
  for (let y = Math.max(0, y0); y <= Math.min(img.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(img.w - 1, x1); x++) if (Math.abs(lum(img, x, y) - bg) > 24) n++;
  return n;
}

describe('pdf-inline-chip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-chip-'));
  fs.writeFileSync(path.join(dir, 'deck.md'), DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [EMULATOR, path.join(dir, 'deck.md'), pdf], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('the CLI renders the deck, and keeps nothing of the pills in the photo', () => {
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
    assert.doesNotMatch(r.stdout, /slide 1: .*border-covered/, 'a pill border left in the photo');
  });

  test('each pill is off the photo and on the page, around its own word', () => {
    const xml = execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8' });
    const pageW = Number(xml.match(/<page width="([\d.]+)"/)[1]);
    const pills = [...xml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(OPS|GAP)<\/word>/g)].map((m) => m.slice(1, 5).map(Number));
    assert.equal(pills.length, 3, 'three pill words drawn as text');

    execFileSync('pdfimages', ['-f', '1', '-l', '1', pdf, path.join(dir, 'img')]);
    const photoFile = fs.readdirSync(dir).find((n) => n.startsWith('img') && /\.p[pg]m$/.test(n));
    const photo = readPnm(path.join(dir, photoFile));
    execFileSync('pdftoppm', ['-gray', '-r', '96', '-f', '1', '-l', '1', pdf, path.join(dir, 'p')]);
    const page = readPnm(path.join(dir, fs.readdirSync(dir).find((n) => n.startsWith('p') && n.endsWith('.pgm'))));

    for (const [x0, y0, , y1] of pills) {
      // The pill's box reaches ~12px past its word on each side and ~6px above and below; the
      // band just LEFT of the word (inside the pill, outside the glyphs) is where its border and
      // fill sit and no letter does.
      const band = (img) => {
        const k = img.w / pageW;
        return inked(img, Math.round((x0 - 10) * k), Math.round((y0 - 4) * k), Math.round((x0 - 1) * k), Math.round((y1 + 4) * k));
      };
      assert.equal(band(photo), 0, `the photo still carries the pill left of the word at x=${x0}`);
      assert.ok(band(page) > 0, `the page lost the pill left of the word at x=${x0}`);
    }
  });
});
