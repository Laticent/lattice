// The HTML key — the sibling of svg-legend.js for components that draw in a
// <table> rather than a viewBox.
//
// Two arms carry weight. The FIRST pins the markup against roadmap's own
// hand-rolled builder: that byte-for-byte match is what makes porting roadmap
// onto this kernel a change a reviewer can check against a committed PDF
// instead of taking on trust. The SECOND pins escaping, which is genuinely new
// — every caller's labels used to be hard-coded constants, and a label set
// turns them into author text flowing straight into the section.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { buildHtmlLegend } = require('../../../lib/core/html-legend');
const { STATE_LABEL } = require('../../../lib/components/chart/roadmap/roadmap.transform');

const STATE_ORDER = ['state-shipped', 'state-wip', 'state-planned', 'state-skipped'];

describe('the markup contract', () => {
  test("reproduces roadmap's own builder byte for byte", () => {
    // Transcribed from buildStatusLegend as it stood before the port. If this
    // arm goes red, the port is no longer a no-op and the committed roadmap
    // galleries have to be re-reviewed, not just re-rendered.
    const expected = '<ul class="roadmap-legend" aria-label="Status key">'
      + STATE_ORDER.map((s) => `<li class="roadmap-legend-item ${s}">`
        + '<span class="roadmap-legend-mark" aria-hidden="true"></span>'
        + `<span class="roadmap-legend-label">${STATE_LABEL[s]}</span>`
        + '</li>').join('')
      + '</ul>';

    assert.equal(buildHtmlLegend({
      listClass: 'roadmap-legend',
      itemClass: 'roadmap-legend-item',
      markClass: 'roadmap-legend-mark',
      labelClass: 'roadmap-legend-label',
      ariaLabel: 'Status key',
      rows: STATE_ORDER.map((s) => ({ stateClass: s, label: STATE_LABEL[s] })),
    }), expected);
  });

  test('no rows means no key at all, not an empty list', () => {
    // "A plain roadmap with no markers needs no key" — the behavior
    // label-set.js names as one of the three worth keeping. An empty <ul> is
    // chrome with no content, and it would still take its padding.
    assert.equal(buildHtmlLegend({ listClass: 'roadmap-legend', rows: [] }), '');
    assert.equal(buildHtmlLegend({ listClass: 'roadmap-legend', rows: null }), '');
  });

  test('a row with no label is dropped rather than rendering an empty chip', () => {
    // A member whose manifest omits `label` has it derived at render time. If a
    // component forgets to derive one, the honest outcome is a missing row, not
    // a swatch beside a blank.
    assert.equal(buildHtmlLegend({ listClass: 'x-legend', rows: [{ stateClass: 's' }] }), '');
  });

  test('carries a detail as a title, not a second visible line', () => {
    const out = buildHtmlLegend({
      listClass: 'x-legend', itemClass: 'x-legend-item',
      markClass: 'x-legend-mark', labelClass: 'x-legend-label',
      rows: [{ stateClass: 's', label: 'Applies', detail: 'The regime reaches this obligation.' }],
    });
    assert.match(out, / title="The regime reaches this obligation\."/);
    // One visible span per chip — a second line is what pushes a wide key onto
    // two rows under a figure that is already the tallest thing on the slide.
    assert.equal((out.match(/x-legend-label/g) || []).length, 1);
  });

  test('ol when the order is meaningful, ul otherwise', () => {
    assert.match(buildHtmlLegend({ listClass: 'x-legend', rows: [{ label: 'A' }], tag: 'ol' }), /^<ol /);
    assert.match(buildHtmlLegend({ listClass: 'x-legend', rows: [{ label: 'A' }] }), /^<ul /);
    // An unknown tag falls back to ul rather than emitting <script> or similar.
    assert.match(buildHtmlLegend({ listClass: 'x-legend', rows: [{ label: 'A' }], tag: 'script' }), /^<ul /);
  });
});

describe('escaping — new, because labels are now author text', () => {
  test('a label carrying markup lands as text, not as live elements', () => {
    const out = buildHtmlLegend({
      listClass: 'x-legend', itemClass: 'x-legend-item',
      markClass: 'x-legend-mark', labelClass: 'x-legend-label',
      rows: [{ stateClass: 's', label: '<img src=x onerror=alert(1)>' }],
    });
    assert.ok(!out.includes('<img'), 'the img tag must not survive as markup');
    assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  test('a quote in a detail cannot break out of the title attribute', () => {
    const out = buildHtmlLegend({
      listClass: 'x-legend', itemClass: 'x-legend-item',
      markClass: 'x-legend-mark', labelClass: 'x-legend-label',
      rows: [{ label: 'A', detail: 'say "no" onmouseover=alert(1)' }],
    });
    // The quote is escaped, so the attribute still ends where it should and the
    // trailing text cannot become another attribute.
    assert.ok(!/title="say "no"/.test(out));
    assert.match(out, /&quot;no&quot;/);
  });

  test('the prefix and the state class are escaped too', () => {
    // Neither is author text today, but both are interpolated into a class
    // attribute, and "not author text today" is exactly the assumption that
    // stops being true when a component grows a variant.
    const out = buildHtmlLegend({ listClass: 'x"><b', rows: [{ stateClass: 'y"><i', label: 'A' }] });
    assert.ok(!out.includes('<b'), 'the list class must not break out of the class attribute');
    assert.ok(!out.includes('<i'), 'the state class must not break out of the class attribute');
  });
});
