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

function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => path.join(dir, f))
    .sort();
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

// Recursively list source files under `dir` with any of `exts`. The emulator
// requires lib/ live at runtime (transforms, component .styles.css, the chart
// palette recipe), so the cache must hash ALL of it — a top-level `lib/*.js` scan
// missed lib/components/** and would serve a stale render after a transform or a
// chart-colour edit (build-chart-palette-css reads chart-family.css directly).
function listFilesRec(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) listFilesRec(p, exts, out);
    else if (exts.some((e) => ent.name.endsWith(e))) out.push(p);
  }
  return out;
}

function emulatorCacheKey(mdPath, palette) {
  const h = crypto.createHash('sha256');
  hashFiles(h, [
    mdPath,
    EMULATOR,
    THEME,
    MERMAID_JS,
    LOCKFILE,
    // The chart-palette compiler + its recipe input travel with the emulator render.
    path.join(ROOT, 'tools', 'build-chart-palette-css.js'),
    ...listFilesRec(path.join(ROOT, 'lib'), ['.js', '.mjs', '.css']),
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
