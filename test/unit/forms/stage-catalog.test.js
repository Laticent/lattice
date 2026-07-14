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
const { frameToggleSkip } = require('../../../lib/forms');

// The classification as it stood when the three inline Sets were retired
// (2026-07-14). A change here must be intentional and reviewed.
const EXPECTED_FLOW = [
  'actors', 'agenda', 'authority-chain', 'big-number', 'cards-grid', 'cards-stack',
  'checklist', 'citation-card', 'code', 'compare-prose', 'compare-table', 'content',
  'decision', 'glossary', 'inventory', 'kpi', 'list', 'list-criteria', 'list-steps',
  'list-tabular', 'logo-wall', 'matrix-2x2', 'obligation-matrix', 'pricing', 'q-and-a',
  'quote', 'redline', 'regulatory-update', 'stats', 'statute-stack', 'verdict-grid',
].sort();
const EXPECTED_CANVAS = [
  'contact', 'diagram', 'funnel', 'gantt', 'journey', 'kanban', 'map', 'piechart',
  'progress', 'quadrant', 'radar', 'roadmap', 'state-chart', 'timeline-list', 'video',
  'wifi', 'word-cloud',
].sort();
const EXPECTED_SOVEREIGN = [
  'closing', 'compare-code', 'divider', 'image', 'math', 'split-compare',
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
