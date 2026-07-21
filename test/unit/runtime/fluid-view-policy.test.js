/**
 * Unit: lib/runtime/fluid-view-policy.js — the pure decisions behind the
 * responsive fluid viewer. Extracted from the runtime IIFE precisely so these
 * can be pinned (the DOM watcher itself needs a live browser). Locks the P1
 * adaptive-viewport-fill behavior: the band boundary (so the provisional 1.9
 * can't drift into filling ultrawide unobserved), the reader-vs-author marker
 * text, and the "tab tracks overflow independent of the class flip" fix.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  FILL_DEFAULT_MAX_ASPECT,
  fluidDefaultFills,
  overflowTabText,
  overflowTabAction,
} = require('../../../lib/runtime/fluid-view-policy');

describe('fluidDefaultFills — the landscape fill band', () => {
  const fill = (w, h) => fluidDefaultFills(w, h);

  test('the provisional boundary is 1.9 (guard against silent drift; P2 replaces it)', () => {
    // If this changes, it must be a deliberate edit with the P2 families.js
    // boundary — not an accidental tweak that starts filling ultrawide.
    assert.equal(FILL_DEFAULT_MAX_ASPECT, 1.9);
  });

  test('fills within the band', () => {
    assert.equal(fill(900, 1440), true, 'portrait (0.63)');
    assert.equal(fill(1080, 1080), true, 'square (1.0)');
    assert.equal(fill(1200, 900), true, '4:3 standard (1.33)');
    assert.equal(fill(1440, 900), true, '16:10 laptop (1.60)');
    assert.equal(fill(1280, 720), true, '16:9 (1.78)');
    assert.equal(fill(390, 844), true, 'phone portrait (0.46)');
  });

  test('excludes ultrawide (keeps the fixed deck — no dead band until the P2 cap)', () => {
    assert.equal(fill(2560, 1080), false, '21:9 ultrawide (2.37)');
    assert.equal(fill(3440, 1440), false, '21:9 (2.39)');
    assert.equal(fill(1920, 800), false, '2.40');
  });

  test('the boundary is inclusive, and one step either side flips', () => {
    assert.equal(fluidDefaultFills(190, 100), true, 'exactly 1.9 → fills (inclusive)');
    assert.equal(fluidDefaultFills(189, 100), true, 'just under → fills');
    assert.equal(fluidDefaultFills(191, 100), false, 'just over → fixed');
  });

  test('degenerate viewports stay finite (no divide-by-zero / NaN / Infinity)', () => {
    assert.equal(fluidDefaultFills(1280, 0), false, '0 height → aspect 1280 → fixed, not Infinity');
    assert.equal(fluidDefaultFills(0, 1000), true, '0 width → aspect 0 → fills');
    assert.equal(Number.isFinite(1280 / Math.max(1, 0)), true, 'the floor keeps it finite');
  });

  test('honors an explicit maxAspect (so P2 can pass the families.js boundary in)', () => {
    assert.equal(fluidDefaultFills(2560, 1080, 2.5), true, 'a wider cap fills 21:9');
  });
});

describe('overflowTabText — reader vs author label', () => {
  test('author preview names the defect; the reader gets a calm cue', () => {
    assert.equal(overflowTabText(true), 'Overflows', 'author (authorTags:true)');
    assert.equal(overflowTabText(false), 'More below', 'reader (authorTags:false)');
  });
});

describe('overflowTabAction — tab tracks overflow, NOT the class flip', () => {
  // The crux of the baked-overflow fix: the export stamps `.overflow` at build
  // time, so a pre-stamped slide never "flips" the class — the tab decision must
  // therefore depend only on (over, hasTab), never on a class transition. This
  // function takes no class-flip input, which is exactly what makes that true.
  test('adds a tab when a slide overflows and has none — even a build-time-baked one', () => {
    assert.equal(overflowTabAction({ over: true, hasTab: false }), 'add');
  });
  test('removes a stale tab when a slide no longer overflows', () => {
    assert.equal(overflowTabAction({ over: false, hasTab: true }), 'remove');
  });
  test('does nothing when already in the right state (idempotent → the watcher settles)', () => {
    assert.equal(overflowTabAction({ over: true, hasTab: true }), 'none', 'overflowing, tab present');
    assert.equal(overflowTabAction({ over: false, hasTab: false }), 'none', 'fits, no tab');
  });
});
