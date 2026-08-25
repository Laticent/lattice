// THE COMMITTED GOLDEN CORPUS — ONE definition, for every surface that reads it.
//
// WHY THIS FILE EXISTS. `2026-08-24-golden-corpus-re-bless.md` §6a measured the corpus
// from three surfaces and found they did not agree on what the corpus IS:
//
//   `--check`, and the nightly that runs it   all 351
//   `--bless` with no `--scope`               galleries only
//   `golden-diff` — the REVIEWER's before/after   galleries only
//
// The deck half was watched by the gate and invisible to both the refresh path and the
// review path, which is a better account of why it rotted than the bless default alone.
// A 183-golden PR got no visual before/after at all. The fix is not a second regex in
// `golden-diff.mjs` — that would recreate the disagreement one surface over. It is this
// module: the definition lives once and both consumers import it.
//
// The set is DERIVED from `git ls-files`, never hand-listed, for the reason #1279
// records: a hand-kept list of artifacts is silent by default, and the set of committed
// artifacts drifting from the set any gate knows about IS the defect.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// A GALLERY golden: `lib/**/<name>.gallery.{light,dark}.pdf`, 75 decks x 2 moods.
// Kept as a pure regex because `golden-diff` must still classify a golden the branch
// DELETED, which is no longer in `git ls-files`.
export const GALLERY_GOLDEN_RE = /\.gallery\.(light|dark)\.pdf$/;

// A DECK golden is any committed PDF with a sibling `.md`, minus these — each of which
// is a rule from PDF_OWNERSHIP that says, in prose, why re-rendering it is wrong.
// Moved verbatim from `regression-gate.mjs`; do not fork it.
export const DECK_GOLDEN_EXCLUDE = [
  // Frozen evidence beside a dated decision record. Rebuilding destroys the thing
  // being evidenced (PDF_OWNERSHIP: "a frozen artifact of the decision it sits beside").
  (f) => f.startsWith('engineering/decisions/'),
  // Rendered by REAL marp-cli on purpose, to show what a recipient's toolchain
  // produces. Re-rendering it through our engine replaces the artifact with one made
  // by the engine it exists to be compared against.
  (f) => f.startsWith('kit/'),
  // The light/dark gallery pairs are their own scope; counting them here would render
  // every one twice and report each drift twice.
  //
  // BELT-AND-BRACES, and knowing that is the point: all 150 pairs are named
  // `X.gallery.{light,dark}.pdf` but source from `X.gallery.md`, so none carries the
  // same-stem `.md` the sibling rule looks for — that rule already drops every one of
  // them (measured, `test/unit/tools/golden-set.test.js`). This entry states the intent
  // rather than doing the work, and the same regex IS load-bearing one function down, in
  // `classifyChangedPdf`. Kept deliberately; the test fails loudly if a same-stem `.md`
  // ever appears and this becomes the thing actually holding the line.
  (f) => GALLERY_GOLDEN_RE.test(f),
];

/** Pure: is this path excluded from the deck-golden scope? */
export function isExcludedDeckGolden(relPath) {
  return DECK_GOLDEN_EXCLUDE.some((ex) => ex(relPath));
}

/** Pure: is this path a gallery golden? */
export function isGalleryGolden(relPath) {
  return GALLERY_GOLDEN_RE.test(relPath);
}

/**
 * Every DECK golden currently committed, as repo-relative `.pdf` paths.
 * `git ls-files` + a sibling `.md` on disk — the regression gate's own rule.
 */
export function deckGoldenPdfs(root) {
  return execFileSync('git', ['ls-files', '*.pdf'], { cwd: root, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
    .filter((f) => !isExcludedDeckGolden(f))
    .filter((f) => existsSync(join(root, f.replace(/\.pdf$/, '.md'))))
    .sort();
}

/**
 * Classify a CHANGED pdf path for the review surface.
 *
 * `deckGoldenPdfs` cannot answer this on its own: a branch that DELETES a golden leaves
 * a path that is in neither `git ls-files` nor the working tree, and "a golden was
 * removed" is exactly what a reviewer needs told. So the sibling `.md` is looked for on
 * either side — `hasSibling(mdPath)` is supplied by the caller and should say whether
 * the markdown exists at HEAD *or* at the base ref.
 *
 * Returns 'gallery' | 'deck' | null.
 */
export function classifyChangedPdf(relPath, hasSibling) {
  if (isGalleryGolden(relPath)) return 'gallery';
  if (isExcludedDeckGolden(relPath)) return null;
  if (!relPath.endsWith('.pdf')) return null;
  return hasSibling(relPath.replace(/\.pdf$/, '.md')) ? 'deck' : null;
}
