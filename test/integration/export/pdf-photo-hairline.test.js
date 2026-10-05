/**
 * Integration: a 1 px rule keeps its color through the shared PDF writer's photo.
 *
 * The writer (lib/core/pdf-compose) draws text and chart shapes as vectors over one photo of
 * the rest of the slide. That photo was always a JPEG, and JPEG halves color resolution at every
 * quality, so the accent rule along the top edge of a dark slide lost its color and bled into
 * the row under it: rgb(0,146,216) written as rgb(42,132,176), on 59 of 330 committed decks. The
 * camera now offers PNG and JPEG and the writer keeps the smaller (`smallestPhoto`), which on a
 * flat slide is the lossless PNG.
 *
 * The check: the top pixel row of slide 2, sampled across the middle of the slide, matches
 * Chrome's own vector print of the same deck (`--chrome-pdf`) within a few levels, and so does
 * the row under it.
 *
 * FALSIFIABLE: with the camera back on JPEG only, the rule's blue channel reads ~40 levels low
 * and the row under it ~30 high, and both assertions fail. Needs Chromium and poppler (pdftoppm).
 *
 * THE 4K ARM. A 4K slide's photo stops at 2560 px on its long edge, so a rule left in it is
 * downsampled and comes out soft whatever the format. The section's own edge — a dark slide's
 * 1 px gradient hairline (a background image) and a light slide's spectrum bar (a border
 * image) — is drawn as a vector shading instead (`readSectionEdges`, read-slide.mjs), so both
 * match Chrome's print at 4K. FALSIFIABLE: with the edge reader off (the photo carries the
 * edge, as before), the dark hairline reads 86 levels off and the bar's last row 94, and the
 * 4K assertions fail.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'pdf-photo-hairline.md');
const FIXTURE_4K = path.join(ROOT, 'test', 'fixtures', 'pdf-photo-hairline-4k.md');
const TOLERANCE = 6;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-hairline-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function render(out, extra = [], fixture = FIXTURE) {
  const r = spawnSync(process.execPath, [EMULATOR, fixture, out, '--quiet', ...extra], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}

/** The top pixel rows of a page (two by default), as [r,g,b] triples across the middle half of the slide. */
function topRows(pdf, page = 2, rows = 2) {
  const base = path.join(tmp, `${path.basename(pdf, '.pdf')}-p${page}`);
  const r = spawnSync('pdftoppm', ['-r', '96', '-f', String(page), '-l', String(page), '-singlefile', '-y', '0', '-H', String(rows), '-W', '4000', pdf, base]);
  assert.equal(r.status, 0, String(r.stderr));
  const buf = fs.readFileSync(`${base}.ppm`);
  const head = buf.toString('latin1', 0, 64).match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  const w = Number(head[1]);
  const px = buf.subarray(head[0].length);
  const row = (y) => Array.from({ length: Math.floor(w / 2) }, (_, i) => {
    const o = (y * w + Math.floor(w / 4) + i) * 3;
    return [px[o], px[o + 1], px[o + 2]];
  });
  return Array.from({ length: rows }, (_, y) => row(y));
}

const worst = (a, b) => Math.max(...a.map((p, i) => Math.max(...p.map((c, k) => Math.abs(c - b[i][k])))));

test('the accent rule on a dark slide keeps its color, and the row under it stays clean', { timeout: 120_000 }, () => {
  const writer = path.join(tmp, 'writer.pdf');
  const chrome = path.join(tmp, 'chrome.pdf');
  render(writer);
  render(chrome, ['--chrome-pdf']);
  const [w0, w1] = topRows(writer);
  const [c0, c1] = topRows(chrome);
  assert.ok(new Set(c0.map(String)).size > 1 || c0[0].join() !== c1[0].join(), 'the fixture draws a rule on its top edge');
  assert.ok(worst(w0, c0) <= TOLERANCE, `top row differs from Chrome's print by ${worst(w0, c0)} levels`);
  assert.ok(worst(w1, c1) <= TOLERANCE, `the row under the rule differs by ${worst(w1, c1)} levels`);
});

test("at 4K the section's own edge is a vector: the dark hairline and the light bar match Chrome's print", { timeout: 180_000 }, () => {
  const writer = path.join(tmp, 'writer-4k.pdf');
  const chrome = path.join(tmp, 'chrome-4k.pdf');
  render(writer, [], FIXTURE_4K);
  render(chrome, ['--chrome-pdf'], FIXTURE_4K);
  // Page 2, dark: the 1 px hairline at row 0 and the canvas under it.
  const [w0, w1] = topRows(writer, 2);
  const [c0, c1] = topRows(chrome, 2);
  assert.notEqual(c0[0].join(), c1[0].join(), 'the dark slide draws a hairline on its top edge');
  assert.ok(worst(w0, c0) <= TOLERANCE, `4K hairline differs from Chrome's print by ${worst(w0, c0)} levels`);
  assert.ok(worst(w1, c1) <= TOLERANCE, `4K row under the hairline differs by ${worst(w1, c1)} levels`);
  // Page 3, light: the bar is 12 px at 4K; its first and last rows, and the row under it.
  const w = topRows(writer, 3, 13);
  const c = topRows(chrome, 3, 13);
  assert.notEqual(c[11][0].join(), c[12][0].join(), 'the light slide draws a 12 px bar on its top edge');
  for (const y of [0, 11, 12]) assert.ok(worst(w[y], c[y]) <= TOLERANCE, `4K bar row ${y} differs from Chrome's print by ${worst(w[y], c[y])} levels`);
});
