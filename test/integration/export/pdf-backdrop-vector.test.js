/**
 * Integration: a finish's backdrop reaches the PDF as drawing, not as a 1x JPEG photo.
 *
 * The shared writer used to leave the backdrop in the slide's photo, taken at 1x and usually stored as JPEG, which cut a
 * faint glow into 8x8 blocks and color patches (engineering/decisions/2026-11-20-backdrop-gradient-fidelity.md). Now
 * read-slide.mjs `readBackdrop` and backdrop.mjs draw it: the glows as one computed picture blended onto the slide color,
 * textures as paths, fades above them as opacity maps; the photo over it keeps only what is left, cut to its inked parts.
 *
 * The checks, on test/fixtures/pdf-backdrop-vector.md (one slide per backdrop shape):
 *   1. the six drawable backdrops are drawn, five of them on the screen face (the sixth keeps a ghost numeral in the
 *      photo, so it stays on the export face); a half-strength slide (group opacity), a busy one and one with a flex item
 *      under the canvas plane stay in the photo;
 *   2. no slide keeps a full-slide photo (each did before: the backdrop was in it), and a lone glow is smooth (a text-free
 *      patch within 0.35 levels of its own 9 px box blur);
 *   3. a spotlight's scrim hides the finish outside its window (a trim that took the scrim's opaque slide color for
 *      "nothing" once printed the rings everywhere but the window), and the window is top right, where the screen has it;
 *   4. the `frame` keyline (gallery's inset box-shadow ring) is still there, as a sharp line, and a half-strength backdrop
 *      does not dim it (the section's ring is outside the backdrop's group).
 *
 * FALSIFIABLE: with `readBackdrop` returning null (the backdrop back in the photo), checks 1 and 2 fail (six full-slide
 * photos). With the trim treating any opaque slide color as empty, check 3 reads the rings (8 to 15 levels).
 * Needs Chromium and poppler (pdftoppm).
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'pdf-backdrop-vector.md');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-backdrop-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const pdf = path.join(tmp, 'deck.pdf');
const reportPath = path.join(tmp, 'report.json');
let report = null;

function renderOnce() {
  if (report) return report;
  const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, pdf, '--quiet'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, LATTICE_PDF_REPORT: reportPath } });
  assert.equal(r.status, 0, r.stderr);
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  return report;
}

/** Page `page` at `dpi` as { w, h, px } (RGB bytes). */
function raster(page, dpi = 96) {
  const base = path.join(tmp, `p${page}-${dpi}`);
  const r = spawnSync('pdftoppm', ['-r', String(dpi), '-f', String(page), '-l', String(page), '-singlefile', pdf, base]);
  assert.equal(r.status, 0, String(r.stderr));
  const buf = fs.readFileSync(`${base}.ppm`);
  const head = buf.toString('latin1', 0, 64).match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  return { w: Number(head[1]), h: Number(head[2]), px: buf.subarray(head[0].length) };
}
const at = (img, x, y) => { const o = (y * img.w + x) * 3; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };

/** Mean absolute difference, over a box, between each pixel and the mean of the 9x9 box around it: noise, blocks, steps. */
function roughness(img, x0, y0, w, h) {
  let sum = 0, n = 0;
  for (let y = y0 + 4; y < y0 + h - 4; y++) for (let x = x0 + 4; x < x0 + w - 4; x++) {
    for (let k = 0; k < 3; k++) {
      let m = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) m += img.px[((y + dy) * img.w + (x + dx)) * 3 + k];
      sum += Math.abs(img.px[(y * img.w + x) * 3 + k] - m / 81);
      n++;
    }
  }
  return sum / n;
}

test('the seven drawable backdrops are drawn, six on the screen face; the two that must not be stay in the photo', { timeout: 120_000 }, () => {
  const r = renderOnce();
  assert.deepEqual(r.backdrops, { vector: 7, screenFace: 6 });
  const refused = r.photoContent.flatMap((p) => Object.keys(p.why).filter((k) => k.startsWith('backdrop-')).map((k) => `slide ${p.slide}: ${k}`));
  assert.deepEqual(refused, ['slide 8: backdrop-busy-photo', 'slide 9: backdrop-under'],
    'a busy photo keeps the smaller opaque one, and a flex item at z-index -3 (under the canvas plane, with no `position`) keeps the order by staying in the photo');
});

test('no slide keeps a full-slide photo: what is left is cut to its inked parts, and a glow is smooth', { timeout: 120_000 }, () => {
  renderOnce();
  const r = spawnSync('pdfimages', ['-list', pdf], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const rows = r.stdout.split('\n').slice(2).filter(Boolean).map((l) => l.trim().split(/\s+/));
  const full = rows.filter((c) => c[2] === 'image' && Number(c[3]) >= 1200 && Number(c[0]) <= 7).map((c) => `page ${c[0]}: ${c[3]}x${c[4]}`);
  assert.deepEqual(full, [], 'a full-slide picture on a drawn slide: the backdrop (or the whole photo) went back in');
  // The busy slide keeps ONE opaque photo, a JPEG, not a transparent PNG eight times its size.
  const busy = rows.filter((c) => c[0] === '8' && c[2] === 'image');
  assert.deepEqual(busy.map((c) => c[8]), ['jpeg'], 'the busy slide keeps its old opaque photo');
  // Smooth where the glow is alone (slide 1, light gallery; slide 3, dark nimbus under its heading rule). This guards the
  // drawing itself; it does not tell the old writer apart on these simple slides, whose photos were lossless PNG.
  for (const [page, box] of [[1, [700, 420, 300, 150]], [3, [950, 200, 280, 200]]]) {
    const v = roughness(raster(page), ...box);
    assert.ok(v < 0.35, `slide ${page}: the glow is rough by ${v.toFixed(2)} levels`);
  }
});

test("a spotlight's scrim hides the finish outside its window", { timeout: 120_000 }, () => {
  renderOnce();
  const img = raster(5);
  // Bottom left, far from the top-right window: the scrim's canvas, flat, though halo's rings cross it underneath.
  let worst = 0;
  for (let y = 520; y < 680; y += 2) for (let x = 40; x < 400; x += 2) worst = Math.max(worst, ...at(img, x, y).map((c) => 255 - c));
  assert.ok(worst <= 3, `the rings show through the scrim by ${worst} levels`);
  // And the window is where the screen has it, top right: the rings show there. This pins the drawing's orientation (a
  // picture flipped top to bottom would move the window to the bottom right and still pass the check above).
  let seen = 0;
  for (let y = 120; y < 260; y += 2) for (let x = 900; x < 1100; x += 2) seen = Math.max(seen, ...at(img, x, y).map((c) => 255 - c));
  assert.ok(seen >= 4, `the rings show in the window (${seen} levels)`);
});

test("the frame finish keeps its keyline, sharp, and at full strength under a half-strength backdrop", { timeout: 120_000 }, () => {
  renderOnce();
  // Slide 7 is gallery at `--backdrop-opacity: 0.5`: the backdrop's opacity is not the section's, so its keyline and its
  // white mat are exactly slide 1's (drawn piece by piece, the strength once dimmed the keyline and tinted the mat).
  const one = raster(1, 96), seven = raster(7, 96);
  for (const x of [5, 12, 15, 16, 17]) assert.deepEqual(at(seven, x, 360), at(one, x, 360), `the frame at x ${x}, half strength against full`);
  const img = raster(1, 192);
  // Gallery's frame: a canvas mat ring, then the keyline ring, both inset from the slide edge (1.1 and 1.32 cqi).
  const row = Math.floor(img.h / 2);
  const line = Array.from({ length: 40 }, (_, x) => at(img, x, row)[0]);
  const darkest = Math.min(...line);
  assert.ok(darkest < 200, `a keyline is drawn (darkest red ${darkest})`);
  const ink = line.filter((c) => c < 230).length;
  assert.ok(ink >= 4 && ink <= 8, `and it is a line, not a smear: ${ink} px wide at 192 dpi`);
});
