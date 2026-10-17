/**
 * histogram — the band kernel (lib/components/chart/histogram/), its row model
 * (lib/core/histogram-model.js), its narrator and its lint rule.
 *
 * Pins the parse (a range and a value, in either order), the area rule (a band's
 * height is its value per unit of range, so equal bands draw as bars and unequal
 * bands draw honestly), the log axis, the edge ticks, the value labels that never
 * ellipsize, the narration, and the three lint warnings.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { parseHistogram, buildHistogram, transformSection } = require('../../../lib/components/chart/histogram/histogram.transform');
const { readRow, joins } = require('../../../lib/core/histogram-model');
const { readAxisMember } = require('../../../lib/core/axis-member');
const { narrateChart } = require('../../../lib/core/chart-narration');
const { findHistogramIssues } = require('../../../lib/authoring/lint-core');

// Through the engine's own render (`breaks: true`, the path a deck takes), the
// kernel's marks in order beside the narrator's `{ mark }` references.
const engine = require('../../../lib/engine');
const { narrateChartScript } = require('../../../lib/core/chart-narration');
function parity(md) {
  const r = engine.render(md);
  const html = typeof r === 'string' ? r : r.html;
  const marks = [...html.matchAll(/data-mark="(\d+)"[^>]*data-label="([^"]*)"/g)].map((m) => `${m[1]}:${m[2]}`);
  const refs = narrateChartScript(md).refs.filter((x) => x.id && 'mark' in x.id).map((x) => `${x.id.mark}:${x.label}`);
  return { marks, refs, html };
}
const deck = (cls, body) => `---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n${body}\n`;

const li = (rows) => rows.map(([label, ...pills]) => `<li>${label} ${pills.map((p) => `<code>${p}</code>`).join(' ')}</li>`).join('');

// Each element of class `cls`: its attributes. A split on `<`, not a polynomial regex.
function tags(svg, cls) {
  return svg.split('<').filter((p) => p.split('>')[0].includes(`class="${cls}"`)).map((p) => {
    const head = p.split('>')[0];
    return (name) => {
      const key = ` ${name}="`;
      const a = head.indexOf(key);
      return a < 0 ? null : head.slice(a + key.length, head.indexOf('"', a + key.length));
    };
  });
}
const num = (a, n) => Number(a(n));

const UNEQUAL = [['', '$1M..$10M', '55%'], ['', '$10M..$50M', '30%'], ['', '$50M..$100M', '12%'], ['', '$100M..$250M', '3%']];
const logAxes = { x: readAxisMember(['Annual loss', 'log'], { scales: true }), y: readAxisMember(['Share of years']) };

describe('histogram row model', () => {
  test('a row is a band and a value, in either order', () => {
    assert.deepEqual(readRow(['$1M..$10M', '55%']), { from: 1e6, to: 1e7, fromRaw: '$1M', toRaw: '$10M', value: 55, valueRaw: '55%' });
    assert.equal(readRow(['55%', '0..10']).from, 0);
  });

  test('a dash, a band that does not climb, or a missing value is not a row', () => {
    assert.equal(readRow(['$1M-$10M', '55%']), null);
    assert.equal(readRow(['$10M..$1M', '55%']), null);
    assert.equal(readRow(['$1M..$10M']), null);
  });

  test('neighbors that do not meet are a gap or an overlap', () => {
    assert.deepEqual(joins([{ from: 0, to: 10 }, { from: 10, to: 20 }, { from: 25, to: 30 }, { from: 28, to: 40 }]),
      [{ at: 2, kind: 'gap' }, { at: 3, kind: 'overlap' }]);
  });
});

describe('histogram kernel', () => {
  test('a band carries the mark contract, so a `chart-finish:` repaints it', () => {
    const svg = buildHistogram(parseHistogram(li([['', '0..10', '40%'], ['', '10..20', '20%']])), {});
    for (const a of tags(svg, 'histogram-band')) {
      assert.deepEqual([a('data-hue'), a('data-encodes'), a('data-paint')], ['1', 'hue', 'fill']);
    }
    const mark = require('../../../lib/components/chart/histogram/histogram.manifest.json').kernel.marks[0];
    assert.deepEqual([mark.encodes, mark.paint, mark.bears], ['hue', 'fill', false], 'the values print above a band, never on it');
  });

  test('equal bands draw as a gapless bar chart: heights in the ratio of the values', () => {
    const svg = buildHistogram(parseHistogram(li([['', '0..10', '40%'], ['', '10..20', '20%']])), {});
    const [a, b] = tags(svg, 'histogram-band');
    assert.equal(Math.round(num(a, 'height') / num(b, 'height')), 2);
    assert.equal(num(a, 'x') + num(a, 'width'), num(b, 'x'), 'the bands touch');
  });

  test('unequal bands: area, not height, is the value', () => {
    const svg = buildHistogram(parseHistogram(li(UNEQUAL)), {});
    const bands = tags(svg, 'histogram-band');
    const area = bands.map((a) => num(a, 'width') * num(a, 'height'));
    assert.ok(Math.abs(area[0] / area[1] - 55 / 30) < 0.01, 'area ratio follows the shares');
    assert.ok(num(bands[0], 'height') > num(bands[1], 'height'), 'the narrow first band is the tallest');
    assert.match(svg, /<desc>[^<]*area, not its height/);
  });

  test('`log` spaces the bands by multiples, and a band at zero falls back to linear', () => {
    const svg = buildHistogram(parseHistogram(li(UNEQUAL)), {}, logAxes);
    const w = tags(svg, 'histogram-band').map((a) => num(a, 'width'));
    assert.ok(w[0] > w[1], 'a decade ($1M to $10M) is wider than $10M to $50M on a log axis');
    assert.match(svg, /on a log scale/);
    const zero = buildHistogram(parseHistogram(li([['', '0..10', '5%'], ['', '10..100', '5%']])), {}, logAxes);
    assert.doesNotMatch(zero, /on a log scale/);
  });

  test('every value prints in full, never ellipsized, even over a narrow tail band', () => {
    const rows = ['1..2', '2..5', '5..10', '10..20', '20..50', '50..100', '100..200', '200..400', '400..700', '700..1000', '1000..2000', '2000..5000']
      .map((r, i) => ['', r, ['18%', '21%', '16%', '13%', '11%', '8%', '6%', '3.5%', '2%', '0.9%', '0.5%', '0.1%'][i]]);
    const svg = buildHistogram(parseHistogram(li(rows)), {}, logAxes);
    assert.doesNotMatch(svg, /…/);
    assert.match(svg, />0\.9%</);
  });

  test('edge labels thin evenly and the last edge always prints', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ['', `$${i * 10}k..$${(i + 1) * 10}k`, '5%']);
    const svg = buildHistogram(parseHistogram(li(rows)), {});
    const edges = svg.split('class="cart-tick histogram-edge"').slice(1).map((t) => t.split('>')[1].split('<')[0]);
    assert.ok(edges.length < 13, 'crowded edges thin');
    assert.equal(edges[edges.length - 1], '$120k');
  });

  test('a named band keeps its name; an unnamed band is named by its range', () => {
    const svg = buildHistogram(parseHistogram(li([['Attritional', '$1M..$5M', '61%'], ['', '$5M..$25M', '27%']])), {});
    assert.deepEqual(tags(svg, 'histogram-band').map((a) => a('data-label')), ['Attritional', '$5M to $25M']);
  });

  test('the axis line is consumed only when a chart draws, and the kernel emits no color', () => {
    const html = '<p><code>[{Loss, log}]</code></p><h2>T</h2><ul><li>nothing here</li></ul>';
    assert.equal(transformSection(html, {}), html);
    assert.doesNotMatch(buildHistogram(parseHistogram(li(UNEQUAL)), {}), /#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});

describe('histogram narration and lint', () => {
  const slide = ['<!-- _class: histogram -->', '', '`[{Annual loss, log}]`', '', '## Most years stay small.', '',
    '- Attritional `$1M..$5M` `61%`', '- `$5M..$25M` `27%`', '- `$25M-$100M` `9%`', ''].join('\n');

  test('says the frame once, then each band by its name and range, as the kernel keeps them', () => {
    const said = narrateChart(slide);
    assert.match(said, /Two bands of annual loss, on a log scale\./);
    assert.match(said, /Attritional, \$1M to \$5M: sixty-one percent\. \$5M to \$25M: twenty-seven percent\./);
    assert.doesNotMatch(said, /\$25M-\$100M/, 'the dash row is not a band, so it is not said');
  });

  test('lint names a dash, a gap or overlap, and `log` over zero', () => {
    const md = (rows, axis = '') => `---\nmarp: true\n---\n\n<!-- _class: histogram -->\n\n${axis}\n\n## T.\n\n${rows.join('\n')}\n`;
    const rules = (src) => findHistogramIssues(src).map((f) => f.rule);
    assert.deepEqual(rules(md(['- `$1M-$5M` `61%`'])), ['histogram-dash-range']);
    assert.deepEqual(rules(md(['- `0..10` `5%`', '- `20..30` `5%`'])), ['histogram-bands-join']);
    assert.deepEqual(rules(md(['- `0..10` `5%`', '- `10..20` `5%`'], '`[{Loss, log}]`')), ['histogram-log-zero']);
    assert.deepEqual(rules(md(['- `1..10` `5%`', '- `10..20` `5%`'], '`[{Loss, log}]`')), []);
  });
});

// The independent checker's repros on this PR, each pinned so it cannot come back.
describe('histogram — the checker repros', () => {
  test('a value pill wrapped onto the next line is drawn as well as said', () => {
    const { marks, refs } = parity(deck('histogram', '## T.\n\n- `20..30`\n  `10%`\n- `30..40` `5%`'));
    assert.deepEqual(marks, ['0:20 to 30', '1:30 to 40']);
    assert.deepEqual(refs, marks);
  });

  test('`log` over a domain that reaches zero is not said as a log scale', () => {
    const md = deck('histogram', '`[{Annual loss, 0..250, log}, {Share}]`\n\n## T.\n\n- `1..10` `5%`\n- `10..50` `5%`');
    assert.doesNotMatch(narrateChart(md), /log scale/);
    assert.doesNotMatch(parity(md).html, /on a log scale/);
    assert.deepEqual(findHistogramIssues(md).map((f) => f.rule), ['histogram-log-zero']);
  });

  test('`log` in the y member, or a name that contains the word, is not the scale', () => {
    assert.deepEqual(findHistogramIssues(deck('histogram', '`[{Log returns}, {Share}]`\n\n## T.\n\n- `0..10` `5%`')), []);
  });

  test('one band is one band, and an acronym keeps its case', () => {
    const md = deck('histogram', '`[{USD loss}]`\n\n## T.\n\n- `1..10` `5%`');
    assert.match(narrateChart(md), /One band of USD loss\./);
    assert.match(parity(md).html, /1 band\./);
  });

  test('a negative value warns, and draws with no height', () => {
    const md = deck('histogram', '## T.\n\n- `0..10` `-5%`\n- `10..20` `5%`');
    assert.deepEqual(findHistogramIssues(md).map((f) => f.rule), ['histogram-negative']);
    const svg = buildHistogram(parseHistogram(li([['', '0..10', '-5%'], ['', '10..20', '5%']])), {});
    assert.equal(tags(svg, 'histogram-band')[0]('height'), '0');
  });

  test('a value label that cannot be placed is reported as a drop', () => {
    const { collectLabelDrops } = require('../../../lib/components/chart/_chart-family/label-drops');
    // Thirty one-unit bands of equal height: their labels cannot all clear one another.
    const rows = Array.from({ length: 30 }, (_, i) => ['', `${i}..${i + 1}`, '33.3%']);
    const { drops } = collectLabelDrops(() => buildHistogram(parseHistogram(li(rows)), {}));
    assert.ok(drops.length > 0 && drops.every((d) => d.reason === 'overlap' && d.label === '33.3%'));
  });
});

