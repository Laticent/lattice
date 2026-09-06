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
  pearson, trendNote, leastSquares, bubbleRadius, pickVariant,
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

    test('never prints a NEGATIVE TICK for a non-negative series', () => {
      // The wall is a TICK rule, not a domain rule. The domain still gets its
      // air below zero — clamping it pinned a point at 0 to the plot corner,
      // so a `bubble` mark hung twelve units outside the plot, and it put the
      // `0` tick exactly on the y axis where the x-tick cull deleted it.
      const d = domainFor([0, 5, 10]);
      assert.ok(d.min < 0, `expected air below zero, got ${d.min}`);
      for (const t of d.ticks) assert.ok(t >= 0, `tick ${t} is negative`);
      assert.ok(d.ticks.includes(0), 'the origin tick survives');
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

    test('the <desc> carries every point in the author\'s own units', () => {
      const desc = buildScatter(model, CTX, AXES).match(/<desc>([^<]*)<\/desc>/)[1];
      assert.match(desc, /Annual cost horizontal/);
      assert.match(desc, /Teams adopting vertical/);
      for (const name of ['Atlas', 'Borealis', 'Cardinal', 'Fathom']) {
        assert.ok(desc.includes(name), `${name} missing from the desc`);
      }
      assert.ok(desc.includes('$420k') && desc.includes('18%'), 'raw values missing from the desc');
    });

    test('the <desc> makes NO statistical claim the slide does not show', () => {
      // Anscombe's quartet: four datasets with visibly different shapes and one
      // correlation. The desc used to give all four the same sentence, and told
      // it only to the reader who cannot see the cloud and check it.
      const anscombe = [
        [[10, 8.04], [8, 6.95], [13, 7.58], [9, 8.81], [11, 8.33],
          [14, 9.96], [6, 7.24], [4, 4.26], [12, 10.84], [7, 4.82], [5, 5.68]],
        [[10, 9.14], [8, 8.14], [13, 8.74], [9, 8.77], [11, 9.26],
          [14, 8.10], [6, 6.13], [4, 3.10], [12, 9.13], [7, 7.26], [5, 4.74]],
      ];
      for (const set of anscombe) {
        const m = parseScatter(ul(set.map(([x, y], i) => [`E${i}`, `${x}`, `${y}`])));
        const desc = buildScatter(m, CTX, AXES).match(/<desc>([^<]*)<\/desc>/)[1];
        assert.doesNotMatch(desc, /\br = /, 'no correlation coefficient');
        assert.doesNotMatch(desc, /strongly|moderately|weakly|little relationship/);
      }
    });

    test('the <desc> states the trend line only when the trend line is drawn', () => {
      const rising = Array.from({ length: 6 }, (_, i) => [`E${i}`, `${i + 1}`, `${(i + 1) * 2}`]);
      const m = parseScatter(ul(rising));
      const withTrend = buildScatter(m, { ...CTX, classTokens: ['scatter', 'trend'] }, AXES);
      assert.match(withTrend, /class="scatter-trend"/);
      assert.match(withTrend.match(/<desc>([^<]*)<\/desc>/)[1], /least-squares fit is drawn over the 6 points/);
      // Below the floor the line is refused — so the sentence is refused too.
      const few = parseScatter(ul(rising.slice(0, 3)));
      const short = buildScatter(few, { ...CTX, classTokens: ['scatter', 'trend'] }, AXES);
      assert.doesNotMatch(short, /class="scatter-trend"/);
      assert.doesNotMatch(short.match(/<desc>([^<]*)<\/desc>/)[1], /least-squares/);
      // And a plain scatter never mentions a fit at all.
      assert.doesNotMatch(buildScatter(m, CTX, AXES).match(/<desc>([^<]*)<\/desc>/)[1], /least-squares/);
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
      assert.equal(/chart-leader/.test(spread), false,
        'a well-spread plot should need no leaders');
      const cluster = buildScatter(parseScatter(ul([
        ['Cardinal', '180', '52'], ['Granite', '182', '53'],
        ['Halyard', '178', '50'], ['Ironwood', '185', '54'],
        ['Fathom', '60', '74'], ['Atlas', '420', '18'],
      ])), CTX, AXES);
      assert.ok(/chart-leader/.test(cluster),
        'a tight cluster must state which name belongs to which dot');
    });
  });

  describe('geometry invariants', () => {
    test('bubble INK is proportional to the magnitude, over the floor', () => {
      // The claim is about AREA, so the assertion is about area. The old arm
      // measured the EXCESS-RADIUS ratio, which is 2 by construction of any
      // `rMin + t * (rMax - rMin)` map and says nothing about ink: under that
      // map a 4x value drew 2.7x the area, a 32% understatement, and this test
      // was green for it.
      const ink = (v) => Math.PI * (bubbleRadius(v, 400) ** 2 - BUBBLE.rMin ** 2);
      assert.ok(Math.abs(ink(400) / ink(100) - 4) < 1e-9,
        `ink ratio ${ink(400) / ink(100)}, expected 4`);
      assert.ok(Math.abs(ink(200) / ink(50) - 4) < 1e-9, 'and at any other pair');
      assert.equal(bubbleRadius(400, 400), BUBBLE.rMax);
      assert.equal(bubbleRadius(0, 400), BUBBLE.rMin, 'zero draws the visibility floor');
      // An absent magnitude is NOT a small bubble. `DOT_R` sits inside the
      // bubble range, so an unsized point decoded through the key as a real
      // magnitude nobody typed. It takes `rMin` and is flagged so the
      // stylesheet can draw it hollow.
      assert.equal(bubbleRadius(NaN, 400), BUBBLE.rMin);
      // Outside a bubble chart there is no scale to be smallest on, so the
      // plain dot is still the answer.
      assert.equal(bubbleRadius(NaN, 0), DOT_R);
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

    test('pearson is exact where it is defined, and NaN where it is not', () => {
      const up = [{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }];
      assert.ok(Math.abs(pearson(up) - 1) < 1e-9);
      assert.ok(Math.abs(pearson(up.map((p) => ({ x: p.x, y: -p.y }))) + 1) < 1e-9);
      assert.ok(Number.isNaN(pearson([{ x: 1, y: 1 }])), 'one point has no correlation');
      assert.ok(Number.isNaN(pearson([{ x: 1, y: 1 }, { x: 1, y: 9 }, { x: 1, y: 4 }])),
        'zero variance in x has no correlation');
    });

    test('trendNote names the count, so the claim is bounded by the data', () => {
      assert.match(trendNote(6), /over the 6 points/);
      assert.match(trendNote(12), /straight-line least-squares/);
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

describe('scatter — the dense cluster keeps every name reachable', () => {
  // The twelve-tool stress slide from `scatter.gallery.md`. Four entities land
  // within a dot's width of each other (measured: centre distances 2.5-4.6
  // against summed radii of 7.6), and the contract on that slide has two
  // halves, one for each question a reader asks.
  //
  // WHICH DOT IS THIS? Every entity is NAMED, no two names overprint, and every
  // name is ATTRIBUTABLE — either its own mark is the nearest thing to it, or it
  // carries a leader springing from that mark. Deliberately stated as the
  // property and not as "all four carry a leader": a label the pass manages to
  // seat against its own dot needs no line, and demanding one would pin the
  // geometry of the day rather than the contract.
  //
  // AND IN WHAT ORDER? Where two of these names end up sharing a column, the
  // column reads in the same order as the dots. That is the invariant
  // `placeLabels` buys with ORDER_COST — see the 2026-09-06 label-attribution
  // decision note.
  const STRESS = [
    ['Atlas', '$420k', '18%'], ['Borealis', '$310k', '24%'], ['Cardinal', '$180k', '52%'],
    ['Dovetail', '$95k', '61%'], ['Everline', '$240k', '31%'], ['Fathom', '$60k', '74%'],
    ['Granite', '$182k', '53%'], ['Halyard', '$178k', '50%'], ['Ironwood', '$185k', '54%'],
    ['Juniper', '$400k', '20%'], ['Keystone', '$88k', '66%'], ['Lantern', '$300k', '28%'],
  ];
  const html = () => transformSection(
    '<section class="scatter"><h2>Stress.</h2>'
    + '<p><code>Annual cost</code> <code>Teams adopting</code></p>'
    + `<ul>${ul(STRESS)}</ul></section>`,
    CTX,
  );

  test('all twelve entities are named on the plot', () => {
    const out = html();
    for (const [name] of STRESS) {
      assert.match(out, new RegExp(`>${name}<`), `${name} is labelled`);
    }
  });

  // Where a name is ANCHORED, read straight out of the markup: the `<text>`'s
  // own x, and the mean of its tspan baselines. Deliberately not a box — the
  // emitted markup carries no width, and reconstructing one here would re-derive
  // the kernel's estimator inside its own test. The anchor is enough for the
  // question this file asks (which dot is nearest); the BOX-level property lives
  // in test/unit/components/svg-label.test.js, where the boxes are real.
  const anchors = (out) => new Map([...out.matchAll(/<text [^>]*scatter-label[^>]*>[\s\S]*?<\/text>/g)]
    .map((m) => {
      const frag = m[0];
      const name = frag.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const ys = [...frag.matchAll(/y="([-\d.]+)"/g)].map((q) => Number(q[1]));
      return [name, {
        x: Number(/ x="([-\d.]+)"/.exec(frag)[1]),
        y: ys.reduce((a, b) => a + b, 0) / ys.length,
      }];
    }));

  test('every name in the blob is attributable — nearest its own dot, or led to it', () => {
    // Without one of the two, a name beside a four-dot blob attributes to
    // nothing. Counting leaders document-wide is not this assertion: the slide
    // carries leaders outside the cluster too, so a count passes while one of
    // these four silently loses its own. Each leader is matched to the dot it
    // springs from instead.
    const out = html();
    const circles = out.match(/<circle[^<>]{0,400}?\/>/g) || [];
    const dot = (tag) => ({
      cx: Number(/\scx="([-\d.]+)"/.exec(tag)[1]),
      cy: Number(/\scy="([-\d.]+)"/.exec(tag)[1]),
      r: Number(/\sr="([-\d.]+)"/.exec(tag)[1]),
      name: (/data-label="([^"]*)"/.exec(tag) || [])[1],
    });
    const dots = circles.filter((t) => /data-label="/.test(t)).map(dot);
    const leaders = [...out.matchAll(/<line class="chart-leader"[^<>]{0,200}?\/>/g)].map((m) => ({
      x1: Number(/x1="([-\d.]+)"/.exec(m[0])[1]),
      y1: Number(/y1="([-\d.]+)"/.exec(m[0])[1]),
    }));
    const at = anchors(out);
    for (const name of ['Ironwood', 'Granite', 'Cardinal', 'Halyard']) {
      const d = dots.find((q) => q.name === name);
      const a = at.get(name);
      assert.ok(d && a, `${name} is drawn and labelled`);
      // A leader springs from the rim of its own dot, so its origin sits within
      // a radius-and-a-bit of that centre. The four are ~2.5 units apart, so
      // this is deliberately tight enough to tell them apart only vertically —
      // which is all that is needed to catch a whole leader going missing.
      const led = leaders.some((l) => Math.hypot(l.x1 - d.cx, l.y1 - d.cy) <= d.r * 2);
      // The other half of the contract, and why this is not "all four carry a
      // leader": a name the pass seats against its own dot needs no line, and
      // demanding one would pin today's geometry rather than the promise.
      const own = Math.hypot(a.x - d.cx, a.y - d.cy);
      const seated = dots.every((q) => q.name === name || Math.hypot(a.x - q.cx, a.y - q.cy) >= own);
      assert.ok(led || seated,
        `${name} is neither led to its own mark nor seated nearest it`);
    }
  });

  test('the cluster really is unresolvable — this fixture still earns its name', () => {
    // Guards the premise above. If the geometry ever separates these four, the
    // reasoning in the decision note stops applying and this test says so.
    const out = html();
    const circles = out.match(/<circle[^<>]{0,400}?\/>/g) || [];
    const dot = (n) => {
      const tag = circles.find((t) => t.includes(`data-label="${n}"`));
      return tag && {
        cx: Number(/\scx="([-\d.]+)"/.exec(tag)[1]),
        cy: Number(/\scy="([-\d.]+)"/.exec(tag)[1]),
        r: Number(/\sr="([-\d.]+)"/.exec(tag)[1]),
      };
    };
    const pairs = [['Ironwood', 'Granite'], ['Granite', 'Cardinal'], ['Cardinal', 'Halyard']];
    for (const [a, b] of pairs) {
      const A = dot(a);
      const B = dot(b);
      assert.ok(A && B, `${a}/${b} are drawn`);
      const d = Math.hypot(A.cx - B.cx, A.cy - B.cy);
      assert.ok(d < A.r + B.r, `${a} and ${b} still overlap (d=${d.toFixed(2)}, r sum=${A.r + B.r})`);
    }
  });
});

