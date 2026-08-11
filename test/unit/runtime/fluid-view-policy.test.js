/**
 * Unit: lib/runtime/fluid-view-policy.js — the pure decisions behind the
 * responsive fluid viewer. Extracted from the runtime IIFE precisely so these
 * can be pinned (the DOM watcher itself needs a live browser). Locks the
 * overflow-marker policy: the reader-vs-author marker text and what `off` sweeps.
 * (P1's fill-vs-fixed band was retired in P2 — the viewer fills every screen; the
 * ultrawide cap is CSS-only.)
 *
 * `overflowTabAction` / `legibilityTabAction` — the add / update / remove / none
 * decisions, and the suites that pinned them — went with the tabs becoming BERTHS
 * the markup carries (lib/core/fit-berth.js). "Should I create a node this tick"
 * stopped being a question either watcher asks; what is left is one guarded text
 * write, which has no decision worth a pure function.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  overflowTabText,
  legibilityTabText,
  LEGIBILITY_TAB_TEXT_SRC,
} = require('../../../lib/runtime/fluid-view-policy');

// NB: P1's fill-vs-fixed band (fluidDefaultFills) was retired in P2 — the viewer
// now fills every screen and the CSS edge cap (base.fluid-view.css
// `--fill-max-aspect`) handles ultrawide, so there is no JS band decision to test
// anymore. What remains pure + testable is the overflow-marker policy below.

describe('overflowTabText — reader vs author label', () => {
  test('author preview names the defect; the reader gets a calm cue', () => {
    assert.equal(overflowTabText(true), 'Overflows', 'author (authorTags:true)');
    assert.equal(overflowTabText(false), 'Content clipped', 'reader (authorTags:false)');
  });
});

describe('legibilityTabText — one label for two watchers', () => {
  // This string is a CONTRACT, not a detail: the live runtime imports the function and the
  // emulator's inline export watcher injects its SOURCE verbatim, so the preview and the export
  // must name the same measurement the same way (HARD RULE #15). Both are asserted, because a
  // change to the function that forgot the injected copy would otherwise pass.
  test('names the measured size against the floor it missed', () => {
    assert.equal(legibilityTabText({ minPx: 4, floorPx: 5.4 }), 'Type 4px · floor 5.4px');
  });
  test('the injected SOURCE is the same function, not a re-typed copy', () => {
    const injected = new Function(`return (${LEGIBILITY_TAB_TEXT_SRC})`)();
    assert.equal(injected({ minPx: 4, floorPx: 5.4 }), legibilityTabText({ minPx: 4, floorPx: 5.4 }));
  });
});
