/**
 * Is a committed gallery PDF stale with respect to the things that render it?
 *
 * WHY THIS EXISTS. `build-galleries.js --check` and `build-bucket-galleries.js --check`
 * both compared one mtime — the gallery `.md` against the PDF — and called the result
 * "up to date". A gallery PDF is a function of far more than its markdown, so the gate
 * was blind to the most common way these PDFs go stale: a CSS or engine change with no
 * deck edit at all. #1632 was entirely CSS and moved 424 slides across 122 galleries
 * while `--check` reported every one of them current. Its green was then cited in a
 * decision note as evidence the committed PDFs matched the render, which it could not
 * support.
 *
 * WHY NOT MTIMES. The obvious widening — take the newest mtime over `lib` + `themes` and
 * compare — was built first and it is unusable, because an mtime records filesystem
 * churn rather than content change, and it is wrong in BOTH directions:
 *
 *   · FALSE FRESH — a fresh clone stamps every file at checkout time, so no input ever
 *     looks newer than any PDF. In CI, the environment this gate most needs to work in,
 *     it would pass unconditionally.
 *   · FALSE STALE — `git checkout <ref> -- themes` rewrites those mtimes while leaving
 *     the PDFs alone. Measured on this very branch: 15 of 32 palette files ended up
 *     "newer" than every gallery PDF with identical content, reporting all 236 stale.
 *
 * A gate whose red is usually noise gets ignored, which is worse than the blind spot it
 * was built to close.
 *
 * WHAT IT DOES INSTEAD. It asks git what actually changed. The committed PDFs were
 * committed alongside the CSS and engine that produced them, so HEAD is the pairing
 * evidence: if every render input matches HEAD, the artifacts are as-committed and this
 * gate has nothing to say. If an input is modified, staged or untracked and the PDFs are
 * not, the PDFs no longer reflect their inputs. That is deterministic, survives a fresh
 * clone, and is immune to checkout churn.
 *
 * WHICH FILES COUNT. Only what a render actually consumes: stylesheets and engine code
 * under `lib` and `themes`, the renderer entry point, and the built bundle. Not theme
 * `.manifest.json`, not `*.docs.md`, not `themes/palette-audit.pdf` — those change
 * without changing a pixel. And not a component's own `*.gallery.md`, which is that
 * PDF's deck source and is checked separately by the caller.
 *
 * WHAT IT STILL CANNOT DO. It cannot see a change that was committed WITHOUT rebuilding
 * the PDFs — once both sides are at HEAD, the pairing looks sound whether or not anyone
 * re-rendered. That case belongs to `tools/golden-diff.mjs`, which rasterizes both sides
 * and diffs pixels, and which is the authoritative freshness gate. This one is the cheap
 * pre-commit guard that catches the edit before it becomes that problem.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');

// Prefixes under which a changed file is a render input. `lib` carries the CSS that
// `dist/lattice.css` is built from AND the transform kernel that shapes the DOM (a
// change in `lib/core` or `lib/transformers` moves the render with no CSS diff at all);
// `themes` carries the palettes.
const INPUT_DIRS = ['lib/', 'themes/', 'dist/'];
const INPUT_FILES = ['lattice-emulator.js'];
const INPUT_EXT = new Set(['.css', '.js', '.mjs', '.cjs']);

// A component's own gallery deck is not a shared input — the caller compares it
// directly, and counting it here would mark every OTHER gallery stale alongside it.
const isGalleryDeck = (p) => p.endsWith('.gallery.md');

// INPUT_DIRS/INPUT_FILES classify a changed path (`isRenderInput`); they do NOT scope
// the git query. They used to do both, and that quietly broke the third arm of
// `stalenessAgainstInputs` for any caller whose artifact lives outside them: the
// showcase gallery renders to `examples/`, so its PDF could never appear in `paths`,
// the "already rebuilt in this tree" escape could never fire, and the gate would have
// reported stale forever — a red no rebuild could clear. The query is the whole tree
// now and the classifier is the only filter. Measured cost of dropping the pathspec on
// this repo, 25 interleaved reps after a warm-up: p50 13.1ms -> 17.8ms for one `git
// status`, memoized once per process — about 5ms. (An earlier version of this comment
// said 35ms -> 106ms. That was one unwarmed `time` call per side, so it was mostly
// process start-up; a checker could not reproduce it and was right not to.)

function isRenderInput(rel) {
  if (isGalleryDeck(rel)) return false;
  if (INPUT_FILES.includes(rel)) return true;
  if (!INPUT_EXT.has(path.extname(rel))) return false;
  return INPUT_DIRS.some((d) => rel.startsWith(d));
}

let memo = null;

/**
 * Everything in the working tree that differs from HEAD — modified, staged, or untracked.
 * ONE git call for the whole run and NO pathspec: callers ask about their own deck and
 * their own PDF as well as the shared inputs, and those artifacts do not all live under
 * `INPUT_DIRS` (see the note above the constants). Filtering to render inputs is
 * `changedRenderInputs`' job, not this one's.
 *
 * @returns {{ paths: Set<string>, available: boolean }} `available: false` when git cannot
 *          answer (no repo, no git binary — e.g. an installed copy of the package). The
 *          caller then reports nothing rather than inventing a verdict: a gate that
 *          guesses is the thing this module exists to stop.
 */
function changedPaths() {
  if (memo) return memo;
  let out;
  try {
    out = execFileSync('git', ['status', '--porcelain', '-z'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    memo = { paths: new Set(), available: false };
    return memo;
  }
  // `-z` records are NUL-separated, each beginning with a 2-char status + a space. A
  // rename/copy record carries its ORIGIN path as a second NUL-terminated field, so this
  // is parsed as a stream rather than split on newlines: a path may legally contain a
  // newline, and `--porcelain` without `-z` would quote and mangle it.
  const paths = new Set();
  const records = out.split('\0').filter(Boolean);
  for (let i = 0; i < records.length; i++) {
    const status = records[i].slice(0, 2);
    paths.add(records[i].slice(3));
    if (status[0] === 'R' || status[0] === 'C') i++; // skip the origin-path field
  }
  memo = { paths, available: true };
  return memo;
}

/** Render inputs that changed — the shared set, deck sources excluded. */
function changedRenderInputs() {
  const { paths, available } = changedPaths();
  return { files: [...paths].filter(isRenderInput).sort(), available };
}

/** Drop the memo. Only a test needs this — a CLI run is a single process. */
function _resetCache() { memo = null; }

const relOf = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/** Modification time in ms, or 0 when the file cannot be stat'd (treated as oldest). */
function mtimeOf(p) {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}

/**
 * @param {string} pdfPath   the artifact
 * @param {string} deckPath  its own deck source
 * @returns {{stale: boolean, reason?: string}}
 */
function stalenessAgainstInputs(pdfPath, deckPath) {
  if (!fs.existsSync(pdfPath)) return { stale: true, reason: 'missing' };

  const { paths, available } = changedPaths();
  if (!available) return { stale: false, reason: 'git cannot answer — not checked' };

  // A dirty PDF means a rebuild already happened in this working tree — whatever else
  // changed, this artifact has been regenerated against it.
  //
  // …UNLESS an input changed AGAIN after that rebuild, and that hole is the whole
  // failure this module exists to stop, one iteration later: edit the engine, rebuild,
  // edit the engine again, and the arm below would answer "fresh" while the artifact
  // shows the first edit. A HARD RULE #25 checker reproduced exactly that loop.
  //
  // AN MTIME IS SOUND *HERE*, where the header rejects it everywhere else, and the
  // reason is the guard above it: this line is reached only when the artifact is
  // ALREADY DIRTY in this working tree. That excludes both failure modes the header
  // names — a fresh clone has nothing dirty at all, and `git checkout <ref> -- themes`
  // dirties inputs while leaving the PDF clean, so it never gets here. What is left is
  // one honest question: was this PDF written after the newest input that changed?
  if (paths.has(relOf(pdfPath))) {
    const pdfAt = mtimeOf(pdfPath);
    const newer = changedRenderInputs().files.filter((f) => mtimeOf(path.join(ROOT, f)) > pdfAt);
    if (!newer.length) return { stale: false };
    const shown = newer.slice(0, 2).join(', ');
    const more = newer.length > 2 ? ` +${newer.length - 2} more` : '';
    return { stale: true, reason: `render input changed AFTER the last rebuild (${shown}${more})` };
  }

  // The deck is checked the same way as every other input, deliberately. An earlier cut
  // kept an mtime comparison for this one arm and it reproduced the false-stale failure
  // immediately: `git checkout <ref> -- lib` rewrote one gallery's mtime and the gate
  // reported it stale with byte-identical content.
  if (paths.has(relOf(deckPath))) {
    return { stale: true, reason: `source changed, PDF not rebuilt (${path.basename(deckPath)})` };
  }

  const { files } = changedRenderInputs();
  if (files.length === 0) return { stale: false };
  const shown = files.slice(0, 2).join(', ');
  const more = files.length > 2 ? ` +${files.length - 2} more` : '';
  return { stale: true, reason: `render input changed, PDF not rebuilt (${shown}${more})` };
}

module.exports = {
  stalenessAgainstInputs, changedRenderInputs, changedPaths, isRenderInput, _resetCache,
  INPUT_DIRS, INPUT_FILES,
};
