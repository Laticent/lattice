/**
 * Unit: lib/components/chart/scatter/scatter.transform.js — kernel for the
 * `scatter` chart-family member.
 *
 * Section dispatch and chart-frame wrapping live in chart-family.js; this
 * kernel produces the figure HTML. The shared plot substrate has its own suite
 * (test/unit/components/cartesian.test.js) — nothing here re-tests ticks,
 * scales or the grid. What is covered is what this kernel decides:
 *
 *   1. The point DSL: two trailing pills per entity, the third for `bubble`,
 *      detail-vs-data, a sign written outside a currency symbol, the bails.
 *   2. The axis-caption paragraph: two codes consumed, one code left alone.
 *   3. The domain policy: padded, never zero-based, never padded past zero,
 *      ticks INSIDE the domain, snapped out only when it is nearly free.
 *   4. The figure contract: the literal figure class, a viewBox, a <desc> that
 *      carries the numbers AND the relationship, and NO color anywhere.
 *   5. Geometry invariants: bubble AREA is proportional to the magnitude, the
 *      trend line is the least-squares fit and is clipped to the plot, and the
 *      trend floor refuses a line too few points can support.
 *   6. The CSS mirror: the kernel's nominal label sizes against the two
 *      stylesheets that actually paint them.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  transformSection, parseScatter, buildScatter, readAxisTitles, domainFor,
  pearson, relationshipPhrase, leastSquares, bubbleRadius, pickVariant,
  clipToPlot, niceFloor,
  FS, GUTTER, DOT_R, BUBBLE, TREND_MIN_POINTS, SCATTER_MODIFIERS,
} = require('../../../lib/components/chart/scatter/scatter.transform');

const ROOT = path.join(__dirname, '../../../lib/components/chart');

// The <ul> inner HTML the dispatcher hands the kernel, matching Marp Core /
// emulator output: `<li>Label <code>x</code> <code>y</code></li>`.
function ul(rows) {
  return rows.map(([label, ...pills]) =>
    `<li>${label}${pills.map((p) => ` <code>${p}</code>`).join('')}</li>`).join('');
}

const CTX = { cls: 'scatter', classTokens: ['scatter'], orientation: 'landscape' };
const AXES = { x: 'Annual cost', y: 'Teams adopting', size: '' };

function section(inner, extra = '') {
  return `${extra}<h2>A heading.</h2><ul>${inner}</ul>`;
}

describe('scatter kernel', () => {
  describe('parseScatter — the point DSL', () => {
    test('reads a name and two trailing pills as one point', () => {
      const m = parseScatter(ul([['Atlas', '4.2', '8.1'], ['Borealis', '2.1', '3.8']]));
      assert.deepEqual(m.points.map((p) => p.label), ['Atlas', 'Borealis']);
      assert.deepEqual(m.points.map((p) => p.x), [4.2, 2.1]);
      assert.deepEqual(m.points.map((p) => p.y), [8.1, 3.8]);
      assert.deepEqual(m.points.map((p) => p.mark), [0, 1]);
    });

    test('a third pill is the bubble magnitude and keeps its raw text', () => {
      const m = parseScatter(ul([['Atlas', '$420k', '18%', '1200']]));
      assert.equal(m.points[0].size, 1200);
      assert.equal(m.points[0].sizeRaw, '1200');
      assert.equal(m.hasSize, true);
    });

    test('the magnitude suffix is scale, and % is not a magnitude', () => {
      const m = parseScatter(ul([['A', '1.2M', '12%'], ['B', '800k', '40%']]));
      assert.deepEqual(m.points.map((p) => p.x), [1200000, 800000]);
      assert.deepEqual(m.points.map((p) => p.y), [12, 40]);
    });

    test('the per-axis affix is adopted only when every value on that axis agrees', () => {
      const same = parseScatter(ul([['A', '$4', '10%'], ['B', '$6', '20%']]));
      assert.deepEqual(same.xAffix, { prefix: '$', suffix: '' });
      assert.equal(same.yAffix.suffix, '%');
      const mixed = parseScatter(ul([['A', '$4', '10%'], ['B', '6kg', '20%']]));
      assert.deepEqual(mixed.xAffix, { prefix: '', suffix: '' });
    });

    test('a nested sublist is DETAIL, not a third coordinate', () => {
      const inner = '<li>Atlas <code>4</code> <code>8</code>'
        + '<ul><li>Renewal lands in March</li></ul></li>';
      const m = parseScatter(inner);
      assert.equal(m.points.length, 1);
      assert.equal(m.points[0].x, 4);
      assert.equal(m.points[0].y, 8);
      assert.match(m.points[0].detail, /Renewal lands in March/);
    });

    test('an item with fewer than two pills is skipped, never plotted at zero', () => {
      const m = parseScatter(ul([['Atlas', '4.2'], ['Borealis', '2.1', '3.8']]));
      assert.deepEqual(m.points.map((p) => p.label), ['Borealis']);
    });

    test('a malformed value drops its point rather than plotting NaN', () => {
      const m = parseScatter(ul([['Atlas', 'n/a', 'tbd'], ['Borealis', '2.1', '3.8']]));
      assert.deepEqual(m.points.map((p) => p.label), ['Borealis']);
    });

    test('an empty list, and a list with no numeric points, return null', () => {
      assert.equal(parseScatter(''), null);
      assert.equal(parseScatter(ul([['Atlas'], ['Borealis']])), null);
    });

    test('the three ways an author writes a negative all reach the plot negative', () => {
      const m = parseScatter(ul([
        ['Dash', '-$400k', '12'],       // minus before the currency symbol
        ['Paren', '($1.2M)', '48'],     // the accounting parenthesis
        ['Unicode', '\u22121.2M', '20'], // U+2212, what a spreadsheet paste gives
        ['Up', '$1.2M', '30'],
      ]));
      assert.deepEqual(m.points.map((p) => p.x), [-400000, -1200000, -1200000, 1200000]);
    });

    test('a pill that is prose with digits in it is not a coordinate', () => {
      // `parseValue` reads the first numeric run, so `PROJ-42` is -42 and would
      // drag the axis to meet it. `isValuePill` is the family's stricter test.
      const m = parseScatter(ul([
        ['Ticket', 'PROJ-42', 'Q3-2024'], ['Good', '4', '8'], ['Also', '2', '3'],
      ]));
      assert.deepEqual(m.points.map((p) => p.label), ['Good', 'Also']);
    });

    test('a non-numeric pill AHEAD of the coordinates stays with the name', () => {
      const m = parseScatter(
        '<li>Atlas <code>EMEA</code> <code>$420k</code> <code>18%</code></li>'
        + '<li>Borealis <code>$310k</code> <code>24%</code></li>');
      assert.deepEqual(m.points.map((p) => p.label), ['Atlas EMEA', 'Borealis']);
      assert.deepEqual(m.points.map((p) => p.x), [420000, 310000]);
    });
  });

  describe('readAxisTitles — the caption paragraph', () => {
    test('two inline-code spans become the x and y captions and are CONSUMED', () => {
      const html = '<p><code>Annual cost</code> <code>Teams adopting</code></p><h2>H</h2>';
      const r = readAxisTitles(html);
      assert.equal(r.x, 'Annual cost');
      assert.equal(r.y, 'Teams adopting');
      assert.equal(r.html.includes('Annual cost'), false);
    });

    test('a THIRD span names the bubble size measure', () => {
      const html = '<p><code>Cost</code> <code>Adoption</code> <code>Seats</code></p>';
      assert.equal(readAxisTitles(html).size, 'Seats');
    });

    test('a ONE-code paragraph is the ordinary chart eyebrow and is left alone', () => {
      const html = '<p><code>Tooling review</code></p><h2>H</h2>';
      const r = readAxisTitles(html);
      assert.equal(r.x, '');
      assert.equal(r.html, html);
    });
  });

  describe('domainFor — padded, not zero-based', () => {
    test('does NOT force zero into a narrow-range domain', () => {
      const d = domainFor([38.9, 41.2, 43.5, 44.0]);
      assert.ok(d.min > 30, `expected a tight lower bound, got ${d.min}`);
      assert.ok(d.max < 50, `expected a tight upper bound, got ${d.max}`);
    });

    test('pads the data range at both ends', () => {
      const d = domainFor([10, 20]);
      assert.ok(d.min < 10 && d.max > 20);
    });

    test('never pads a non-negative series below zero', () => {
      const d = domainFor([0, 5, 10]);
      assert.equal(d.min, 0);
    });

    test('pads below a genuinely negative minimum', () => {
      const d = domainFor([-40, 10, 50]);
      assert.ok(d.min < -40);
    });

    test('every tick lies inside the domain', () => {
      for (const vals of [[60, 420], [0.2, 0.9], [18, 74], [-400, 1200]]) {
        const d = domainFor(vals);
        for (const t of d.ticks) {
          assert.ok(t >= d.min - 1e-9 && t <= d.max + 1e-9,
            `tick ${t} outside [${d.min}, ${d.max}] for ${vals}`);
        }
      }
    });

    test('keeps the tick count inside the family ceiling of five', () => {
      for (const vals of [[60, 420], [18, 74], [1, 1000], [0.01, 0.09]]) {
        const d = domainFor(vals);
        assert.ok(d.ticks.length <= 5, `${d.ticks.length} ticks for ${vals}`);
      }
    });

    test('snaps out to a tick when the overshoot is under a quarter of a step, and not further', () => {
      // 18..74 pads to 13.52..78.48; the 80 tick costs 1.52 of a 20 step.
      const near = domainFor([18, 74]);
      assert.equal(near.max, 80);
      assert.ok(near.ticks.includes(80));
      // 60k..420k pads to 31.2k..451.2k; the 500k tick costs 48.8k of a 100k step.
      const far = domainFor([60000, 420000]);
      assert.ok(far.max < 500000, `expected no snap, got ${far.max}`);
    });

    test('a flat series still gets a readable axis rather than a zero-span scale', () => {
      const d = domainFor([42, 42, 42]);
      assert.ok(d.max > d.min);
      assert.ok(d.min < 42 && d.max > 42, 'the value must sit inside its own domain');
      assert.ok(d.ticks.length <= 5, `${d.ticks.length} ticks for a flat series`);
    });

    test('a single point takes the same tick ceiling as any other domain', () => {
      for (const v of [41.2, 0, 1200000, -8]) {
        const d = domainFor([v]);
        assert.ok(d.ticks.length <= 5, `${d.ticks.length} ticks for a lone ${v}`);
        assert.ok(v >= d.min && v <= d.max, `${v} outside [${d.min}, ${d.max}]`);
      }
    });
  });

  describe('buildScatter — the figure contract', () => {
    const model = parseScatter(ul([
      ['Atlas', '$420k', '18%'], ['Borealis', '$310k', '24%'],
      ['Cardinal', '$180k', '52%'], ['Fathom', '$60k', '74%'],
    ]));

    test('emits the figure class the manifest declares, literally', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'scatter/scatter.manifest.json'), 'utf8'));
      const src = fs.readFileSync(path.join(ROOT, 'scatter/scatter.transform.js'), 'utf8');
      assert.equal(manifest.kernel.figureClass, 'scatter-figure');
      assert.ok(src.includes('class="scatter-figure"'),
        'the figure class must be literally present in the source — checkChartKernels text-matches it');
      assert.ok(buildScatter(model, CTX, AXES).includes('class="scatter-figure"'));
    });

    test('the svg carries a viewBox and the family aspect-ratio contract', () => {
      const svg = buildScatter(model, CTX, AXES);
      assert.match(svg, /viewBox="0 0 320 180"/);
      assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
      assert.match(svg, /role="img"/);
      // Portrait takes the substrate's taller box, not a third geometry.
      assert.match(buildScatter(model, { ...CTX, orientation: 'portrait' }, AXES),
        /viewBox="0 0 320 300"/);
    });

    test('the <desc> carries the numbers AND the relationship the chart is for', () => {
      const desc = buildScatter(model, CTX, AXES).match(/<desc>([^<]*)<\/desc>/)[1];
      assert.match(desc, /Annual cost horizontal/);
      assert.match(desc, /Teams adopting vertical/);
      for (const name of ['Atlas', 'Borealis', 'Cardinal', 'Fathom']) {
        assert.ok(desc.includes(name), `${name} missing from the desc`);
      }
      assert.ok(desc.includes('$420k') && desc.includes('18%'), 'raw values missing from the desc');
      // A scatter IS the relationship, the way a funnel IS the drop-off.
      assert.match(desc, /move strongly in opposite directions \(r = -0\.9/);
    });

    test('emits NO color literal anywhere', () => {
      const out = [
        buildScatter(model, CTX, AXES),
        buildScatter(model, { ...CTX, classTokens: ['scatter', 'bubble'] },
          { ...AXES, size: 'Seats' }),
        buildScatter(parseScatter(ul([
          ['A', '1', '1'], ['B', '2', '2'], ['C', '3', '3.2'],
          ['D', '4', '3.8'], ['E', '5', '5'],
        ])), { ...CTX, classTokens: ['scatter', 'trend'] }, AXES),
      ].join('');
      assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(out), false, 'a hex literal reached the kernel output');
      assert.equal(/\brgba?\(/.test(out), false, 'an rgb() literal reached the kernel output');
      assert.equal(/\bhsla?\(/.test(out), false, 'an hsl() literal reached the kernel output');
      // Only token names may appear inside a paint value.
      for (const m of out.matchAll(/stop-color:([^"]*)/g)) {
        assert.match(m[1], /var\(--/, `a stop without a token: ${m[1]}`);
      }
    });

    test('every dot carries the a11y/print hooks the family textures on', () => {
      const svg = buildScatter(model, CTX, AXES);
      assert.equal((svg.match(/class="scatter-dot" data-cat="0"/g) || []).length, 4);
      assert.match(svg, /data-anima-role="point"/);
      assert.match(svg, /data-mark="0"/);
      assert.match(svg, /data-label="Atlas"/);
    });

    test('a single point still renders a chart', () => {
      const one = parseScatter(ul([['Atlas', '41.2%', '54']]));
      const svg = buildScatter(one, CTX, AXES);
      assert.match(svg, /class="scatter-dot"/);
      assert.match(svg, /viewBox=/);
    });

    test('the stress case renders without throwing and keeps every dot', () => {
      const rows = [
        ['Atlas', '$420k', '18%'], ['Borealis', '$310k', '24%'], ['Cardinal', '$180k', '52%'],
        ['Dovetail', '$95k', '61%'], ['Everline', '$240k', '31%'], ['Fathom', '$60k', '74%'],
        ['Granite', '$182k', '53%'], ['Halyard', '$178k', '50%'], ['Ironwood', '$185k', '54%'],
        ['Juniper', '$400k', '20%'], ['Keystone', '$88k', '66%'], ['Lantern', '$300k', '28%'],
      ];
      const svg = buildScatter(parseScatter(ul(rows)), CTX, AXES);
      assert.equal((svg.match(/class="scatter-dot"/g) || []).length, 12);
      // A name with nowhere to sit is DROPPED, never overprinted — but it must
      // still reach the reader through the desc.
      const desc = svg.match(/<desc>([^<]*)<\/desc>/)[1];
      for (const [name] of rows) assert.ok(desc.includes(name), `${name} missing from the desc`);
    });

    test('author text with &, < and > survives escaped', () => {
      const m = parseScatter(ul([['R&D <core>', '4', '8'], ['Other', '2', '3']]));
      const svg = buildScatter(m, CTX, AXES);
      assert.ok(svg.includes('R&amp;D &lt;core&gt;') || svg.includes('R&amp;D'),
        'the ampersand must be escaped in the label');
      assert.equal(/<core>/.test(svg), false, 'raw author markup reached the SVG');
    });

    test('a label that cannot sit against its dot gets a leader, and an adjacent one does not', () => {
      const spread = buildScatter(parseScatter(ul([
        ['A', '1', '1'], ['B', '5', '5'], ['C', '9', '9'],
      ])), CTX, AXES);
      assert.equal(/scatter-leader/.test(spread), false,
        'a well-spread plot should need no leaders');
      const cluster = buildScatter(parseScatter(ul([
        ['Cardinal', '180', '52'], ['Granite', '182', '53'],
        ['Halyard', '178', '50'], ['Ironwood', '185', '54'],
        ['Fathom', '60', '74'], ['Atlas', '420', '18'],
      ])), CTX, AXES);
      assert.ok(/scatter-leader/.test(cluster),
        'a tight cluster must state which name belongs to which dot');
    });
  });

  describe('geometry invariants', () => {
    test('bubble AREA — never radius — is proportional to the magnitude', () => {
      const r1 = bubbleRadius(100, 400);
      const r4 = bubbleRadius(400, 400);
      // Four times the value must be twice the radius, measured from rMin.
      const a1 = r1 - BUBBLE.rMin;
      const a4 = r4 - BUBBLE.rMin;
      assert.ok(Math.abs(a4 / a1 - 2) < 1e-9, `radius ratio ${a4 / a1}, expected 2`);
      assert.equal(bubbleRadius(400, 400), BUBBLE.rMax);
      // An absent magnitude falls back to the plain dot rather than to zero.
      assert.equal(bubbleRadius(NaN, 400), DOT_R);
    });

    test('no bubble crosses an axis rule — the domain holds the radius too', () => {
      const svg = buildScatter(parseScatter(ul([
        ['Atlas', '420', '18', '1200'], ['Fathom', '60', '74', '450'],
        ['Cardinal', '180', '52', '900'],
      ])), { ...CTX, classTokens: ['scatter', 'bubble'] }, { ...AXES, size: 'Seats' });
      const plotBottom = 180 - GUTTER.bottom;
      for (const tag of svg.matchAll(/<circle class="scatter-bubble"[^<>]*>/g)) {
        const m = [
          tag[0],
          (/\scx="([\d.-]+)"/.exec(tag[0]) || [])[1],
          (/\scy="([\d.-]+)"/.exec(tag[0]) || [])[1],
          (/\sr="([\d.]+)"/.exec(tag[0]) || [])[1],
        ];
        const cy = Number(m[2]), r = Number(m[3]);
        assert.ok(cy + r <= plotBottom + 0.01, `a bubble overhangs the x axis by ${cy + r - plotBottom}`);
        assert.ok(cy - r >= GUTTER.top - 0.01, 'a bubble overhangs the top of the plot');
      }
    });

    test('the size key is present under bubble and absent otherwise', () => {
      const model = parseScatter(ul([['Atlas', '420', '18', '1200'], ['Fathom', '60', '74', '450']]));
      const withKey = buildScatter(model, { ...CTX, classTokens: ['scatter', 'bubble'] },
        { ...AXES, size: 'Seats' });
      assert.match(withKey, /scatter-size-key/);
      assert.match(withKey, /scatter-size-ring/);
      assert.ok(withKey.includes('1200'), 'the key must print the largest authored magnitude');
      assert.equal(/scatter-size-key/.test(buildScatter(model, CTX, AXES)), false);
    });

    test('leastSquares is the real fit', () => {
      // y = 3 + 2x exactly.
      const fit = leastSquares([{ x: 0, y: 3 }, { x: 1, y: 5 }, { x: 2, y: 7 }]);
      assert.ok(Math.abs(fit.b - 2) < 1e-9);
      assert.ok(Math.abs(fit.a - 3) < 1e-9);
      assert.equal(leastSquares([{ x: 1, y: 1 }, { x: 1, y: 5 }]), null, 'a vertical set has no fit');
    });

    test('the trend line refuses to draw below the point floor', () => {
      const few = parseScatter(ul([['A', '1', '1'], ['B', '2', '2'], ['C', '3', '3'], ['D', '4', '4']]));
      assert.equal(few.points.length, TREND_MIN_POINTS - 1);
      assert.equal(/scatter-trend/.test(
        buildScatter(few, { ...CTX, classTokens: ['scatter', 'trend'] }, AXES)), false);
      const enough = parseScatter(ul([
        ['A', '1', '1'], ['B', '2', '2'], ['C', '3', '3'], ['D', '4', '4'], ['E', '5', '5'],
      ]));
      const svg = buildScatter(enough, { ...CTX, classTokens: ['scatter', 'trend'] }, AXES);
      assert.match(svg, /class="scatter-trend" data-series="0"/);
    });

    test('the trend line is clipped to the plot rectangle', () => {
      const plot = { x0: 36, y0: 10, x1: 306, y1: 156, w: 270, h: 146 };
      const seg = clipToPlot(36, 50, 306, 400, plot);
      assert.ok(seg.y2 <= plot.y1 + 1e-9 && seg.y1 >= plot.y0 - 1e-9);
      assert.ok(seg.x2 < 306, 'the clipped end must pull back inside the box');
      assert.equal(clipToPlot(36, 400, 306, 500, plot), null, 'a wholly outside segment draws nothing');
      // A steep fit on real data must not escape the plot either.
      const svg = buildScatter(parseScatter(ul([
        ['A', '1', '1'], ['B', '2', '40'], ['C', '3', '3'],
        ['D', '4', '90'], ['E', '5', '5'],
      ])), { ...CTX, classTokens: ['scatter', 'trend'] }, AXES);
      // Match the tag ONCE, then read attributes off it. Two `[^<>]*` runs in
      // one pattern backtrack polynomially on a long tag (CodeQL js/polynomial-redos).
      const trendTag = svg.match(/<[a-z]+ class="scatter-trend"[^<>]*>/);
      const line = trendTag && [
        trendTag[0],
        (/\sy1="([\d.-]+)"/.exec(trendTag[0]) || [])[1],
        (/\sy2="([\d.-]+)"/.exec(trendTag[0]) || [])[1],
      ];
      if (line) {
        for (const y of [Number(line[1]), Number(line[2])]) {
          assert.ok(y >= GUTTER.top - 0.01 && y <= 180 - GUTTER.bottom + 0.01,
            `the trend line escaped the plot at y=${y}`);
        }
      }
    });

    test('pearson and its phrase describe the relationship, not just the points', () => {
      const up = [{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }];
      assert.ok(Math.abs(pearson(up) - 1) < 1e-9);
      assert.match(relationshipPhrase(pearson(up)), /strongly together/);
      const down = up.map((p) => ({ x: p.x, y: -p.y }));
      assert.match(relationshipPhrase(pearson(down)), /strongly in opposite directions/);
      assert.match(relationshipPhrase(0.05), /little relationship/);
      assert.equal(relationshipPhrase(pearson([{ x: 1, y: 1 }])), '');
    });

    test('niceFloor rounds DOWN the ladder, where niceStep rounds up', () => {
      assert.equal(niceFloor(300), 250);
      assert.equal(niceFloor(1200), 1000);
      assert.equal(niceFloor(0), 0);
    });
  });

  describe('transformSection — dispatch', () => {
    test('splices the figure in place of the list and consumes the axis paragraph', () => {
      const html = section(ul([['Atlas', '4', '8'], ['Borealis', '2', '3']]),
        '<p><code>Cost</code> <code>Value</code></p>');
      const out = transformSection(html, CTX);
      assert.match(out, /class="scatter-figure"/);
      assert.equal(/<ul>/.test(out), false, 'the source list must be replaced');
      assert.equal(out.includes('<code>Cost</code>'), false, 'the axis paragraph must be consumed');
      assert.match(out, /ANNUAL|Cost/i);
    });

    test('a section with nothing to draw comes back BYTE-IDENTICAL', () => {
      // No list at all — the axis paragraph must not be eaten on the way out.
      const noList = '<p><code>Cost</code> <code>Value</code></p><h2>H</h2><p>Prose.</p>';
      assert.equal(transformSection(noList, CTX), noList);
      // A list with no numeric points.
      const noPoints = section(ul([['Atlas'], ['Borealis']]),
        '<p><code>Cost</code> <code>Value</code></p>');
      assert.equal(transformSection(noPoints, CTX), noPoints);
    });

    test('pickVariant reads the class tokens and defaults cleanly', () => {
      assert.equal(pickVariant(['scatter']), 'default');
      assert.equal(pickVariant(['scatter', 'bubble']), 'bubble');
      assert.equal(pickVariant(['scatter', 'trend']), 'trend');
      assert.deepEqual(SCATTER_MODIFIERS, ['bubble', 'trend']);
    });

    test('detail bullets ride the mark-detail substrate and leave the chart face alone', () => {
      const plain = section(ul([['Atlas', '4', '8'], ['Borealis', '2', '3']]));
      const withDetail = section(
        '<li>Atlas <code>4</code> <code>8</code><ul><li>Renewal in March</li></ul></li>'
        + '<li>Borealis <code>2</code> <code>3</code></li>');
      const a = transformSection(plain, CTX);
      const b = transformSection(withDetail, CTX);
      assert.match(b, /<template class="chart-detail" data-mark="0">/);
      // The chart pixels are byte-identical: strip the detail payload + note.
      // Sliced rather than matched: `<svg[\s\S]*?<\/svg>` is a lazy any-char
      // run behind a literal, the polynomial-backtracking shape CodeQL flags.
      const svgOf = (s) => s.slice(s.indexOf('<svg'), s.lastIndexOf('</svg>') + 6);
      assert.equal(svgOf(b), svgOf(a));
    });
  });

  describe('the CSS mirror', () => {
    // The kernel breaks lines and places labels against these sizes; the
    // stylesheets paint them. Silent drift wraps text to a width the glyphs do
    // not occupy, and hands the placement pass a box narrower than the paint.
    test('FS.point matches the .cart-series size the family paints', () => {
      const css = fs.readFileSync(path.join(ROOT, '_chart-family/chart-family.css'), 'utf8');
      const rule = css.match(/chart-frame\) \.cart-series \{[^}]*\}/)[0];
      const size = Number(rule.match(/font-size:\s*([\d.]+)px/)[1]);
      assert.equal(FS.point, size,
        '.scatter-label inherits its size from .cart-series — the kernel must wrap to the same number');
    });

    test('FS.size matches the .scatter-size-value size this component paints', () => {
      const css = fs.readFileSync(path.join(ROOT, 'scatter/scatter.styles.css'), 'utf8');
      const rule = css.match(/\.scatter-size-value \{[^}]*\}/)[0];
      assert.equal(FS.size, Number(rule.match(/font-size:\s*([\d.]+)px/)[1]));
    });

    test('the stylesheet is unlayered and anchored for the figure re-host', () => {
      const raw = fs.readFileSync(path.join(ROOT, 'scatter/scatter.styles.css'), 'utf8');
      // Comments talk ABOUT the rules; only real declarations are gated.
      const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
      assert.equal(/@layer/.test(css), false, 'engine CSS admits no @layer (HARD RULE #26)');
      assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(css), false, 'no hex literals (HARD RULE #3)');
      assert.equal(/^\s*margin\s*:\s*(?!0\s*;)/m.test(css), false, 'no margin (HARD RULE #20)');
      for (const sel of css.matchAll(/^(:is\([^)]*\)|section[^\s{]*)[^{]*\{/gm)) {
        assert.ok(/(?::is\(section\.scatter|^section[^\s{]*\.scatter)/.test(sel[0].trim()),
          `every selector must be anchored on the section: ${sel[0].trim()}`);
      }
      assert.ok(css.includes(':is(section.scatter, figure.chart-frame)'),
        'the figure re-host anchor must be present');
    });
  });
});
