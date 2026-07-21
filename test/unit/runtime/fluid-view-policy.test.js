/**
 * Unit: lib/runtime/fluid-view-policy.js — the pure decisions behind the
 * responsive fluid viewer. Extracted from the runtime IIFE precisely so these
 * can be pinned (the DOM watcher itself needs a live browser). Locks the
 * overflow-marker policy: the reader-vs-author marker text, and the "tab tracks
 * overflow independent of the class flip" fix. (P1's fill-vs-fixed band was
 * retired in P2 — the viewer fills every screen; the ultrawide cap is CSS-only.)
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  overflowTabText,
  overflowTabAction,
} = require('../../../lib/runtime/fluid-view-policy');

// NB: P1's fill-vs-fixed band (fluidDefaultFills) was retired in P2 — the viewer
// now fills every screen and the CSS edge cap (base.fluid-view.css
// `--fill-max-aspect`) handles ultrawide, so there is no JS band decision to test
// anymore. What remains pure + testable is the overflow-marker policy below.

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
