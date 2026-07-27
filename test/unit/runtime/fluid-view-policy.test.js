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
  legibilityTabText,
  legibilityTabAction,
  LEGIBILITY_TAB_TEXT_SRC,
  LEGIBILITY_TAB_ACTION_SRC,
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

describe('legibilityTabAction — same shape as the overflow tab, plus a live re-read', () => {
  // The type-floor tab carries NUMBERS ("Type 4px · floor 5.4px"), so unlike the overflow tab it
  // has a fourth state: present, still under the floor, but showing a stale measurement. Without
  // 'update' the reading freezes at whatever it was when the tab was created — which on a live
  // preview is exactly when the author is resizing the figure to fix it.
  test('adds when under the floor with no tab', () => {
    assert.equal(legibilityTabAction({ under: true, hasTab: false }), 'add');
  });
  test('UPDATES an existing tab so its px reading never goes stale', () => {
    assert.equal(legibilityTabAction({ under: true, hasTab: true }), 'update');
  });
  test('removes a stale tab once the figure clears the floor', () => {
    assert.equal(legibilityTabAction({ under: false, hasTab: true }), 'remove');
  });
  test('does nothing when already in the right state (the watcher settles)', () => {
    assert.equal(legibilityTabAction({ under: false, hasTab: false }), 'none');
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
    const injectedAction = new Function(`return (${LEGIBILITY_TAB_ACTION_SRC})`)();
    for (const under of [true, false]) {
      for (const hasTab of [true, false]) {
        assert.equal(injectedAction({ under, hasTab }), legibilityTabAction({ under, hasTab }),
          `under=${under} hasTab=${hasTab}`);
      }
    }
  });
});
