/**
 * Integration: every worked exemplar deck renders cleanly, and its
 * committed PDF is fresh.
 *
 * The 45 worked exemplars (`exemplars/<sector>/<name>.md`, the "what
 * good looks like" library served by the Drawing Board's Drafting
 * picker) are a standing surface that must keep rendering as components
 * evolve — the maintenance debt the design doc flags
 * (engineering/decisions/2026-06-14-worked-exemplar-decks.md
 * § Maintenance). #341 authored them and #351 wired them into the app,
 * but nothing re-rendered them in CI; a component change could silently
 * break a deck or drop a slide and no gate would notice. This is that
 * gate.
 *
 * Each deck is rendered ONCE, as the full source (full ⊃ standard ⊃
 * short, so the full deck exercises every slide any tier can show; the
 * pure tier filter itself is unit-tested in
 * test/unit/exemplars/tier-filter.test.js). Two assertions per deck,
 * both off that single render plus the committed PDF's page count
 * (pdfinfo is instant):
 *
 *   1. Fresh render → page count === source slide count. The emulator
 *      throws on a render failure (empty/missing PDF); an exact page
 *      count catches a transform that silently drops or merges a slide.
 *   2. Committed PDF (HARD RULE #9) exists and its page count === source
 *      slide count. Catches a committed artifact gone stale against an
 *      edited source — the pre-commit auto-rebuild
 *      (tools/build-staged-pdfs.js) keeps it current, the on-demand
 *      `npm run build:exemplar-pdfs` regenerates after a component-wide
 *      reflow.
 *
 * This is a page-count gate, mirroring the per-component gallery gate
 * (test/integration/components/component-galleries.test.js); it does
 * NOT pixel-diff against a golden (that's the gallery `regress` tier's
 * job, and the exemplars were render-verified by eye in #341).
 *
 * Cold runs render 45 full decks (up to ~25 slides each) and are slow;
 * the render helper caches by input hash for warm local runs. CI
 * disables the cache and verifies the real build.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runEmulator, ROOT } = require('../../helpers/render');
const { pageCount } = require('../../helpers/pdf');
const { pendingBless } = require('../../helpers/golden-pending');
const { splitDeck } = require('../../../lib/exemplars/tier-filter');

const EXEMPLARS_DIR = path.join(ROOT, 'exemplars');

// Discover every exemplar deck: exemplars/<sector>/<name>.md.
function discoverExemplars() {
  const out = [];
  for (const sector of fs.readdirSync(EXEMPLARS_DIR)) {
    const sectorDir = path.join(EXEMPLARS_DIR, sector);
    if (!fs.statSync(sectorDir).isDirectory()) continue;
    for (const file of fs.readdirSync(sectorDir)) {
      if (file.endsWith('.md')) out.push(path.join(sectorDir, file));
    }
  }
  return out.sort();
}

describe('exemplar-render', () => {
  const decks = discoverExemplars();

  // Guard the discovery itself: if the walk finds nothing (a moved
  // directory, a renamed tree), every per-deck test would silently
  // vanish and the suite would pass green. The library is a fixed 45.
  test('discovers the worked exemplar library', () => {
    assert.equal(
      decks.length,
      45,
      `expected 45 worked exemplar decks under exemplars/, found ${decks.length}`,
    );
  });

  for (const deckPath of decks) {
    const rel = path.relative(ROOT, deckPath);
    const expected = splitDeck(fs.readFileSync(deckPath, 'utf8')).slides.length;
    const committedPdf = deckPath.replace(/\.md$/, '.pdf');

    test(
      `${rel}: renders to ${expected} pages and its committed PDF is fresh`,
      { timeout: 600000 },
      () => {
        // (2) committed artifact is present and structurally current, unless it is
        // waiting on the nightly bless (PRs no longer commit PDFs; goldens step 3).
        const pending = pendingBless(committedPdf, [deckPath]);
        const committedOk = fs.existsSync(committedPdf) && pageCount(committedPdf) === expected;
        if (!committedOk && pending) {
          process.stderr.write(`exemplar-render: ${rel}: committed-PDF check skipped, ${pending}\n`);
        } else {
        assert.ok(
          fs.existsSync(committedPdf),
          `committed PDF missing: ${path.relative(ROOT, committedPdf)} — the nightly bless renders it`,
        );
        assert.equal(
          pageCount(committedPdf),
          expected,
          `${path.relative(ROOT, committedPdf)} page count drifted from its source (${expected} slides) — the nightly bless refreshes it`,
        );
        }

        // (1) fresh render succeeds and yields one page per slide.
        const pdf = runEmulator(deckPath);
        assert.equal(
          pageCount(pdf),
          expected,
          `${rel} rendered ${pageCount(pdf)} pages, expected ${expected} (a transform dropped or merged a slide)`,
        );
      },
    );
  }
});
