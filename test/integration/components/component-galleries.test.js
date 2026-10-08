/**
 * Integration: per-component gallery PDFs match the page count their
 * manifest implies via `expectedGallerySlideCount()`.
 *
 * This is the decentralized replacement for the central
 * test/fixtures/expected-page-counts.json snapshot (deleted in Phase 3
 * of the docs refactor). The expected count is DERIVED from the
 * manifest (title + sample + variant count + anti-patterns + closing),
 * not hand-maintained. Adding a variant to the manifest automatically
 * updates the expected count; a transform that silently drops a slide
 * fails the assertion.
 *
 * The two surviving top-level decks (gallery, gallery-mermaid) own
 * their counts inline in their own test files. (kpi-gallery was
 * retired in Phase 4; its regression signal now lives in the
 * per-component lib/components/kpi/kpi.gallery.pdf assertion below.)
 *
 * Cold runs are slow (one PDF per enriched component). The render
 * helper's cache hashes the manifest + styles.css + bundle so warm
 * runs are near-instant. CI disables the cache.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { pendingBless } = require('../../helpers/golden-pending');
const path = require('node:path');
const fs = require('node:fs');
const { loadAll } = require('../../../lib/components');
const {
  isEnriched,
  expectedGallerySlideCount,
  targetPaths,
} = require('../../../tools/build-component-docs');
const { runEmulator } = require('../../helpers/render');
const { pageCount } = require('../../helpers/pdf');

describe('component-galleries', () => {
  const manifests = loadAll();
  for (const m of manifests) {
    const enriched = isEnriched(m);
    // Hand-authored galleries (manifest.galleryAuthored: true) skip the
    // manifest-formula page-count assertion — the source isn't generator
    // output. They still get the light/dark parity check below.
    const skipFormula = enriched && !m.galleryAuthored ? false :
      (!enriched ? 'not yet migrated (no enriched prose fields)' :
       'gallery is hand-authored (manifest.galleryAuthored: true)');
    test(
      `${m.name}: light gallery page count matches manifest formula`,
      { timeout: 180000, skip: skipFormula },
      () => {
        const galleryPath = targetPaths(m).gallery;
        assert.ok(
          fs.existsSync(galleryPath),
          `gallery source missing: ${path.relative(process.cwd(), galleryPath)} — run \`npm run docs:components\``,
        );
        const pdf = runEmulator(galleryPath);
        assert.equal(
          pageCount(pdf),
          expectedGallerySlideCount(m),
          `${m.name}.gallery.light.pdf page count drifted from manifest formula`,
        );
      },
    );

    // Dark sibling — same source rendered with `dark` injected into
    // every _class directive. Page count must match the light count
    // (dark is a finish modifier, not a structural change); if it
    // doesn't, a transform is silently dropping a slide under the dark
    // variant. The PDF itself is committed via Phase 2.
    test(
      `${m.name}: dark gallery page count matches light`,
      { timeout: 180000, skip: enriched ? false : 'not yet migrated (no enriched prose fields)' },
      (t) => {
        const lightPdfPath = path.join(
          path.dirname(targetPaths(m).gallery),
          `${m.name}.gallery.light.pdf`,
        );
        const darkPdfPath = path.join(
          path.dirname(targetPaths(m).gallery),
          `${m.name}.gallery.dark.pdf`,
        );
        // Both PDFs come from the same bless; a gallery merged without them (goldens step 3)
        // has none until the nightly bless renders them.
        const pending = pendingBless(lightPdfPath, [targetPaths(m).gallery]);
        if (pending && !(fs.existsSync(lightPdfPath) && fs.existsSync(darkPdfPath))) {
          t.skip(`${m.name}: ${pending}`);
          return;
        }
        assert.ok(
          fs.existsSync(lightPdfPath),
          `light PDF missing: ${path.relative(process.cwd(), lightPdfPath)} — run \`npm run build:galleries\``,
        );
        assert.ok(
          fs.existsSync(darkPdfPath),
          `dark PDF missing: ${path.relative(process.cwd(), darkPdfPath)} — run \`npm run build:galleries\``,
        );
        assert.equal(
          pageCount(darkPdfPath),
          pageCount(lightPdfPath),
          `${m.name}.gallery.dark.pdf page count diverged from light — a transform may be dropping a slide under the dark variant`,
        );
      },
    );
  }
});
