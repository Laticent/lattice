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
  legibilityTabHint,
  LEGIBILITY_TAB_TEXT_SRC,
  LEGIBILITY_TAB_HINT_SRC,
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
  const leg = { minPx: 4, floorPx: 5.4, minPt: 3, floorPt: 5.4 };

  test('states the condition in words, then the size', () => {
    assert.equal(legibilityTabText(leg), 'Text too small · 3pt');
  });

  // The regression this change exists for. The old label was `Type 4px · floor 5.4px`: two
  // numbers, no verb, no subject, and a unit that moves with the preset — unreadable to the
  // person who wrote the rule, let alone to an author meeting it for the first time. These
  // three arms pin the properties that fixed it, so a future edit that quietly reverts any one
  // of them fails here rather than shipping.
  test('reads in PLAIN WORDS — no bare measurement, no house jargon', () => {
    const text = legibilityTabText(leg);
    assert.match(text, /^Text too small/, 'leads with the condition, like "Content clipped" beside it');
    assert.doesNotMatch(text, /floor/i, '"floor" is the rule\'s word, not the author\'s — it belongs in the hint');
    assert.doesNotMatch(text, /\bpx\b/, 'px moves with the preset; the label reports the invariant unit');
  });

  test('reports POINTS, and takes them from the probe rather than converting px itself', () => {
    // A label that re-derived pt from `minPx` would need the slide height it does not have,
    // and would drift from the probe's rounding. It must read `minPt` straight through.
    assert.equal(legibilityTabText({ ...leg, minPt: 4.9 }), 'Text too small · 4.9pt');
    assert.equal(legibilityTabText({ ...leg, minPx: 999 }), 'Text too small · 3pt', 'minPx is not consulted');
  });

  test('the injected SOURCE is the same function, not a re-typed copy', () => {
    const injected = new Function(`return (${LEGIBILITY_TAB_TEXT_SRC})`)();
    assert.equal(injected(leg), legibilityTabText(leg));
  });
});

describe('legibilityTabHint — the fix the label has no room for', () => {
  const leg = { minPx: 4, floorPx: 5.4, minPt: 3, floorPt: 5.4 };

  test('names both sizes and what to do about them', () => {
    const hint = legibilityTabHint(leg);
    assert.match(hint, /3pt/, 'the measured size');
    assert.match(hint, /5\.4pt/, 'the minimum it missed — dropped from the label, so the hint owes it');
    assert.match(hint, /Simplify the figure|bigger box/, 'and the action, which is the half a number cannot give');
  });

  test('is written in the author\'s vocabulary, not the check\'s', () => {
    assert.doesNotMatch(legibilityTabHint(leg), /floor/i,
      '"minimum", not "floor" — a hint phrased in the rule\'s own jargon is the defect being repaired');
  });

  // Brief is a requirement here, not a preference: this is a native `title` on a corner tab,
  // and a tooltip long enough to need reading twice is one an author dismisses. Two sentences.
  test('stays brief enough to read at a glance', () => {
    const hint = legibilityTabHint(leg);
    assert.ok(hint.length <= 160, `hint is ${hint.length} chars; keep it under 160`);
    assert.equal(hint.split('. ').length, 2, 'two sentences: what was measured, then what to change');
  });

  test('the injected SOURCE is the same function, not a re-typed copy', () => {
    const injected = new Function(`return (${LEGIBILITY_TAB_HINT_SRC})`)();
    assert.equal(injected(leg), legibilityTabHint(leg));
  });
});
