/**
 * Render helpers: spawn the emulator, return paths to built
 * artifacts. Used by integration tests.
 *
 * # Caching
 *
 * Integration tests rebuild gallery PDFs that take 10s–2min each.
 * Across a full `npm run test:integration` run the same source is
 * rendered more than once, and the chart-family fixture is rendered
 * 6× (once per test in the file). To kill the redundancy, the helpers
 * hash all renderer inputs and reuse a cached PDF when the hash matches.
 *
 * Cache key inputs (any change invalidates):
 *   - source .md content
 *   - lattice-emulator.js
 *   - lattice.css + all themes/*.css
 *   - all lib/*.js
 *   - mermaid-v11.min.js
 *   - package-lock.json (catches dep upgrades)
 *   - palette argument
 *   - Node version
 *
 * Cache location: `.scratch/test-cache/emu-<hash>.pdf` plus
 * the emulator's `.html` sidecar at the same basename. The .scratch
 * tree has a 14-day GC via `npm run clean:scratch`.
 *
 * Cache is DISABLED when:
 *   - CI=true (integration tests in CI must verify the real build)
 *   - LATTICE_TEST_NO_CACHE=1 (manual opt-out for debugging suspected
 *     cache-key bugs)
 *
 * Returned paths are owned by the cache (or by tmpdir in no-cache
 * mode); callers MUST NOT unlinkSync them. .scratch/ cleans itself;
 * tmpdir cleans itself across CI runs.
 */

const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT       = path.join(__dirname, '..', '..');
const EXAMPLES   = path.join(ROOT, 'examples');
const THEME      = path.join(ROOT, 'dist', 'lattice.css');
const EMULATOR   = path.join(ROOT, 'lattice-emulator.js');
const MERMAID_JS = path.join(ROOT, 'mermaid-v11.min.js');
const LOCKFILE   = path.join(ROOT, 'package-lock.json');
const CACHE_DIR  = path.join(ROOT, '.scratch', 'test-cache');

const USE_CACHE =
  process.env.CI !== 'true' && process.env.LATTICE_TEST_NO_CACHE !== '1';

/**
 * Every `ext` file under `dir`, RECURSIVELY.
 *
 * This walked one level deep for a long time, and `lib/` has almost nothing at its top level —
 * the engine lives in `lib/core`, `lib/components/<bucket>/<name>`, `lib/forms/…`. So the
 * emulator's render cache did not invalidate on a change to essentially any engine source: a
 * local integration run could load a PDF rendered before your edit and report it as a pass.
 * It surfaced while mutation-testing the footer band — removing the section label from
 * `lib/forms/tile/progress/progress.transform.js` left the suite green, not because the
 * assertion was weak but because the render it measured predated the change. CI sets
 * `CI=true`, which disables the cache entirely, so this only ever misled locally — which is
 * worse, since local is where you decide whether an assertion works.
 */
function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full, ext));
    else if (e.name.endsWith(ext)) out.push(full);
  }
  return out.sort();
}

function hashFiles(h, files) {
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    h.update(path.relative(ROOT, f));
    h.update('\0');
    h.update(fs.readFileSync(f));
    h.update('\0');
  }
}

function emulatorCacheKey(mdPath, palette) {
  const h = crypto.createHash('sha256');
  hashFiles(h, [
    mdPath,
    EMULATOR,
    THEME,
    MERMAID_JS,
    LOCKFILE,
    ...listFiles(path.join(ROOT, 'lib'), '.js'),
    // …and the CSS beside it. A layout rule decides what the render looks like every bit as much
    // as a transform does; `dist/lattice.css` (THEME, above) is the built bundle and does cover it
    // in practice, but only while the bundle is up to date, which is exactly the state a test run
    // cannot assume.
    ...listFiles(path.join(ROOT, 'lib'), '.css'),
    ...listFiles(path.join(ROOT, 'themes'), '.css'),
  ].sort());
  h.update(palette);
  h.update('\0');
  h.update(process.version);
  return h.digest('hex').slice(0, 16);
}

function tmpFile(suffix) {
  return path.join(
    os.tmpdir(),
    `lattice-test-${process.pid}-${Date.now()}${Math.random().toString(36).slice(2, 8)}${suffix}`,
  );
}

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function buildEmulator(mdPath, palette, outPdf, timeout) {
  execFileSync(
    process.execPath,
    [EMULATOR, mdPath, THEME, outPdf, palette, '-q'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout },
  );
  if (!fs.existsSync(outPdf) || fs.statSync(outPdf).size < 10000) {
    throw new Error(`Emulator produced empty/missing PDF: ${outPdf}`);
  }
}

function runEmulator(mdFile, { palette = 'indaco', timeout = 600000 } = {}) {
  const mdPath = path.isAbsolute(mdFile) ? mdFile : path.join(EXAMPLES, mdFile);

  if (USE_CACHE) {
    ensureDir(CACHE_DIR);
    const cached = path.join(CACHE_DIR, `emu-${emulatorCacheKey(mdPath, palette)}.pdf`);
    if (!(fs.existsSync(cached) && fs.statSync(cached).size >= 10000)) {
      buildEmulator(mdPath, palette, cached, timeout);
    }
    return cached;
  }

  const out = tmpFile('.pdf');
  buildEmulator(mdPath, palette, out, timeout);
  return out;
}

module.exports = { ROOT, EXAMPLES, THEME, EMULATOR, runEmulator, tmpFile };
