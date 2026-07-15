/**
 * frame-conformance — the pure conformance CHECK, fixture-verified.
 *
 * The frame-conformance gate (2026-07-15-model-driven-frame-render.md §2) is
 * OPT-IN: a component sets `conformance: "strict"` and the render-side gate
 * asserts its rendered cell tree equals its declared model. PR 1 flipped the
 * first flag — `contact`, the first canvas migration — with the render-side
 * wiring (the masthead strict-wrap) landed in the same change. These tests verify
 * the PURE kernel the gate runs (lib/forms/frame-conformance.js) so its LOGIC is
 * proven independently of any render.
 *
 * They also PIN the opt-in set: it is exactly the migrated components, and any
 * value of the `conformance` field is a known enum. Each subsequent flag flips
 * deliberately here, in the same change that lands its render-side wiring — the
 * field can't go live by accident.
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

  test('the strict set is exactly the migrated components — contact + diagram + wifi', () => {
    // Opt-in, one component (or one same-kernel family) per PR (§2). PR 1
    // migrated the first canvas — `contact` — with the render-side wiring proven
    // byte-identical AND probe-verdict-identical (§5). PR 2 added `wifi`, the
    // sibling QR-card canvas: it needed the depth-aware masthead h2 extraction
    // (findTopLevelH2) so its in-card `.qr-head > h2` is NOT lifted into a
    // masthead band — proven byte-identical + probe-verdict-identical. PR 3 added
    // `diagram`, the first strict VIZ canvas: its Mermaid SVG + Key Insight body
    // hoists into `.cell-stage` (title untouched — its section-level h2 keeps
    // lifting into masthead-lede). No self-size flex pin is needed (unlike the
    // fixed-height QR cards): the Mermaid SVG self-scales (letterboxed to its box),
    // so the stage clip never silently swallows it — the overflow-probe verdict is
    // identical pre/post (fitting → not-over, over-tall Key Insight → over). Simple
    // diagrams are pixel byte-identical; a diagram whose stage ALSO carries extra
    // content (a dek above and/or a Key Insight below) shifts the self-scaled SVG ~2px
    // on the CLI/committed-PDF export path (the standalone Node exporter does not stamp
    // `--_sec-1cqi`, so the stage's cqi-gap resolves ~10% smaller than the section's
    // did), while the web/desktop runtime (which stamps `--_sec-1cqi`) renders
    // byte-identical and the new export value matches runtime — an export delta owed a
    // dark+light sign-off. Extend this list, with rationale, as
    // each subsequent flag flips; a flip WITHOUT the render wiring landing in the
    // same change would leave the render gate red.
    const EXPECTED_STRICT = ['contact', 'diagram', 'wifi'];
    assert.deepEqual(
      strict.map((m) => m.name).sort(),
      EXPECTED_STRICT,
      `conformance:strict set drifted from ${JSON.stringify(EXPECTED_STRICT)}. ` +
        'Flipping a flag requires the render-side conformance wiring (the masthead strict-wrap + ' +
        'the render gate) landed in the same change.',
    );
  });

  test('CELL_DOM_CLASS covers the three structural bands', () => {
    assert.equal(CELL_DOM_CLASS.stage, 'cell-stage');
    assert.equal(CELL_DOM_CLASS.masthead, 'cell-masthead');
    assert.equal(CELL_DOM_CLASS.footer, 'cell-footer');
  });
});
