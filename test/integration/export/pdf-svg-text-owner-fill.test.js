/**
 * Integration: SVG text takes its fill from the element that owns each character.
 *
 * The shared PDF writer (lib/core/pdf-compose/read-slide.mjs) draws an SVG `<text>` as real
 * PDF text and hides it from the slide's photo. It read the fill off the `<text>`, but Mermaid
 * paints a sequence participant's name on the `<tspan>` (`text.actor > tspan`) while the
 * `<text>` carries the box's own fill (`.actor`). So every participant name was drawn in its
 * box's color: present in the text layer, invisible on the page, in every CLI PDF.
 *
 * The check: render a one-slide sequence diagram through the writer, find each participant box
 * by its fill, and count the pixels inside it that are NOT the box's color. A name has hundreds;
 * an empty box has none. Light and dark, because the ink flips with the mode.
 *
 * FALSIFIABLE: with the writer reading `<text>`'s own fill (the pre-fix reader), every box
 * counts 0 and both assertions fail. Needs Chromium, poppler (pdftoppm) and a built
 * dist/lattice-pdf-compose-min.js (`npm run build`).
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-svg-owner-fill-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const BUNDLE = path.join(ROOT, 'dist', 'lattice-pdf-compose-min.js');

/** Render a fixture through the writer and return the page as { w, h, px } (RGB bytes). */
function raster(fixture) {
  // Without the bundle the CLI quietly prints with Chrome instead (`--quiet` hides the notice), and
  // Chrome draws the names right: the test would pass with the bug present.
  assert.ok(fs.existsSync(BUNDLE), 'dist/lattice-pdf-compose-min.js is missing: run `npm run build`, or this test would pass on Chrome\'s own print');
  const pdf = path.join(tmp, `${path.basename(fixture, '.md')}.pdf`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.join(ROOT, 'test', 'fixtures', fixture), pdf, '--quiet'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const base = pdf.replace(/\.pdf$/, '');
  const p = spawnSync('pdftoppm', ['-r', '96', '-f', '1', '-l', '1', '-singlefile', pdf, base]);
  assert.equal(p.status, 0, String(p.stderr));
  const buf = fs.readFileSync(`${base}.ppm`);
  const head = buf.toString('latin1', 0, 64).match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  return { w: Number(head[1]), h: Number(head[2]), px: buf.subarray(head[0].length) };
}

/** The sequence diagram's participant boxes: connected runs of one fill, wider than tall, big enough to hold a name. */
function boxes({ w, h, px }) {
  const at = (x, y) => (y * w + x) * 3;
  const key = (x, y) => `${px[at(x, y)]},${px[at(x, y) + 1]},${px[at(x, y) + 2]}`;
  // The box fill is the most common non-background color among the pixels in the diagram's band.
  const counts = new Map();
  for (let y = Math.floor(h * 0.25); y < Math.floor(h * 0.9); y += 2) {
    for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x += 2) counts.set(key(x, y), (counts.get(key(x, y)) || 0) + 1);
  }
  const [bg] = [...counts].sort((a, b) => b[1] - a[1])[0];
  const [fill] = [...counts].filter(([k]) => k !== bg).sort((a, b) => b[1] - a[1])[0];
  // Connected components of the fill color: a box with a name is a ring (the glyphs are holes
  // in it), so its bounding box still spans the whole box.
  const seen = new Uint8Array(w * h);
  const found = [];
  for (let y0 = 0; y0 < h; y0++) {
    for (let x0 = 0; x0 < w; x0++) {
      if (seen[y0 * w + x0] || key(x0, y0) !== fill) continue;
      const box = { x0, x1: x0, y0, y1: y0 };
      const stack = [[x0, y0]];
      seen[y0 * w + x0] = 1;
      while (stack.length) {
        const [x, y] = stack.pop();
        box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y1 = Math.max(box.y1, y);
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || key(nx, ny) !== fill) continue;
          seen[ny * w + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      if (box.x1 - box.x0 > w * 0.08 && box.y1 - box.y0 > h * 0.05) found.push(box);
    }
  }
  return { fill, boxes: found };
}

for (const mode of ['light', 'dark']) {
  test(`every participant box of a sequence diagram carries a visible name (${mode})`, { timeout: 120_000 }, () => {
    const img = raster(`pdf-sequence-actor-names-${mode}.md`);
    const { fill, boxes: found } = boxes(img);
    assert.equal(found.length, 8, `expected 4 participants x top and bottom, found ${found.length}`);
    for (const b of found) {
      let ink = 0;
      for (let y = b.y0 + 4; y < b.y1 - 4; y++) {
        for (let x = b.x0 + 4; x < b.x1 - 4; x++) {
          const o = (y * img.w + x) * 3;
          if (`${img.px[o]},${img.px[o + 1]},${img.px[o + 2]}` !== fill) ink++;
        }
      }
      assert.ok(ink > 40, `a participant box at (${b.x0},${b.y0}) in ${mode} mode holds ${ink} pixels of ink; its name is painted in the box's own color`);
    }
  });
}
