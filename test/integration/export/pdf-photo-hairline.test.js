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
const TOLERANCE = 6;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-hairline-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function render(out, extra = []) {
  const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out, '--quiet', ...extra], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}

/** The top two pixel rows of page 2, as [r,g,b] triples across the middle half of the slide. */
function topRows(pdf) {
  const base = path.join(tmp, path.basename(pdf, '.pdf'));
  const r = spawnSync('pdftoppm', ['-r', '96', '-f', '2', '-l', '2', '-singlefile', '-y', '0', '-H', '2', '-W', '4000', pdf, base]);
  assert.equal(r.status, 0, String(r.stderr));
  const buf = fs.readFileSync(`${base}.ppm`);
  const head = buf.toString('latin1', 0, 64).match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  const w = Number(head[1]);
  const px = buf.subarray(head[0].length);
  const row = (y) => Array.from({ length: Math.floor(w / 2) }, (_, i) => {
    const o = (y * w + Math.floor(w / 4) + i) * 3;
    return [px[o], px[o + 1], px[o + 2]];
  });
  return [row(0), row(1)];
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
