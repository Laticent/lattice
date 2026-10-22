/**
 * Unit: the legend model, its Segno reader and the HTML emitter (lib/core/legend.js), and the mark
 * slot (lib/core/legend-mark.js). Design: engineering/decisions/2026-10-19-universal-legend.md.
 *
 * The diagnostics carry a code and facts, not prose (the runtime bundles the reader); the words are
 * lib/authoring/legend-messages.js, checked here once per code.
 *
 * The reader cases are the spike-2 table of § 13, re-run against the shipped slots: an entry first,
 * a keyed pair only on the entry slot's refusal, and the one silent shape (`{1, lg}`) reported.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { readLegend, readEntry, gridTarget, targetText, CALLOUT_READERS, spanKind, calloutsOff } = require('../../../lib/core/legend');
const { legendHtml } = require('../../../lib/core/legend-html');
const { colorAttr } = require('../../../lib/core/legend-key');
const { MARKS, markHtml, markSvg } = require('../../../lib/core/legend-mark');
const { legendMessage } = require('../../../lib/authoring/legend-messages');
const { LEGEND_MARKS, PLATE_SHAPES, CORE } = require('../../../lib/core/segno-slots');

describe('readEntry: entry first, keyed pair on refusal (§ 13 spike 2)', () => {
  const cases = [
    ['{Cold, c1}', { text: 'Cold', color: 1 }],
    ['{LIVE, tag, c4}', { text: 'LIVE', plate: 'tag', color: 4 }],
    ['{Dip, row="Feb 2026", col=M2}', { text: 'Dip', for: { row: 'Feb 2026', col: 'M2' } }],
    ['{Dip, col=M2, for=3}', { text: 'Dip', for: '3' }],
    ['{1, Cold}', { key: '1', text: 'Cold' }],
    ['{"=>", Happy path}', { key: '=>', text: 'Happy path' }],
    ['{dashed, Sent back}', { key: 'dashed', text: 'Sent back' }],
    ['{1, Cold, detail="Under 20, maybe"}', { key: '1', text: 'Cold', detail: 'Under 20, maybe' }],
    ['{1, Cold, c2}', { key: '1', text: 'Cold', color: 2 }],
    ['{1, "tag"}', { key: '1', text: 'tag' }],
    ['{1, tag}', { text: '1', plate: 'tag' }],
    ['{Peak, mark=dashed, for=14}', { text: 'Peak', mark: 'dashed', for: '14' }],
  ];
  for (const [src, want] of cases) {
    test(src, () => {
      const r = readEntry(src);
      assert.equal(r.ok, true);
      assert.deepEqual(r.entry, want);
    });
  }
  test('a record neither slot reads is refused with the entry slot\'s reason', () => {
    const r = readEntry('{a, b, c}');
    assert.equal(r.ok, false);
    assert.match(legendMessage(r.diagnostics[0]), /legend entry/);
  });
});

describe('readLegend', () => {
  test('one entry record with for= is anchored', () => {
    const r = readLegend('@legend{{Month 2 drop-off, tag, c4, for=14}}');
    assert.equal(r.ok, true);
    assert.equal(r.legend.layout, 'anchored');
    assert.deepEqual(r.legend.entries, [{ text: 'Month 2 drop-off', plate: 'tag', color: 4, for: '14' }]);
  });
  test('a list without for= is a key, and an explicit layout word wins', () => {
    assert.equal(readLegend('@legend{[{Poor, c1}, {Good, c3}]}').legend.layout, 'key');
    assert.equal(readLegend('@legend{[{Poor, c1}], layout=key}').legend.layout, 'key');
    assert.equal(readLegend('@legend{[{Poor, for=1}], key}').legend.layout, 'key');
  });
  test('the record works without the @legend prefix too', () => {
    assert.equal(readLegend('{[{1, Cold}, {3, Warm}]}').legend.entries.length, 2);
  });
  test('a quoted for= keeps its middle dot and spaces', () => {
    assert.equal(readLegend('@legend{{Dip, for="Feb 2026 · M2"}}').legend.entries[0].for, 'Feb 2026 · M2');
  });
  test('`{1, lg}` reads as a styled label and says so', () => {
    const r = readLegend('@legend{{1, lg}}');
    assert.equal(r.ok, true);
    assert.equal(r.diagnostics[0].code, 'legend/ambiguous-pair');
  });
  test('`{Poor, c1}` is the taught form and is NOT flagged', () => {
    assert.deepEqual(readLegend('@legend{{Poor, c1}}').diagnostics, []);
  });
  test('an anchored label with no for= is flagged', () => {
    assert.equal(readLegend('@legend{{Peak}, anchored}').diagnostics[0].code, 'legend/no-target');
  });
  test('an unknown layout word and a non-record item are reported', () => {
    assert.equal(readLegend('@legend{{A}, layout=sideways}').diagnostics[0].code, 'legend/layout');
    const r = readLegend('@legend{x}');
    assert.equal(r.ok, false);
    assert.deepEqual(r.diagnostics.map((d) => d.code), ['legend/item', 'legend/empty']);
  });
  test('a span that is not a record is a syntax diagnostic, never a throw', () => {
    for (const bad of ['@legend{', '@legend{{a}', '', null]) assert.equal(readLegend(bad).ok, false);
  });
});

describe('the split: @callout is a callout, @legend is the key (2026-10-20-callout-placement.md § 2)', () => {
  test('spanKind names the prefix the author wrote, and nothing else', () => {
    assert.equal(spanKind('@callout{{A, for=1}}'), 'callout');
    assert.equal(spanKind(' @legend{[{A, c1}], key}'), 'legend');
    assert.equal(spanKind('@legends{x}'), null);
    assert.equal(spanKind('{A}'), null);
    assert.equal(spanKind(null), null);
  });
  test('a @callout span is always anchored, with or without a target, and carries its kind', () => {
    const r = readLegend('@callout{{Dip, row=Feb, col=M2}}');
    assert.equal(r.legend.layout, 'anchored');
    assert.equal(r.kind, 'callout');
    assert.equal(readLegend('@callout{[{A}, {B}]}').legend.layout, 'anchored');
    assert.equal(readLegend('@callout{[{A}]}').diagnostics[0].code, 'legend/no-target');
  });
  test('a layout word in a @callout span is ignored by the reader; lint:deck reports it', () => {
    const r = readLegend('@callout{{A, for=1}, key}');
    assert.equal(r.legend.layout, 'anchored');
    assert.deepEqual(r.diagnostics, []);
  });

  test('a pinned @legend span still reads as a callout: the pre-split spelling', () => {
    const r = readLegend('@legend{{Dip, row=Feb, col=M2}}');
    assert.equal(r.legend.layout, 'anchored');
    assert.equal(r.kind, 'legend');
  });
  test('callouts are off by the callout switches, and the pre-split legend ones are not read', () => {
    assert.equal(calloutsOff(), false);
    assert.equal(calloutsOff({ tokens: ['callout-off'] }), true);
    assert.equal(calloutsOff({ pluginsOff: ['callout'] }), true);
    assert.equal(calloutsOff({ pluginsOff: ['math'] }), false);
    assert.equal(calloutsOff({ frontMatter: 'callout: off' }), true);
    assert.equal(calloutsOff({ frontMatter: 'callout: on' }), false);
    assert.equal(calloutsOff({ tokens: ['callout-on'], frontMatter: 'callout: off' }), false);
    // Dropped with the owner's ruling (decision note § 2): the pre-split switches do nothing now.
    assert.equal(calloutsOff({ tokens: ['legend-off'] }), false);
    assert.equal(calloutsOff({ frontMatter: 'legend: off' }), false);
    assert.equal(calloutsOff({ pluginsOff: ['legend'] }), false);
  });

});

describe('gridTarget: a label\'s target on a grid', () => {
  const rows = ['Jan 2026', 'Feb 2026'];
  const cols = ['M0', 'M1', 'M2'];
  test('row= and col= name a cell by its labels, case- and space-insensitive', () => {
    assert.equal(gridTarget({ row: 'Feb 2026', col: 'M2' }, rows, cols), 5);
    assert.equal(gridTarget({ row: 'jan  2026', col: 'm1' }, rows, cols), 1);
  });
  test('a pair missing a half, or naming a label that is not there, is -1', () => {
    assert.equal(gridTarget({ row: 'Feb 2026' }, rows, cols), -1);
    assert.equal(gridTarget({ col: 'M2' }, rows, cols), -1);
    assert.equal(gridTarget({ row: 'Mar 2026', col: 'M2' }, rows, cols), -1);
  });
  test('a row or column whose label holds / or · is named whole by row= and col=', () => {
    assert.equal(gridTarget({ row: 'A/B', col: 'x · y' }, ['A/B'], ['x · y']), 0);
  });
  test('targetText writes the target back as the author did', () => {
    assert.equal(targetText({ row: 'Feb 2026', col: 'M2' }), 'row=Feb 2026, col=M2');
    assert.equal(targetText({ row: 'Feb 2026' }), 'row=Feb 2026');
    assert.equal(targetText('14'), 'for=14');
    assert.equal(targetText(undefined), 'for=nothing');
  });
  test('an index, row-major, as data-mark counts it', () => {
    assert.equal(gridTarget('5', rows, cols), 5);
    assert.equal(gridTarget('6', rows, cols), -1);
  });
  test('a Row · Column name, case- and space-insensitive, or with /', () => {
    assert.equal(gridTarget('Feb 2026 · M2', rows, cols), 5);
    assert.equal(gridTarget('feb  2026/m1', rows, cols), 4);
  });
  test('a name that matches nothing is -1', () => {
    assert.equal(gridTarget('Mar 2026 · M0', rows, cols), -1);
    assert.equal(gridTarget('M0', rows, cols), -1);
  });
});

describe('legendHtml: the key layout', () => {
  test('a list, one row per label, mark then text', () => {
    const html = legendHtml(readLegend('@legend{[{Poor, c1, mark=swatch}, {Good, c3, mark=swatch}], key}').legend);
    assert.match(html, /^<ul class="legend legend--key" aria-label="Key">/);
    assert.equal((html.match(/<li class="legend-label">/g) || []).length, 2);
    assert.match(html, /<span class="legend-mark legend-mark--swatch" data-c="c1" aria-hidden="true"><\/span><span class="legend-text">Poor<\/span>/);
  });
  test('beside a mark the words stay body ink; a bare colored label carries the color itself', () => {
    const html = legendHtml(readLegend('@legend{[{A, c2}, {B, c2, mark=line}], key}').legend);
    assert.match(html, /<span class="legend-text" data-c="c2">A<\/span>/);
    assert.match(html, /<span class="legend-text">B<\/span>/);
  });
  test('a plate is the pill\'s own markup', () => {
    const html = legendHtml(readLegend('@legend{[{LIVE, tag, c4, lg}], key}').legend);
    assert.match(html, /<span class="legend-text lat-pill" data-shape="tag" data-c="c4" data-size="lg">LIVE<\/span>/);
  });
  test('author text and detail are escaped', () => {
    const html = legendHtml({ entries: [{ text: '<img src=x onerror=alert(1)>', detail: '"x" & <y>' }] });
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /title="&quot;x&quot; &amp; &lt;y&gt;"/);
  });
  test('no entries, no key', () => {
    assert.equal(legendHtml({ entries: [] }), '');
    assert.equal(legendHtml(null), '');
  });
});

describe('legend-mark: the mark slot', () => {
  test('the kernel draws exactly the marks the Segno slot accepts', () => {
    assert.deepEqual([...MARKS].sort(), [...LEGEND_MARKS].sort());
  });
  test('the plate takes exactly the pill\'s shape words', () => {
    assert.deepEqual(PLATE_SHAPES, CORE.pill.params.shape.values);
  });
  test('HTML: an aria-hidden span with the class spelled out', () => {
    assert.equal(markHtml('dashed', { color: 3 }), '<span class="legend-mark legend-mark--dashed" data-c="c3" aria-hidden="true"></span>');
    assert.equal(markHtml('nope'), '');
    assert.equal(markHtml(undefined), '');
  });
  test('SVG: a swatch is a rect, a stroke is a line wider than a swatch', () => {
    const sw = markSvg('swatch', { cx: 10, cy: 10, fontSize: 10 });
    const ln = markSvg('line', { cx: 10, cy: 10, fontSize: 10 });
    assert.match(sw.svg, /^<rect class="legend-mark legend-mark--swatch"/);
    assert.match(ln.svg, /^<line class="legend-mark legend-mark--line"/);
    assert.ok(ln.width > sw.width);
  });
  test('a color slot is validated, never echoed', () => {
    assert.equal(colorAttr(4), ' data-c="c4"');
    assert.equal(colorAttr('c12'), ' data-c="c12"');
    assert.equal(colorAttr('c13'), '');
    assert.equal(colorAttr('"><x'), '');
  });
});

test('CALLOUT_READERS names only real slide classes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const name of CALLOUT_READERS) {
    assert.ok(fs.existsSync(path.join(__dirname, `../../../lib/components/chart/${name}/${name}.manifest.json`)), name);
  }
});

describe('legend-messages: every code the reader emits has words', () => {
  const cases = [
    ['@legend{{1, lg}}', 'legend/ambiguous-pair', /reads as the label "1" with the style word `lg`/],
    ['@legend{', 'legend/syntax', /is not a callout or a legend: write/],
    ['@legend{{A}, layout=sideways}', 'legend/layout', /`sideways` is not a legend layout/],
    ['@legend{x}', 'legend/item', /`x` is not a legend entry/],
    ['@legend{{Peak}, anchored}', 'legend/no-target', /"Peak" is a callout with nothing to point at: add `row=` and `col=`/],
    ['@legend{{Peak, row=Jan}}', 'legend/half-target', /"Peak" names only its row: add `col=` too/],
    ['@legend{{Peak, col=M2}}', 'legend/half-target', /"Peak" names only its column: add `row=` too/],
    ['@legend{{Peak, row=Jan, col=M2, for=3}}', 'legend/two-targets', /"Peak" names its cell twice.*pair is the one drawn/],
    ['@legend{{Peak, col=M2, for=3}}', 'legend/two-targets', /half a `row=`\/`col=` pair: keep one\. `for=` is the one drawn/],
  ];
  for (const [src, code, words] of cases) {
    test(code, () => {
      const d = readLegend(src).diagnostics.find((x) => x.code === code);
      assert.ok(d, `${src} reports ${code}`);
      assert.match(legendMessage(d), words);
    });
  }
  test('callout/layout (said by the linter, not the reader)', () => {
    assert.match(legendMessage({ code: 'callout/layout', args: { word: 'key' } }), /`key` is not a callout layout: a callout is always anchored/);
  });
  test('legend/empty', () => {
    assert.equal(legendMessage(readLegend('@legend{x}').diagnostics[1]), 'The legend has no entries it can draw.');
  });
});

test('a @callout span reads its side: `side=beside`, `side=under`, or the bare word', () => {
  const { readLegend } = require('../../../lib/core/legend');
  assert.equal(readLegend('@callout{{Peak, for=1}, side=beside}').legend.side, 'beside');
  assert.equal(readLegend('@callout{{Peak, for=1}, under}').legend.side, 'under');
  assert.equal(readLegend('@callout{{Peak, for=1}}').legend.side, undefined);
});

test('a side that is not one is reported, and the callout still reads', () => {
  const { readLegend } = require('../../../lib/core/legend');
  const r = readLegend('@callout{{Peak, for=1}, side=left}');
  assert.equal(r.ok, true);
  assert.ok(r.diagnostics.some((d) => d.code === 'legend/side'));
  assert.equal(r.legend.side, undefined);
});

test('a @legend span carries no side: the notes are a callout\'s', () => {
  const { readLegend } = require('../../../lib/core/legend');
  assert.equal(readLegend('@legend{[{Poor, c1}], key, beside}').legend.side, undefined);
});
