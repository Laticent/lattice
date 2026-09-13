/**
 * `kernel.marks` — the two arms that hold a chart member's mark declarations up,
 * and the shapes each one must and must not fire on.
 *
 * WHY THIS FILE EXISTS. The declarations exist because a hand-written table of
 * the same facts was wrong every time anybody measured it: `funnel-band` taken
 * for a text-bearing mark when the labels sit in the left gutter, `cell-filled`
 * carrying no slot so six categories collapsed to one hue. Moving the table into
 * the manifests only helps if something holds it to the code — and a gate with no
 * test is a claim. Both arms below were wrong on their first cut, on real
 * members, and both failures are asserted here:
 *
 *   - the class matcher looked for `class="…"` and found nothing, because a
 *     transform COMPUTES its class list (`const cls = … ? \`bar-mark ${…}\` :
 *     'bar-mark'`) and interpolates it later;
 *   - the search looked only in the member's own transform, and `matrix-grid`
 *     emits no cell at all — the three `cell-*` classes are stamped at
 *     markdown-parse time by `lib/core/matrix-grid-cells.js`.
 *
 * See engineering/decisions/2026-09-07-chart-design-language/mark-declaration.md.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { checkChartMarks } = require('../../../tools/check-ownership.js');
const { loadAll } = require('../../../lib/components');

/** Run the real gate over one synthetic manifest and return its errors. */
function gate(name, marks) {
  const errors = [];
  checkChartMarks(
    [{ name, bucket: 'chart', function: 'evidence', kernel: { figureClass: `${name}-figure`, marks } }],
    errors,
  );
  return errors;
}
const MARK = (cls, over = {}) => ({ class: cls, paint: 'fill', encodes: 'hue', bears: false, ...over });

describe('kernel.marks — the shipped declarations', () => {
  test('every chart member declares at least one mark', () => {
    const charts = loadAll().filter((m) => m.kernel);
    assert.ok(charts.length >= 21, `expected the chart bucket, got ${charts.length} members`);
    for (const m of charts) {
      assert.ok(Array.isArray(m.kernel.marks) && m.kernel.marks.length,
        `${m.name} declares no kernel.marks — a member no finish can reach`);
    }
  });

  test('the whole family passes its own gate', () => {
    const errors = [];
    checkChartMarks(loadAll(), errors);
    assert.deepEqual(errors, []);
  });

  // The datum the finish work turns on, pinned so it cannot drift back: a
  // funnel's stage labels sit in the LEFT GUTTER, outside the band, and 0 of 5
  // bands carry any text. Declaring it text-bearing capped a body that had
  // nothing to protect, and funnel then rendered byte-identical under all three
  // finishes. Measured by geometric overlap, not read.
  test('funnel-band is NOT text-bearing', () => {
    const funnel = loadAll().find((m) => m.name === 'funnel');
    const band = funnel.kernel.marks.find((x) => x.class === 'funnel-band');
    assert.ok(band, 'funnel declares no funnel-band mark');
    assert.equal(band.bears, false);
  });

  // `paint: "none"` is the gate that stops a finish reaching a mark with no body.
  // On a stroked mark the stroke IS the mark: a finish that reached line's series
  // path stepped it to 2.18:1 on light and 1.26:1 on dark.
  test('line declares its series path body-less and its dots painted', () => {
    const line = loadAll().find((m) => m.name === 'line');
    const byClass = new Map(line.kernel.marks.map((x) => [x.class, x]));
    assert.equal(byClass.get('line-path').paint, 'none');
    assert.equal(byClass.get('line-path').encodes, 'none');
    assert.equal(byClass.get('line-dot').paint, 'fill');
  });
});

describe('checkChartMarks — what it fires on', () => {
  test('fires on a class nothing under lib/ writes', () => {
    const errors = gate('bar', [MARK('not-a-real-class')]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /declares the class "not-a-real-class" but nothing under lib\/ writes it/);
  });

  // The first cut matched `class="…"` and reported every real mark in the family
  // as missing, because bar.transform.js builds the list in a variable first.
  test('does NOT fire on a class the transform computes rather than writes inline', () => {
    assert.deepEqual(gate('bar', [MARK('bar-mark')]), []);
  });

  // The second cut searched the member's own transform only. matrix-grid's
  // transform emits no cell; lib/core/matrix-grid-cells.js does.
  test('does NOT fire on a mark emitted by a shared kernel outside the member', () => {
    assert.deepEqual(gate('matrix-grid', [MARK('cell-filled', { paint: 'bg', bears: true })]), []);
  });

  // Whole-token, so a mark row is not satisfied by a longer class that merely
  // contains it: `bar-marks` is the <g> CONTAINER, a different element.
  test('a container class does not satisfy a mark row by prefix', () => {
    const errors = gate('funnel', [MARK('funnel-ban')]);
    assert.equal(errors.length, 1, 'a prefix of funnel-band must not match it');
  });

  // A class named only in a comment is a stale row wearing a citation.
  test('a class mentioned only in a comment does not count as written', () => {
    // `.map-legend` appears in map.styles.css's closing comment block and as a
    // rule nowhere; no transform writes it either.
    assert.equal(gate('map', [MARK('map-legend')]).length, 1);
  });

  test('fires when the transform stamps an encoding the manifest does not declare', () => {
    const errors = gate('bar', [MARK('bar-mark', { encodes: 'presence' })]);
    assert.ok(errors.some((e) => /stamps `data-encodes="hue"`/.test(e)),
      `expected a stamp contradiction, got ${JSON.stringify(errors)}`);
  });

  test('fires when the transform stamps a paint role the manifest does not declare', () => {
    const errors = gate('bar', [MARK('bar-mark', { paint: 'bg' })]);
    assert.ok(errors.some((e) => /stamps `data-paint="fill"`/.test(e)),
      `expected a stamp contradiction, got ${JSON.stringify(errors)}`);
  });

  // scatter stamped one `data-encodes` for two classes that encode differently —
  // a bubble is deliberately translucent so overlapping bubbles deepen where
  // they cross. The manifest disagreeing is what found it.
  test('scatter stamps both hue and layered, and declares both', () => {
    assert.deepEqual(
      gate('scatter', [
        MARK('scatter-dot'),
        MARK('scatter-bubble', { encodes: 'layered' }),
        MARK('scatter-trend', { paint: 'none', encodes: 'none' }),
      ]),
      [],
    );
  });
});
