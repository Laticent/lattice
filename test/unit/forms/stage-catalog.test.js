/**
 * Drift test for the stage-cell classification (step A,
 * engineering/decisions/2026-07-14-one-frame-model.md).
 *
 * The masthead kernel used to carry three HAND-MAINTAINED Sets
 * (STAGE_MIGRATED / STAGE_DEFERRED inline, plus the sovereign FORM_TOGGLE_SKIP
 * in plugins.js). Those are now DERIVED from a single generated catalog
 * (lib/forms/cell/masthead/stage-catalog.generated.js), composed from each
 * component manifest's `stage: "flow" | "canvas"` field + the sovereign frames'
 * `exemptFromChrome`.
 *
 * This test PINS the exact historical membership so the refactor is provably
 * behavior-preserving, AND so a future `stage` edit that reclassifies a
 * component is a DELIBERATE, reviewed change (update the frozen list below with
 * the rationale) rather than a silent one — exactly the discipline the inline
 * Sets used to enforce by being hand-edited.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const kernel = require('../../../lib/forms/cell/masthead/masthead.transform.js');
const catalog = require('../../../lib/forms/cell/masthead/stage-catalog.generated.js');
const conformanceCatalog = require('../../../lib/forms/cell/masthead/conformance-catalog.generated.js');
const { frameToggleSkip } = require('../../../lib/forms');
const { loadAll } = require('../../../lib/components');

// The classification as it stood when the three inline Sets were retired
// (2026-07-14). A change here must be intentional and reviewed.
const EXPECTED_FLOW = [
  'actors', 'agenda', 'authority-chain', 'big-number', 'cards-grid', 'cards-stack',
  'checklist', 'citation-card', 'code', 'compare-prose', 'compare-table', 'content', 'cycle',
  'decision', 'glossary', 'inventory', 'kpi', 'list', 'list-criteria', 'list-steps',
  'list-tabular', 'logo-wall', 'matrix-2x2', 'obligation-matrix', 'policy-recommendation', 'pricing', 'q-and-a',
  'quote', 'redline', 'regulatory-update', 'stats', 'statute-stack', 'team-profile', 'verdict-grid',
].sort();
const EXPECTED_CANVAS = [
  // `math` joined this list in 2026-09, moving from EXPECTED_SOVEREIGN below — the only
  // component ever to change partition. Its stage is a `canvas` (a self-sizing body: a
  // typeset equation does not reflow) and it is `conformance: "strict"`, so the masthead
  // kernel materializes its declared `.cell-stage` rather than letting it hand-draw one.
  'math',
  'contact', 'diagram', 'bar', 'bullet', 'funnel', 'line', 'scatter', 'slope', 'stacked-bar', 'waterfall', 'gantt', 'journey', 'kanban', 'map', 'matrix-grid', 'piechart',
  'progress', 'quadrant', 'radar', 'roadmap', 'state-chart', 'timeline-list',
  'video', 'wifi', 'word-cloud',
].sort();
const EXPECTED_SOVEREIGN = [
  // `math` was here until 2026-09. Its claim on a sovereign frame was "drives its own
  // `> h2` title grid" — a heading-placement preference, not the "this slide has no room
  // for chrome" the rest of this list rests on. `compare-code` is the last entry making
  // the same weak claim.
  'closing', 'compare-code', 'divider', 'image', 'premise', 'scene', 'split-compare',
  'split-panel', 'title',
].sort();

const withStage = (s) => Object.keys(catalog).filter((n) => catalog[n] === s).sort();

describe('stage-catalog — the single stage-cell classification', () => {
  test('reproduces the historical flow / canvas / sovereign partition EXACTLY', () => {
    assert.deepEqual(withStage('flow'), EXPECTED_FLOW, 'flow (→ .cell-stage wrap) membership drifted');
    assert.deepEqual(withStage('canvas'), EXPECTED_CANVAS, 'canvas (self-sizing body) membership drifted');
    assert.deepEqual(withStage('sovereign'), EXPECTED_SOVEREIGN, 'sovereign (chrome-exempt) membership drifted');
  });

  test('the derived kernel Sets equal the catalog partition', () => {
    assert.deepEqual([...kernel.STAGE_MIGRATED].sort(), EXPECTED_FLOW, 'STAGE_MIGRATED != flow');
    assert.deepEqual([...kernel.STAGE_DEFERRED].sort(), EXPECTED_CANVAS, 'STAGE_DEFERRED != canvas');
    assert.deepEqual([...kernel.ALL_LAYOUTS].sort(),
      [...EXPECTED_FLOW, ...EXPECTED_CANVAS, ...EXPECTED_SOVEREIGN].sort(),
      'ALL_LAYOUTS != flow ⊎ canvas ⊎ sovereign');
  });

  test('the catalog sovereign set equals the frame-manifest-derived FORM_TOGGLE_SKIP', () => {
    // The two data sources (component `stage` field + frame `exemptFromChrome`)
    // must agree on who is sovereign — the generator composes them, this pins it.
    assert.deepEqual(withStage('sovereign'), [...frameToggleSkip()].sort(),
      'catalog sovereign set diverged from frameToggleSkip()');
  });

  // The sibling conformance catalog (build-stage-catalog.js also generates it) —
  // the sorted names of every manifest with `conformance:"strict"`, baked so the
  // masthead kernel can wrap a strict CANVAS without fs-loading manifests. Pinned
  // like the stage catalog so a flag flip is a deliberate, reviewed change.
  test('conformance-catalog is the sorted set of conformance:"strict" manifests', () => {
    // contact (PR 1), wifi (PR 2), diagram (PR 3 — the first strict VIZ canvas)
    // are the strict canvas migrations; the rest opt in one component per PR.
    // Update this list — with rationale — as each flag flips.
    //
    // math (PR 4) is the first to reach `strict` by LEAVING a sovereign frame rather
    // than by opting an existing canvas in. Eight variants moved onto the shared Form
    // frame one commit at a time, each with rendered evidence at all five registered
    // sizes; the sovereign arms and `lib/forms/frame/math/` are deleted, so there is no
    // second shape left for the flag to disagree with.
    const EXPECTED_STRICT = ['contact', 'diagram', 'math', 'wifi'];
    assert.deepEqual([...conformanceCatalog].sort(), EXPECTED_STRICT, 'conformance-catalog drifted from EXPECTED_STRICT');
    // The baked array must equal the manifest source of truth.
    const fromManifests = loadAll().filter((m) => m.conformance === 'strict').map((m) => m.name).sort();
    assert.deepEqual([...conformanceCatalog].sort(), fromManifests, 'conformance-catalog diverged from the manifests');
    // A strict component wraps its stage cell even as a canvas; a non-strict
    // canvas still does not (the wrap decision the kernel reads).
    assert.equal(kernel.wrapsStageBody('contact form'), true, 'strict canvas contact must wrap');
    assert.equal(kernel.wrapsStageBody('wifi form'), true, 'strict canvas wifi must wrap');
    assert.equal(kernel.wrapsStageBody('diagram form'), true, 'strict canvas diagram must wrap');
    assert.equal(kernel.wrapsStageBody('video form'), false, 'non-strict canvas video must NOT wrap');
  });

  test('stageSizingFor is the single classifier the wrap decision reads', () => {
    assert.equal(kernel.stageSizingFor('cards-grid'), 'flow');
    assert.equal(kernel.stageSizingFor('funnel'), 'canvas');
    assert.equal(kernel.stageSizingFor('title'), 'sovereign');
    assert.equal(kernel.stageSizingFor('not-a-layout'), null);
    // wrapsStageBody wraps flow + generic prose, never canvas / sovereign.
    assert.equal(kernel.wrapsStageBody('cards-grid form'), true);
    assert.equal(kernel.wrapsStageBody('form'), true);
    assert.equal(kernel.wrapsStageBody('funnel form'), false);
    assert.equal(kernel.wrapsStageBody('split-panel'), false);
  });
});
