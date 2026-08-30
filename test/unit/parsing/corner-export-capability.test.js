/**
 * Unit: which export targets can hold a rounded corner
 * (lib/core/corner-export-capability.mjs).
 *
 * The register (resolve-corners.js) says what the DECK asked for; this says what the
 * ARTIFACT can hold. A rounded corner is a hole, so it only reads where the target can
 * carry "nothing" — an alpha channel, or a live document whose host paints behind.
 *
 * The cases below are the ones that were wrong in production before this kernel existed
 * (2026-08-17-corner-export-capability.md): PPTX looked capable and is not, WebP is lossy
 * but is NOT alpha-less, and an unclassified target must fail safe.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('corner export capability', async () => {
  const { cornerSurvivesExport, isFlatExportTarget, CORNER_CAPABLE_TARGETS, CORNER_FLAT_TARGETS } =
    await import('../../../lib/core/corner-export-capability.mjs');

  test('alpha-carrying rasters and live documents keep the corner', () => {
    for (const t of ['png', 'webp', 'html', 'screen']) {
      assert.equal(cornerSurvivesExport(t), true, `${t} can carry a transparent corner`);
    }
  });

  test('formats that cannot carry a hole square instead', () => {
    for (const t of ['jpeg', 'pdf', 'pptx']) {
      assert.equal(cornerSurvivesExport(t), false, `${t} must square`);
      assert.equal(isFlatExportTarget(t), true, `${t} is a KNOWN flat target, not an unclassified one`);
    }
  });

  test('WebP keeps its corner even though it is lossy', () => {
    // The trap this guards: the image-set encoder used to branch on `meta.lossy` to
    // decide whether to paint an opaque underlay. Lossy and alpha-less are different
    // axes — branching on the wrong one flattens WebP's corner on one surface while the
    // other keeps it, which is exactly the cross-surface disagreement this kernel ended.
    assert.equal(cornerSurvivesExport('webp'), true);
    assert.equal(cornerSurvivesExport('jpeg'), false);
  });

  test('PPTX squares even though its slide image is a PNG', () => {
    // It looks capable — the image can hold alpha — but neither exporter writes a
    // <p:bg>, so the hole fills with the RECIPIENT's PowerPoint template background.
    // That would make the corner color a property of the reader's software.
    assert.equal(cornerSurvivesExport('pptx'), false);
  });

  test('an unclassified target squares — the safe direction', () => {
    // Squaring an alpha-capable format loses a corner the deck asked for; rounding a
    // flat one ships the pale-notch artifact. Only the second is a visible defect, so
    // anything unmeasured must fall to square. A new format opts IN with its evidence.
    for (const t of [undefined, null, '', 'avif', 'tiff', 'svg', 42, {}]) {
      assert.equal(cornerSurvivesExport(t), false, `${String(t)} is unclassified and must square`);
      assert.equal(isFlatExportTarget(t), false, `${String(t)} is unclassified, NOT a measured flat target`);
    }
  });

  test('target matching is case- and whitespace-insensitive', () => {
    assert.equal(cornerSurvivesExport('  PNG '), true);
    assert.equal(cornerSurvivesExport('PPTX'), false);
  });

  test('EVERY target string the exporters can actually produce is classified', async () => {
    // The most valuable guard here, and the one the kernel cannot provide for itself: the
    // table is only correct if it covers the real vocabulary. Nothing else fails when a new
    // export format appears — it just silently squares, because unknown targets square by
    // design. That default is right for safety and wrong for discovery, so this is the test
    // that turns "we forgot to classify avif" from a shipped artifact into a red suite.
    const { IMAGE_FORMATS } = require('../../../lib/export/image-set.js');
    // The emulator's OUT_FORMAT vocabulary (lattice-emulator.js) plus the literals the
    // Studio's capture sites pass (deck-export.js). Kept explicit rather than parsed out of
    // the sources: a regex over those files would rot more quietly than this list.
    const EXPORTER_TARGETS = [...IMAGE_FORMATS, 'pdf', 'pptx', 'html'];
    for (const t of EXPORTER_TARGETS) {
      const classified = CORNER_CAPABLE_TARGETS.includes(t) || CORNER_FLAT_TARGETS.includes(t);
      assert.equal(classified, true, `'${t}' is a target an exporter can produce but the capability table never classifies it — it would silently square. Add it to lib/core/corner-export-capability.mjs with its measurement.`);
    }
  });

  test('the two lists are disjoint and frozen', () => {
    for (const t of CORNER_CAPABLE_TARGETS) {
      assert.equal(CORNER_FLAT_TARGETS.includes(t), false, `${t} cannot be both capable and flat`);
    }
    assert.equal(Object.isFrozen(CORNER_CAPABLE_TARGETS), true);
    assert.equal(Object.isFrozen(CORNER_FLAT_TARGETS), true);
  });
});
