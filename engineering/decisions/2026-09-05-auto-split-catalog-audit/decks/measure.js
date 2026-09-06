/**
 * The two measurement primitives `looks.js` and `variants.js` share: rasterize
 * one PDF page, and compare two rasters.
 *
 * Both shell out, and both take PATHS as arguments — a deck name, a working
 * directory that can come from `ASAUDIT_WORK`. So neither may build a command
 * STRING: an interpolated path with a space splits into two arguments, and one
 * with a `;` runs whatever follows it. `spawnSync` with an argv array never
 * reaches a shell, so a path is a path whatever is in it. (CodeQL's
 * "shell command built from environment values" on PR #2065 flagged exactly
 * this, six times, in the string-building version these functions replace.)
 *
 * `spawnSync` rather than `execFileSync` for one reason: ImageMagick's `compare`
 * writes its metric to STDERR and exits NON-ZERO whenever the images differ,
 * which is the normal case here. `execFileSync` would throw on every real
 * comparison and hide the number in the error; `spawnSync` hands back
 * `{status, stdout, stderr}` and never throws.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error) throw new Error(`${cmd} could not run: ${r.error.message}`);
  return r;
}

/** Rasterize one page to `${outBase}.png` (skipped when it already exists). */
function renderPage(pdfPath, page, outBase, dpi = 50) {
  const png = `${outBase}.png`;
  if (fs.existsSync(png)) return png;
  const r = run('pdftoppm', [
    '-png', '-r', String(dpi), '-f', String(page), '-l', String(page),
    '-singlefile', pdfPath, outBase,
  ]);
  if (r.status !== 0) throw new Error(`pdftoppm failed on ${pdfPath} p${page}: ${r.stderr}`);
  return png;
}

/** Percentage of pixels that differ between two rasters of the same size. */
function diffPct(a, b) {
  // `compare` prints the absolute-error count to stderr and exits 1 when the
  // images differ, 0 when identical, 2 on a real failure.
  const cmp = run('compare', ['-metric', 'AE', a, b, 'null:']);
  if (cmp.status !== 0 && cmp.status !== 1) return null;
  const n = Number.parseInt(String(cmp.stderr).replace(/[^0-9].*$/s, ''), 10);
  if (!Number.isFinite(n)) return null;
  const id = run('identify', ['-format', '%w %h', a]);
  const [w, h] = String(id.stdout).trim().split(/\s+/).map(Number);
  if (!w || !h) return null;
  return (n / (w * h)) * 100;
}

module.exports = { renderPage, diffPct };
