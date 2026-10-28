/**
 * ep-curve — the return-period kernel (lib/components/chart/ep-curve/), its point
 * model (lib/core/ep-curve-model.js) and its narrator.
 *
 * Pins the parse (a flat curve, named curves, at most four), the always-log
 * return-period axis, the `1-in-N` labels with their thousands separator, the
 * labels a market quotes surviving the thinning, the curve names that wrap inside
 * the frame, and the narration that reads the same points in the same order.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { parseEpCurve, buildEpCurve } = require('../../../lib/components/chart/ep-curve/ep-curve.transform');
const { readEpPoint, rpLabel } = require('../../../lib/core/ep-curve-model');
const { narrateChart } = require('../../../lib/core/chart-narration');

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
const { findEpCurveIssues } = require('../../../lib/authoring/lint-core');

const pt = (p) => `<li><code>${p}</code></li>`;
const curve = (name, pts) => `<li>${name}<ul>${pts.map(pt).join('')}</ul></li>`;

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

describe('ep-curve point model', () => {
  test('a point is `{return period, loss}`, return period first', () => {
    assert.deepEqual(readEpPoint('{100, $410M}'), { rp: 100, loss: 410e6, rpRaw: '100', lossRaw: '$410M' });
  });

  test('a return period under one year, or a label in place of a number, is not a point', () => {
    assert.equal(readEpPoint('{0.5, $10M}'), null);
    assert.equal(readEpPoint('{1-in-100, $410M}'), null);
  });

  test('`1-in-N` takes a thousands separator from four digits', () => {
    assert.equal(rpLabel({ rpRaw: '250' }), '1-in-250');
    assert.equal(rpLabel({ rpRaw: '1000' }), '1-in-1,000');
    assert.equal(rpLabel({ rpRaw: '10000' }), '1-in-10,000');
  });
});

describe('ep-curve kernel', () => {
  test('a flat list is one curve; named curves follow; at most four', () => {
    const m = parseEpCurve([pt('{10, $1M}'), pt('{100, $5M}'),
      ...['A', 'B', 'C', 'D'].map((n) => curve(n, ['{10, $2M}', '{100, $6M}']))].join(''));
    assert.deepEqual(m.series.map((s) => s.name), ['', 'A', 'B', 'C']);
  });

  test('points draw in return-period order, a repeated return period once', () => {
    const m = parseEpCurve(curve('OEP', ['{100, $410M}', '{10, $120M}', '{100, $999M}']));
    assert.deepEqual(m.series[0].points.map((p) => p.rp), [10, 100]);
    assert.equal(m.series[0].points[1].loss, 410e6);
  });

  test('the return-period axis is log: 1-in-10 to 1-in-100 is as wide as 1-in-100 to 1-in-1,000', () => {
    const svg = buildEpCurve(parseEpCurve(curve('OEP', ['{10, $1M}', '{100, $2M}', '{1000, $3M}'])), {});
    const xs = tags(svg, 'ep-dot').map((a) => Number(a('cx')));
    assert.ok(Math.abs((xs[1] - xs[0]) - (xs[2] - xs[1])) < 0.05);
  });

  test('the 1-in-100 label survives thinning on a crowded axis', () => {
    const rps = [2, 5, 10, 25, 50, 100, 200, 250, 1000, 10000];
    const svg = buildEpCurve(parseEpCurve(curve('Gross', rps.map((r, i) => `{${r}, $${(i + 1) * 10}M}`))), { orientation: 'portrait' });
    const labels = svg.split('class="cart-tick ep-rp"').slice(1).map((t) => t.split('>')[1].split('<')[0]);
    assert.ok(labels.includes('1-in-100') && labels.includes('1-in-10') && labels.includes('1-in-10,000'), labels.join(' '));
    assert.ok(labels.length < rps.length, 'the crowded labels thin');
  });

  test('a long curve name wraps inside the frame instead of running past it', () => {
    const name = 'Net AEP after the cat program';
    const svg = buildEpCurve(parseEpCurve(curve(name, ['{10, $1M}', '{100, $5M}'])), { orientation: 'portrait' });
    const [, , w] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    const label = svg.split('class="cart-series ep-series"')[1];
    assert.match(label, /<tspan/, 'two lines');
    const x = Number(/ x="([\d.]+)"/.exec(label)[1]);
    assert.ok(x < w, 'starts inside the frame');
  });

  test('one curve prints its losses; two leave them to the hover card and the narration', () => {
    const one = buildEpCurve(parseEpCurve(curve('OEP', ['{10, $120M}', '{100, $410M}'])), {});
    assert.match(one, />\$410M</);
    const two = buildEpCurve(parseEpCurve(curve('OEP', ['{10, $120M}']) + curve('AEP', ['{10, $150M}'])), {});
    assert.doesNotMatch(two, /class="cart-value"/);
    assert.doesNotMatch(one, /#[0-9a-f]{3,6}\b|rgb\(/i, 'no color in the kernel');
  });
});

describe('ep-curve narration', () => {
  const slide = ['<!-- _class: ep-curve -->', '', '## A 1-in-100 year costs $410M.', '',
    '- OEP', '  - `{100, $410M}`', '  - `{10, $120M}`', '- AEP', '  - `{10, $150M}`', ''].join('\n');

  test('each curve by name and span, then point by point in return-period order', () => {
    const said = narrateChart(slide);
    assert.match(said, /OEP: from one hundred twenty million dollars at 1-in-10 to four hundred ten million dollars at 1-in-100\. 1-in-10, one hundred twenty million dollars\. 1-in-100, four hundred ten million dollars\./);
    assert.match(said, /AEP: one hundred fifty million dollars at 1-in-10\./);
  });
});

// The independent checker's repros on this PR, each pinned so it cannot come back.
describe('ep-curve — the checker repros', () => {
  test('a `>` note under a point keeps that point in the narration', () => {
    const { marks, refs } = parity(deck('ep-curve', '## T.\n\n- OEP\n  - `{100, $410M}`\n    > a note\n  - `{10, $120M}`\n- AEP\n  - `{10, $150M}`'));
    assert.equal(marks.length, 3);
    assert.deepEqual(refs, marks);
  });

  test('a point wrapped onto the next line is drawn as well as said', () => {
    const { marks, refs } = parity(deck('ep-curve', '## T.\n\n- OEP\n  -\n    `{100, $410M}`\n  - `{10, $120M}`'));
    assert.deepEqual(refs, marks);
  });

  test('a negative loss stays inside the frame', () => {
    const svg = buildEpCurve(parseEpCurve(pt('{10, -$5M}') + pt('{100, $5M}')), {});
    const h = Number(svg.match(/viewBox="([^"]+)"/)[1].split(' ')[3]);
    for (const a of tags(svg, 'ep-dot')) assert.ok(Number(a('cy')) <= h && Number(a('cy')) >= 0);
  });

  test('lint names a separator, a duplicate return period and a fifth drawn curve', () => {
    const curves = ['A', 'B', 'C', 'D', 'E'].map((n) => `- ${n}\n  - \`{10, $1M}\``).join('\n');
    const rules = (body) => findEpCurveIssues(deck('ep-curve', `## T.\n\n${body}`)).map((f) => f.rule);
    assert.deepEqual(rules('- `{1,000, $900M}`\n- `{250, $1,200M}`'), ['ep-curve-point', 'ep-curve-point']);
    assert.deepEqual(rules('- `{10, $1M}`\n- `{10, $2M}`'), ['ep-curve-duplicate']);
    assert.deepEqual(rules(curves), ['ep-curve-too-many']);
    assert.deepEqual(rules('- A\n  - `{0.5, $1M}`\n' + curves.split('\n').slice(2).join('\n')), ['ep-curve-point'], 'a curve with no readable point is not counted');
  });

  test('with a negative loss the zero rule is the baseline, and no bottom rule is drawn', () => {
    const neg = buildEpCurve(parseEpCurve(pt('{10, -$5M}') + pt('{100, $5M}')), {});
    assert.doesNotMatch(neg, /class="cart-axis" x1="[^"]+" y1="([^"]+)" x2="[^"]+" y2="\1"/, 'no horizontal bottom rule');
    assert.match(neg, /class="cart-zero"/);
    const pos = buildEpCurve(parseEpCurve(pt('{10, $5M}') + pt('{100, $9M}')), {});
    assert.match(pos, /class="cart-axis"/);
  });

  test('a curve name links to its curve with data-series-for, not data-series', () => {
    const svg = buildEpCurve(parseEpCurve(curve('OEP', ['{10, $1M}', '{100, $5M}'])), {});
    const name = svg.split('class="cart-series ep-series"')[1].split('>')[0];
    assert.match(name, /data-series-for="0"/);
    assert.doesNotMatch(name, / data-series="/);
  });

  test('under the tone finish a dot keeps its curve\'s hue', () => {
    // Tone recolors every open hue rule's mark to one ramp; a dot that took it would sit off-color on a
    // curve whose stroke no finish reaches (build-marks-css.js § STROKE_MEMBERS).
    const css = require('node:fs').readFileSync(require.resolve('../../../lib/components/chart/_chart-family/marks.generated.css'), 'utf8');
    // The shared body rule serves every finish and skips the stroke members by name; the companion that puts them back
    // under pigment and etch has a head that does not name tone.
    const toneHue = css.split('\n').filter((l) => /^section:is\([^)]*\.marks-tone[^)]*\) :where\(:is\(\[data-hue=/.test(l) && l.includes('[data-paint="fill"]'));
    assert.ok(toneHue.length > 0);
    for (const l of toneHue) assert.match(l, /:not\([^\n]*\.ep-dot[,)]/);
  });
});
