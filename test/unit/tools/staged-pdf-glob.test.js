/**
 * `classify()` in tools/build-staged-pdfs.js is the predicate for "this markdown should
 * have a committed PDF". The nightly bless bot uses it to find a deck that has no PDF
 * yet and render one (engineering/decisions/2026-10-06-goldens-bot-blessed.md §2.3), so a
 * deck family it does not understand would never get a PDF at all. This file walks the
 * REAL index for every deck that ships a committed PDF and asserts classify() knows it.
 *
 * It used to also drive the real lefthook binary against the pre-commit `pdf-rebuild`
 * glob, because that glob and classify() had to agree: twice a path one could see and
 * the other could not silently stopped a family of PDFs being rebuilt. That hook is gone
 * in goldens rollout step 3 (pull requests no longer commit PDFs), so the last test here
 * pins that no pre-commit job stages PDFs again.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
// A scratch repo must not reach the REAL one. A git hook exports GIT_DIR and GIT_INDEX_FILE,
// and in a linked worktree both are absolute, so the `git init`/`config`/`add` below, run
// from a temp dir, acted on this checkout's own repo (it wrote `user.email = t@t` into the
// shared .git/config and emptied the commit's index). Scrub them for every child process.
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete process.env[k];
const YAML = require('yaml');

// A git hook exports GIT_DIR (and GIT_INDEX_FILE, GIT_WORK_TREE) to everything it runs, and this
// file builds throwaway repos with `git init` + `git config`. With GIT_DIR inherited, those calls
// land on the REAL repo instead: `git init` re-initializes it as bare (core.bare=true, because
// GIT_DIR names no work tree) and `git config user.name t` rewrites its identity, which broke every
// git command in a checkout whose pre-commit hook ran this suite. Cleared for the whole file, so
// the code under test inherits the clean environment too; `node --test` runs each file in its own
// process, so nothing outside this file sees the change.
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k];

const { classify } = require('../../../tools/build-staged-pdfs.js');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * Markdown that ships a committed PDF which `classify()` deliberately does NOT
 * handle. Each is a PRE-EXISTING gap, none on the path of the change that added
 * this test (HARD RULE #18 — log an off-path defect rather than ignoring it or
 * dragging it into an unrelated diff). Recorded so the gap is visible and counted
 * instead of silently excused; the staleness test below fails if an entry rots.
 *
 * These reasons are deliberately literal about what does and does not exist. An
 * earlier draft claimed palette-audit was "rebuilt when a theme changes" — no such
 * builder exists anywhere in the repo, and an inaccurate entry costs the whole
 * ledger its credibility.
 */
// Both `lib/base/_logo/logo.gallery.md` and `themes/palette-audit.md` used to sit
// here, each with a comment saying in so many words "NO builder exists for it …
// editing its markdown DOES leave the PDF stale. A real gap, logged." They are
// classified now (#1279): the logo gallery through build-bucket-galleries'
// EXTRA_GALLERIES, the palette audit as an ordinary sibling-PDF deck. A logged gap
// that stays logged is still a gap.
const KNOWN_UNCLASSIFIED = new Set([
  // A dated decision doc that ships a rendered companion PDF. A one-off, not a
  // deck family; dated decision notes are not edited after the fact.
  'engineering/decisions/2026-05-12-kpi-candidates.md',
  // The Marp kit's sample deck. Deliberately NOT classifiable: its committed PDF
  // is rendered by real marp-cli against dist/marp-kit — the surface a recipient
  // actually uses — not by Lattice's own renderer. Rebuilding it through the
  // normal path would quietly replace the artifact with one produced by a
  // DIFFERENT engine, which is exactly the comparison the PDF exists to make. It
  // is refreshed by rendering the kit; see tools/build-marp-kit.js.
  'kit/Sample-Deck.md',
]);

/**
 * Every markdown file in the repo that ships a sibling committed PDF.
 *
 * Sourced from `git ls-files`, NOT a directory walk. The question this file asks is
 * about what the pre-commit hook rebuilds, and a hook only ever sees TRACKED paths —
 * so an untracked or gitignored file on disk is not a deck that "ships a PDF", it is
 * a local artifact. The walk this replaces disagreed: run the regression gate (which
 * writes `.regr-*.md` / `.regr-*.pdf` pairs beside the galleries, gitignored) and the
 * next `npm test` failed, naming a scratch file the hook could not reach even in
 * principle. A corpus test's corpus is the index.
 */
function decksShippingPdfs() {
  const tracked = spawnSync('git', ['ls-files', '-z', '--', '*.md', '*.pdf'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (tracked.status !== 0) throw new Error(`git ls-files failed: ${tracked.stderr}`);
  const files = tracked.stdout.split('\0').filter(Boolean);
  const pdfs = new Set(files.filter((f) => f.endsWith('.pdf')));
  // A deck "ships a PDF" if a sibling artifact is COMMITTED under the plain name or
  // either half of the light/dark gallery pair. `.dark.pdf` is probed too — a deck
  // shipping only a dark artifact would otherwise be invisible here.
  return files
    .filter((f) => f.endsWith('.md'))
    .filter((f) => {
      const stem = f.replace(/\.md$/, '');
      return pdfs.has(`${stem}.pdf`) || pdfs.has(`${stem}.light.pdf`) || pdfs.has(`${stem}.dark.pdf`);
    })
    .sort();
}

describe('classify() covers every deck that ships a committed PDF', () => {
  const decks = decksShippingPdfs();

  test('the repo actually has decks shipping committed PDFs (the walk works)', () => {
    // Guard against the sweep silently finding nothing and every assertion below
    // passing vacuously — the same "green while blind" failure this file exists for.
    assert.ok(decks.length > 50, `expected >50 decks shipping PDFs, found ${decks.length}`);
  });

  test('every deck that ships a committed PDF is understood by classify()', () => {
    const unclassified = decks.filter((d) => !classify(d)).filter((d) => !KNOWN_UNCLASSIFIED.has(d));
    assert.deepEqual(
      unclassified,
      [],
      `these markdown files ship a committed PDF but classify() returns null, so even\n` +
        `when the hook runs their PDF is never rebuilt:\n  ${unclassified.join('\n  ')}\n` +
        `Add a rule to classify(), or — if the PDF is genuinely built by another path —\n` +
        `add the file to KNOWN_UNCLASSIFIED with the reason.`,
    );
  });

  test('the KNOWN_UNCLASSIFIED list has not gone stale', () => {
    // An entry that no longer exists, or that classify() has since learned to
    // handle, is a lie in the ledger — fail so the list stays honest rather than
    // quietly excusing paths that are now covered.
    for (const p of KNOWN_UNCLASSIFIED) {
      assert.ok(fs.existsSync(path.join(ROOT, p)), `KNOWN_UNCLASSIFIED entry no longer exists: ${p}`);
      assert.equal(classify(p), null, `classify() now handles ${p} — remove it from KNOWN_UNCLASSIFIED`);
    }
  });

  test('the glob does not sweep in prose that produces no PDF', () => {
    // examples/chart-theme-gallery/ holds a README plus PDFs built by an unrelated
    // path under different names. The leading-lowercase stem in the subdirectory
    // rule is what keeps README.md out.
    assert.equal(classify('examples/chart-theme-gallery/README.md'), null);
  });

  test('no pre-commit job renders or stages PDFs (pull requests do not commit them)', () => {
    const cfg = YAML.parse(fs.readFileSync(path.join(ROOT, 'lefthook.yml'), 'utf8'));
    const jobs = cfg['pre-commit']?.jobs || [];
    const offenders = jobs.filter((j) => j.name === 'pdf-rebuild' || /build-staged-pdfs/.test(String(j.run || '')));
    assert.deepEqual(offenders.map((j) => j.name), [],
      'a pre-commit job renders deck PDFs into the commit, which tools/check-no-pdf-in-pr.mjs then rejects. ' +
        'The nightly bless bot is the one writer of committed PDFs.');
  });
});
