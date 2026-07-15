/**
 * frame-conformance — the pure conformance CHECK, fixture-verified.
 *
 * The frame-conformance gate (2026-07-15-model-driven-frame-render.md §2) is
 * OPT-IN: a component sets `conformance: "strict"` and the render-side gate
 * asserts its rendered cell tree equals its declared model. Today ZERO
 * components opt in, so the render-side enumeration is dormant (empty → green).
 * These tests verify the PURE kernel it runs (lib/forms/frame-conformance.js) so
 * the gate's LOGIC is proven now — before the first flag flips (diagram, PR 1) —
 * rather than shipping unverified.
 *
 * They also PIN the dormant state: no manifest is `strict` yet, and any value of
 * the `conformance` field is a known enum. When PR 1 flips the first flag it
 * updates the count here deliberately, in the same change that lands the
 * render-side wiring — the field can't go live by accident.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CELL_DOM_CLASS,
  materializingCells,
  hasClass,
  conformanceViolations,
} = require('../../../lib/forms/frame-conformance');

const ROOT = path.join(__dirname, '..', '..', '..');

describe('frame-conformance · hasClass token match', () => {
  test('matches a class as a whitespace-delimited token, not a substring', () => {
    assert.ok(hasClass('<div class="cell-stage">', 'cell-stage'));
    assert.ok(hasClass('<div class="a cell-stage b">', 'cell-stage'));
    assert.ok(hasClass('<div class="lead cell-stage">', 'cell-stage'));
    assert.ok(hasClass('<div class="cell-stage lead">', 'cell-stage'));
    // Substring false-positives must NOT match.
    assert.ok(!hasClass('<div class="cell-stage-inner">', 'cell-stage'));
    assert.ok(!hasClass('<div class="not-cell-stage">', 'cell-stage'));
    assert.ok(!hasClass('<div class="cell-masthead">', 'cell-stage'));
  });

  test('a non-class attribute ending in "class" must NOT satisfy the match', () => {
    // Guards against the unanchored `class="…"` false positive: an element that
    // carries the token only in data-class / data-cell-class does NOT count.
    assert.ok(!hasClass('<div data-class="cell-stage">', 'cell-stage'));
    assert.ok(!hasClass('<figure data-cell-class="cell-stage">', 'cell-stage'));
    // A real class attribute alongside a decoy data-* attribute still matches.
    assert.ok(hasClass('<div data-x="cell-stage" class="cell-stage">', 'cell-stage'));
  });

  test('a regex metachar in the class name is matched literally, not as a pattern', () => {
    assert.ok(hasClass('<div class="c.ll-stage">', 'c.ll-stage'));
    assert.ok(!hasClass('<div class="cXll-stage">', 'c.ll-stage'));
  });
});

describe('frame-conformance · materializingCells', () => {
  test('declared minus suppressed minus non-materializing', () => {
    const frame = {
      cells: ['masthead', 'stage', 'footer', 'overlay', 'progress-centre'],
      suppresses: ['progress-centre'],
    };
    // progress-centre suppressed; overlay is non-materializing (css:false).
    assert.deepEqual(materializingCells(frame), ['masthead', 'stage', 'footer']);
  });

  test('tolerates a frame with no cells / no suppresses', () => {
    assert.deepEqual(materializingCells({}), []);
    assert.deepEqual(materializingCells({ cells: ['stage'] }), ['stage']);
  });
});

describe('frame-conformance · conformanceViolations (the pure gate)', () => {
  const CONFORMING = '<section class="form"><div class="cell-masthead"></div><div class="cell-stage"></div><div class="cell-footer"></div></section>';

  test('a slide that materializes every declared cell → NO violations', () => {
    const v = conformanceViolations({
      component: 'fixture',
      expectedCells: ['masthead', 'stage', 'footer'],
      slideHtml: CONFORMING,
    });
    assert.deepEqual(v, []);
  });

  test('a declared cell NOT in the rendered DOM → a violation naming it', () => {
    const missingStage = '<section class="form"><div class="cell-masthead"></div><div class="cell-footer"></div></section>';
    const v = conformanceViolations({
      component: 'fixture',
      expectedCells: ['masthead', 'stage', 'footer'],
      slideHtml: missingStage,
    });
    assert.equal(v.length, 1);
    assert.match(v[0], /declared Cell "stage"/);
    assert.match(v[0], /not materialized/i);
  });

  test('a declared cell with no DOM-class mapping → a loud "add a mapping" violation', () => {
    const v = conformanceViolations({
      component: 'fixture',
      expectedCells: ['stage', 'masthead-lede'], // masthead-lede is not in CELL_DOM_CLASS yet
      slideHtml: CONFORMING,
    });
    assert.equal(v.length, 1);
    assert.match(v[0], /Cell "masthead-lede"/);
    assert.match(v[0], /no DOM-class mapping/);
  });

  test('a cell id colliding with a prototype key reads as "no mapping", not a function', () => {
    // `constructor` is truthy on any plain object's prototype; the own-property
    // guard must treat it as unmapped (a loud "add a mapping"), not a class.
    const v = conformanceViolations({
      component: 'fixture',
      expectedCells: ['constructor'],
      slideHtml: CONFORMING,
      cellClassOf: {},
    });
    assert.equal(v.length, 1);
    assert.match(v[0], /no DOM-class mapping/);
  });

  test('substring look-alike class does NOT satisfy a declared cell', () => {
    const decoy = '<section class="form"><div class="cell-stage-inner"></div></section>';
    const v = conformanceViolations({
      component: 'fixture',
      expectedCells: ['stage'],
      slideHtml: decoy,
    });
    assert.equal(v.length, 1);
    assert.match(v[0], /declared Cell "stage"/);
  });
});

/** Walk every component manifest on disk (the same source the real gate reads). */
function allManifests() {
  const out = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.manifest.json')) out.push(JSON.parse(fs.readFileSync(p, 'utf8')));
    }
  })(path.join(ROOT, 'lib', 'components'));
  return out;
}

describe('frame-conformance · opt-in state (pins the dormant gate)', () => {
  const manifests = allManifests();
  const strict = manifests.filter((m) => m.conformance === 'strict');

  test('every conformance value is the known enum "strict"', () => {
    for (const m of manifests) {
      if (m.conformance !== undefined) {
        assert.equal(m.conformance, 'strict', `${m.name}: conformance must be "strict" or omitted`);
      }
    }
  });

  test('ZERO components are strict yet — the render-side gate is dormant (PR 0). PR 1 (diagram) flips the first flag and updates this count with the render wiring.', () => {
    assert.equal(
      strict.length,
      0,
      `Unexpected conformance:strict component(s): ${strict.map((m) => m.name).join(', ')}. ` +
        'Flipping the flag requires the render-side conformance wiring (PR 1) landed in the same change.',
    );
  });

  test('CELL_DOM_CLASS covers the three structural bands', () => {
    assert.equal(CELL_DOM_CLASS.stage, 'cell-stage');
    assert.equal(CELL_DOM_CLASS.masthead, 'cell-masthead');
    assert.equal(CELL_DOM_CLASS.footer, 'cell-footer');
  });
});
