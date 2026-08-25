/**
 * `tools/lib/golden-set.mjs` — the ONE definition of the committed golden corpus.
 *
 * WHY THIS TEST EXISTS. Until #1843 the corpus was defined twice over and the two
 * definitions disagreed: `regression-gate.mjs` watched all 351 goldens, while
 * `golden-diff.mjs` had a `-- lib` pathspec and watched 150. Nothing said so, so a
 * 183-golden PR got no visual before/after at all (§6a of
 * `2026-08-24-golden-corpus-re-bless.md`). The fix was to move the rule into one module
 * both import — which only helps for as long as the module keeps meaning what it says.
 *
 * The failure mode this guards is SILENT SHRINKAGE: an exclusion predicate that quietly
 * widens drops artifacts out of the corpus, and every gate downstream goes green because
 * it is no longer looking. Nothing else in the tree would notice.
 *
 * SO THE ORACLE IS REIMPLEMENTED HERE, NOT IMPORTED. Asserting `deckGoldenPdfs()` against
 * `isExcludedDeckGolden()` would be self-referential — both sides move together and the
 * test could not fail for the one reason that matters. The expected set below is built
 * from literal path checks written out again by hand, so a change to the module's
 * predicates has to be made in two places by someone who means it. That is the same
 * lesson #1779 recorded when a NUL-gate test asserted a hand-written subset was present
 * in the array it was testing: unable to fail for a MISSING entry, which was the only
 * failure that mattered.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const MODULE = '../../../tools/lib/golden-set.mjs';

/** Every tracked `.pdf`, repo-relative. The raw input both sides start from. */
function trackedPdfs() {
  return execFileSync('git', ['ls-files', '*.pdf'], { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
}

/**
 * The rule, written out INDEPENDENTLY of the module: a deck golden is any tracked PDF
 * with a sibling `.md`, minus frozen decision evidence, minus the marp kit, minus the
 * gallery light/dark pairs (which are their own scope).
 */
function expectedDeckPdfs() {
  return trackedPdfs()
    .filter((f) => !f.startsWith('engineering/decisions/'))
    .filter((f) => !f.startsWith('kit/'))
    .filter((f) => !/\.gallery\.(light|dark)\.pdf$/.test(f))
    .filter((f) => fs.existsSync(path.join(ROOT, f.replace(/\.pdf$/, '.md'))))
    .sort();
}

describe('golden-set — the corpus definition', () => {
  test('the deck scope is exactly the documented rule, recomputed independently', async () => {
    const { deckGoldenPdfs } = await import(MODULE);
    assert.deepEqual(deckGoldenPdfs(ROOT), expectedDeckPdfs());
  });

  test('the corpus is not empty, and is not the whole tree either', async () => {
    // A predicate that widened to everything, or narrowed to nothing, would still pass a
    // deepEqual against a same-bug oracle. These are the crude bounds that would not.
    const { deckGoldenPdfs } = await import(MODULE);
    const decks = deckGoldenPdfs(ROOT);
    const all = trackedPdfs();
    assert.ok(decks.length > 100, `deck corpus collapsed to ${decks.length}`);
    assert.ok(decks.length < all.length, 'deck scope swallowed every tracked PDF');
    // Spot-anchors on both sides, by name, so a wholesale re-shuffle is visible.
    assert.ok(decks.includes('examples/state-marks.pdf'));
    assert.ok(!decks.some((f) => f.startsWith('engineering/decisions/')));
  });

  test('the two PATH exclusions are LOAD-BEARING — neither has rotted into a no-op', async () => {
    // A stale exclusion is the quiet kind of wrong: it reads like a rule and enforces
    // nothing, so the next person trusts it. Each must match a real tracked PDF AND
    // actually remove it — i.e. one that carries the sibling `.md` that would otherwise
    // make it a deck golden. Matching only files the sibling rule already drops is not
    // enforcement. Mirrors how SANCTIONED_* lists are gated elsewhere: the gate fails on
    // a STALE sanction, not only on a missing one.
    const all = trackedPdfs();
    const hasSibling = (f) => fs.existsSync(path.join(ROOT, f.replace(/\.pdf$/, '.md')));
    const cases = [
      ['engineering/decisions/', (f) => f.startsWith('engineering/decisions/')],
      ['kit/', (f) => f.startsWith('kit/')],
    ];
    for (const [label, pred] of cases) {
      const hits = all.filter(pred);
      assert.ok(hits.length > 0, `exclusion "${label}" matches no tracked PDF — it is dead`);
      const load = hits.filter(hasSibling);
      assert.ok(load.length > 0, `exclusion "${label}" only matches files the sibling rule already drops`);
    }
  });

  test('the gallery exclusion is belt-and-braces in the deck scope — and that is on purpose', async () => {
    // MEASURED, and it surprised the author of this test: all 150 gallery PDFs are named
    // `X.gallery.{light,dark}.pdf` but source from `X.gallery.md`, so NONE has the
    // matching `X.gallery.dark.md` sibling. The sibling rule alone already drops every
    // one of them, which makes the third entry in DECK_GOLDEN_EXCLUDE redundant HERE.
    //
    // It stays for two reasons, both worth pinning so nobody "tidies" it away: it states
    // the intent (the pairs are their own scope, and double-counting them would render
    // each twice and report each drift twice), and the same regex IS load-bearing one
    // function over — `classifyChangedPdf` returns 'gallery' on it before any sibling
    // lookup happens, which the `no`-callback case below proves.
    const all = trackedPdfs();
    const galleryPdfs = all.filter((f) => /\.gallery\.(light|dark)\.pdf$/.test(f));
    assert.ok(galleryPdfs.length > 0, 'no gallery goldens tracked at all — the corpus moved');
    const withSibling = galleryPdfs.filter((f) => fs.existsSync(path.join(ROOT, f.replace(/\.pdf$/, '.md'))));
    assert.equal(
      withSibling.length, 0,
      `${withSibling.length} gallery golden(s) now carry a same-stem .md, e.g. ${withSibling[0]}. ` +
        'The gallery exclusion just became load-bearing in the deck scope — move it into the ' +
        'load-bearing case above.',
    );
  });

  test('gallery goldens are never counted in the deck scope', async () => {
    // Both scopes render; counting a gallery in both renders it twice and reports each
    // drift twice, which is what the third exclusion exists to prevent.
    const { deckGoldenPdfs, isGalleryGolden } = await import(MODULE);
    assert.equal(deckGoldenPdfs(ROOT).filter(isGalleryGolden).length, 0);
  });
});

describe('golden-set — classifying a CHANGED pdf for the review surface', () => {
  const yes = () => true;
  const no = () => false;

  test('a gallery golden classifies as gallery, with no sibling lookup at all', async () => {
    const { classifyChangedPdf } = await import(MODULE);
    // `no` proves the gallery arm short-circuits: if it consulted the sibling it would
    // return null here, and the light/dark pair would vanish from the review surface.
    assert.equal(classifyChangedPdf('lib/components/inventory/checklist/checklist.gallery.dark.pdf', no), 'gallery');
    assert.equal(classifyChangedPdf('lib/base/_logo/logo.gallery.light.pdf', no), 'gallery');
  });

  test('a deck golden classifies as deck when the sibling markdown exists', async () => {
    const { classifyChangedPdf } = await import(MODULE);
    assert.equal(classifyChangedPdf('examples/state-marks.pdf', yes), 'deck');
    assert.equal(classifyChangedPdf('exemplars/corporate/investor-pitch.pdf', yes), 'deck');
  });

  test('the sibling is looked for on EITHER side, so an added or deleted deck still reports', async () => {
    // The case the widening introduced. A branch that DELETES a deck leaves a path in
    // neither the working tree nor `git ls-files`; a branch that ADDS one has no sibling
    // on the base. Both are worth telling a reviewer about, so the caller supplies the
    // either-side answer and this must honor it rather than checking the tree itself.
    const { classifyChangedPdf } = await import(MODULE);
    const seen = [];
    const record = (md) => { seen.push(md); return true; };
    assert.equal(classifyChangedPdf('examples/deleted-on-this-branch.pdf', record), 'deck');
    assert.deepEqual(seen, ['examples/deleted-on-this-branch.md'], 'must ask about the .md sibling, by name');
  });

  test('an excluded pdf classifies as nothing, even with a sibling', async () => {
    const { classifyChangedPdf } = await import(MODULE);
    assert.equal(classifyChangedPdf('engineering/decisions/2026-01-01-note/evidence.pdf', yes), null);
    assert.equal(classifyChangedPdf('kit/Sample-Deck.pdf', yes), null);
  });

  test('a pdf with no sibling markdown, and a non-pdf, classify as nothing', async () => {
    const { classifyChangedPdf } = await import(MODULE);
    assert.equal(classifyChangedPdf('some/orphan.pdf', no), null);
    assert.equal(classifyChangedPdf('lib/components/inventory/checklist/checklist.styles.css', yes), null);
    assert.equal(classifyChangedPdf('README.md', yes), null);
  });
});
