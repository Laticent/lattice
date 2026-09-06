/**
 * Unit: lib/components/chart/slope/slope.transform.js — kernel for the `slope`
 * chart-family member (the slopegraph, and its `dumbbell` variant).
 *
 * Section dispatch and the chart-frame wrap live in chart-family.js; this
 * kernel only produces the figure HTML. The substrate it consumes
 * (_chart-family/cartesian.js) has its own suite — nothing here re-tests ticks,
 * scales or the series DSL. What IS tested here is everything the slope decides
 * for itself:
 *
 *   1. The COLUMN MODEL — keyed by point name when every entity agrees,
 *      positional when they do not. This is the kernel's one genuinely
 *      non-obvious rule and each branch has an input that breaks the other.
 *   2. Parsing: the nested shape, the flat bail, detail-vs-data, the status
 *      pill, a malformed value.
 *   3. Geometry invariants: the value axis is inverted, the columns land on the
 *      plot edges, a lone point stays in its own column, and the dumbbell's bar
 *      spans first to last.
 *   4. The figure contract: the literal figure class, a viewBox, a `<desc>`
 *      that carries the numbers AND the rank change, and NO color literal.
 *   5. The CSS mirror: the stylesheet sets no font-size, because the kernel
 *      wraps every label to `cartesian.FS` and the shared `.cart-*` chrome
 *      paints it — a size declared in both places is a silent drift.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseSlope,
  buildSlope,
  buildDesc,
} = require('../../../lib/components/chart/slope/slope.transform');
const cart = require('../../../lib/components/chart/_chart-family/cartesian');

const CSS = path.join(__dirname, '../../../lib/components/chart/slope/slope.styles.css');

/**
 * Build the <ul> inner HTML the dispatcher hands the kernel.
 * `rows` is [label, [[pointName, value], …], statusPill?].
 */
function ul(rows) {
  return rows.map(([label, points, pill]) =>
    `<li>${label}${pill ? ` <code>${pill}</code>` : ''}` +
    `<ul>${(points || []).map(([n, v]) =>
      `<li>${n}${v == null ? '' : ` <code>${v}</code>`}</li>`).join('')}</ul></li>`).join('');
}

const TWO = ul([
  ['Atlas', [['2024', '12'], ['2026', '19']]],
  ['Borealis', [['2024', '18'], ['2026', '14']]],
]);

describe('slope kernel', () => {
  describe('parseSlope — the column model', () => {
    test('the nested point names become the two column headers, in author order', () => {
      const m = parseSlope(TWO);
      assert.deepEqual(m.headers, ['2024', '2026']);
      assert.equal(m.cols, 2);
      assert.equal(m.headerMismatch, false);
      assert.deepEqual(m.entities.map((e) => e.label), ['Atlas', 'Borealis']);
      assert.deepEqual(m.entities[0].points.map((p) => p.num), [12, 19]);
    });

    test('a point that does not parse leaves a HOLE — the survivor keeps its own column', () => {
      // The defect this pins: read positionally, Goodwill's FY26 value lands in
      // the FY24 column and the chart silently moves data a year.
      const m = parseSlope(ul([
        ['Margin', [['FY24', '-4.2'], ['FY26', '6.1']]],
        ['Goodwill', [['FY24', 'n/a'], ['FY26', '2.0']]],
      ]));
      assert.deepEqual(m.headers, ['FY24', 'FY26']);
      const g = m.entities.find((e) => e.label === 'Goodwill');
      assert.equal(g.points[0], null, 'the unparseable FY24 cell stays empty');
      assert.equal(g.points[1].num, 2);
      assert.deepEqual(g.present, [1]);
      assert.equal(g.first, 1);
      assert.equal(g.last, 1);
    });

    test('entities that name their points differently fall back to POSITIONAL', () => {
      // Keyed, this would mint four columns with half the cells empty.
      const m = parseSlope(ul([
        ['Atlas', [['FY24', '1'], ['FY26', '2']]],
        ['Borealis', [['2024', '4'], ['2026', '5']]],
      ]));
      assert.equal(m.cols, 2, 'two columns, not four');
      assert.equal(m.headerMismatch, true);
      assert.deepEqual(m.headers, ['FY24', 'FY26'], 'headers come from the first entity');
      assert.deepEqual(m.entities[1].points.map((p) => p.num), [4, 5]);
    });

    test('a third point is a third column, and a short entity keeps its slots', () => {
      const m = parseSlope(ul([
        ['Atlas', [['22', '1'], ['24', '2'], ['26', '3']]],
        ['Kestrel', [['22', '4'], ['26', '5']]],
      ]));
      assert.equal(m.cols, 3);
      assert.deepEqual(m.entities[0].present, [0, 1, 2]);
      assert.deepEqual(m.entities[1].present, [0, 2], 'the missing middle stays missing');
    });

    test('rank is computed per column, highest value first', () => {
      const m = parseSlope(TWO);
      assert.deepEqual(m.ranks[0].get(0), { rank: 2, of: 2 });  // Atlas 12 of {12,18}
      assert.deepEqual(m.ranks[1].get(0), { rank: 1, of: 2 });  // Atlas 19 of {19,14}
    });
  });

  describe('parseSlope — source shapes', () => {
    test('a FLAT list has no second value, so there is nothing to draw', () => {
      assert.equal(parseSlope('<li>Atlas <code>12</code></li><li>Borealis <code>18</code></li>'), null);
    });

    test('an empty list returns null', () => {
      assert.equal(parseSlope(''), null);
      assert.equal(parseSlope('<li></li>'), null);
    });

    test('a nested item with no numeric pill is DETAIL, not a data point', () => {
      const m = parseSlope(ul([
        ['Atlas', [['2024', '12'], ['2026', '19'], ['Won the Rhodes contract', null]]],
      ]));
      assert.equal(m.cols, 2, 'the prose bullet did not mint a third column');
      assert.match(m.entities[0].detail, /Won the Rhodes contract/);
    });

    test('a nested item whose pill is not a NUMBER is detail too', () => {
      const m = parseSlope(ul([['Atlas', [['2024', '12'], ['2026', '19'], ['Best in', 'EMEA']]]]));
      assert.equal(m.cols, 2);
      assert.match(m.entities[0].detail, /Best in/);
    });

    test('a status pill on the ENTITY is captured; anything else is ignored', () => {
      const m = parseSlope(ul([
        ['Atlas', [['a', '1'], ['b', '2']], 'fail'],
        ['Borealis', [['a', '3'], ['b', '4']], 'hot'],
      ]));
      assert.equal(m.entities[0].status, 'fail');
      assert.equal(m.entities[1].status, '', 'not in CHART_STATUS, so not invented into one');
    });

    test('magnitude suffixes are scale, and the raw pill is kept verbatim', () => {
      const m = parseSlope(ul([['Atlas', [['FY24', '$1.2M'], ['FY26', '800k']]]]));
      assert.equal(m.entities[0].points[0].num, 1200000);
      assert.equal(m.entities[0].points[1].num, 800000);
      assert.equal(m.entities[0].points[0].raw, '$1.2M');
    });

    test('an entity left FLAT among nested ones is reported, not silently dropped', () => {
      const m = parseSlope(
        '<li>Atlas <code>12</code></li>' +
        '<li>Borealis<ul><li>2024 <code>18</code></li><li>2026 <code>14</code></li></ul></li>');
      assert.equal(m.mixedDepth, true);
      assert.deepEqual(m.entities.map((e) => e.label), ['Borealis'],
        'a value with no column cannot be placed');
    });

    test('negatives and zero survive, and set the domain', () => {
      const m = parseSlope(ul([['A', [['x', '-4.2'], ['y', '0']]], ['B', [['x', '3'], ['y', '6']]]]));
      assert.equal(m.min, -4.2);
      assert.equal(m.max, 6);
    });
  });

  describe('buildSlope — the figure contract', () => {
    const html = buildSlope(parseSlope(TWO), { classTokens: ['slope'] });

    test('emits the declared figure class and one viewBox SVG', () => {
      assert.match(html, /<div class="slope-figure"/);
      assert.match(html, /<svg class="cart-svg slope-svg slope-slopegraph slope-quiet" viewBox="0 0 320 180"/);
      assert.match(html, /preserveAspectRatio="xMidYMid meet"/);
      assert.match(html, /role="img"/);
    });

    test('portrait takes the substrate viewBox, not a private one', () => {
      const p = buildSlope(parseSlope(TWO), { classTokens: ['slope'], orientation: 'portrait' });
      const v = cart.viewFor('portrait');
      assert.match(p, new RegExp(`viewBox="0 0 ${v.w} ${v.h}"`));
    });

    test('the kernel emits NO color literal — palette lives in CSS (HARD RULE #3)', () => {
      for (const tokens of [['slope'], ['slope', 'signal'], ['slope', 'dumbbell']]) {
        const out = buildSlope(parseSlope(TWO), { classTokens: tokens });
        assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(out), `hex literal in ${tokens.join(' ')}`);
        assert.ok(!/\brgba?\(/.test(out), `rgb() in ${tokens.join(' ')}`);
        assert.ok(!/\b(?:fill|stroke)="(?!none")/.test(out), `paint attribute in ${tokens.join(' ')}`);
      }
    });

    test('every mark carries the family texture hooks', () => {
      assert.match(html, /<polyline class="slope-line"[^>]*data-series="0"/);
      assert.match(html, /<polyline class="slope-line"[^>]*data-dir="up"/);
      assert.match(html, /<circle class="slope-dot"[^>]*data-series="1"/);
      const d = buildSlope(parseSlope(TWO), { classTokens: ['slope', 'dumbbell'] });
      assert.match(d, /<line class="slope-bar"[^>]*data-series="0"/);
      assert.match(d, /class="slope-dot slope-dot-from"/);
      assert.match(d, /class="slope-dot slope-dot-to"/);
    });

    test('the emphasis register rides the SVG ROOT class, so the article re-host keeps it', () => {
      // prose-projection re-hosts the bare <svg> and carries no variant class,
      // so a `section.slope.signal` selector would lose its paint there.
      assert.match(html, /<svg class="[^"]*\bslope-quiet\b/);
      assert.match(buildSlope(parseSlope(TWO), { classTokens: ['slope', 'signal'] }), /<svg class="[^"]*\bslope-signal\b/);
      const marked = buildSlope(parseSlope(ul([
        ['Atlas', [['a', '1'], ['b', '2']], 'fail'],
        ['Borealis', [['a', '3'], ['b', '4']]],
      ])), { classTokens: ['slope'] });
      assert.match(marked, /<svg class="[^"]*\bslope-marked\b/);
      assert.match(marked, /data-s="fail"/);
    });

    test('the shape is declared on the root, so the variants cannot share a paint rule by accident', () => {
      assert.match(html, /<svg class="[^"]*\bslope-slopegraph\b/);
      assert.match(buildSlope(parseSlope(TWO), { classTokens: ['slope', 'dumbbell'] }), /<svg class="[^"]*\bslope-dumbbell\b/);
    });

    test('detail becomes a template payload plus a speaker note; a plain slope emits neither', () => {
      const withDetail = buildSlope(parseSlope(ul([
        ['Atlas', [['2024', '12'], ['2026', '19'], ['Won the Rhodes contract', null]]],
        ['Borealis', [['2024', '18'], ['2026', '14']]],
      ])), { classTokens: ['slope'] });
      assert.match(withDetail, /<template class="chart-detail" data-mark="0">/);
      assert.match(withDetail, /<!-- Atlas \(12 to 19\): Won the Rhodes contract -->/);
      assert.ok(!html.includes('chart-detail'), 'no detail, no payload');
      assert.ok(!html.includes('<!--'), 'no detail, no note');
    });
  });

  describe('buildSlope — geometry invariants', () => {
    // The kernel is a string emitter, so the invariants are read back off the
    // emitted coordinates. Parsing them here is deliberate: it is the only way
    // to assert the SCALE without re-implementing it.
    const pts = (html) => [...html.matchAll(/<polyline class="slope-line"[^>]*points="([^"]+)"/g)]
      .map((m) => m[1].split(' ').map((p) => p.split(',').map(Number)));

    test('the value axis is inverted — a bigger number sits HIGHER on the slide', () => {
      const [atlas, borealis] = pts(buildSlope(parseSlope(TWO), { classTokens: ['slope'] }));
      assert.ok(atlas[1][1] < atlas[0][1], 'Atlas rose 12 to 19, so its second y is smaller');
      assert.ok(borealis[1][1] > borealis[0][1], 'Borealis fell 18 to 14, so its second y is larger');
      assert.ok(borealis[0][1] < atlas[0][1], 'at 2024, 18 sits above 12');
    });

    test('the two columns land on the plot edges, and both entities share them', () => {
      const [atlas, borealis] = pts(buildSlope(parseSlope(TWO), { classTokens: ['slope'] }));
      assert.equal(atlas[0][0], borealis[0][0]);
      assert.equal(atlas[1][0], borealis[1][0]);
      const plot = cart.plotBox({ view: cart.viewFor(), gutter: { left: 100, right: 100, top: 18, bottom: 8 } });
      assert.equal(atlas[0][0], cart.round2(plot.x0));
      assert.equal(atlas[1][0], cart.round2(plot.x1));
    });

    test('a lone point draws a dot and NO line, in the column it belongs to', () => {
      const html = buildSlope(parseSlope(ul([
        ['Margin', [['FY24', '-4.2'], ['FY26', '6.1']]],
        ['Goodwill', [['FY24', 'n/a'], ['FY26', '2.0']]],
      ])), { classTokens: ['slope'] });
      assert.equal(pts(html).length, 1, 'only the two-point entity gets a polyline');
      const cxs = [...html.matchAll(/<circle class="slope-dot"[^>]*cx="([\d.]+)"/g)].map((m) => Number(m[1]));
      const plot = cart.plotBox({ view: cart.viewFor(), gutter: { left: 100, right: 100, top: 18, bottom: 8 } });
      assert.equal(cxs.length, 3, 'two for Margin, one for Goodwill');
      assert.equal(cxs[2], cart.round2(plot.x1), 'Goodwill sits in FY26, not FY24');
    });

    test('the dumbbell bar spans first to last, and the dots sit on its ends', () => {
      const html = buildSlope(parseSlope(TWO), { classTokens: ['slope', 'dumbbell'] });
      const bar = /<line class="slope-bar"[^>]*x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/.exec(html);
      assert.ok(bar, 'a bar is emitted');
      const [, x1, y1, x2, y2] = bar.map(Number);
      assert.equal(y1, y2, 'a dumbbell row is horizontal');
      assert.ok(x2 > x1, 'Atlas rose 12 to 19, so the "to" dot is to the right');
      const from = /<circle class="slope-dot slope-dot-from"[^>]*cx="([\d.-]+)"/.exec(html);
      const to = /<circle class="slope-dot slope-dot-to"[^>]*cx="([\d.-]+)"/.exec(html);
      assert.equal(Number(from[1]), x1);
      assert.equal(Number(to[1]), x2);
    });

    test('every dumbbell row keeps its NAME — the y-axis cull must stay unreachable', () => {
      // buildCategoryLabels culls a y label whose block collides with the
      // previous survivor, and a culled row renders with no name at all. Ten
      // rows of two-line names lost five of them before the line count was
      // derived from the band pitch.
      const names = ['Platform Engineering', 'Payments Core', 'Identity Services',
        'Data Platform', 'Growth Marketing', 'Developer Relations', 'Trust and Safety',
        'Billing Operations', 'Partner Integrations', 'Corporate Security'];
      for (const n of [1, 4, 6, 8, 10]) {
        const rows = names.slice(0, n).map((label, i) =>
          [label, [['Plan', String(40 + 3 * i)], ['Actual', String(45 + 2 * i)]]]);
        const html = buildSlope(parseSlope(ul(rows)), { classTokens: ['slope', 'dumbbell'] });
        const labels = [...html.matchAll(/class="cart-cat"[\s\S]*?<\/text>/g)].length;
        assert.equal(labels, n, `${n} rows must emit ${n} names, got ${labels}`);
      }
    });

    test('the dumbbell axis spends the whole width on the data', () => {
      // The ticks are the nice ladder FILTERED to the real domain, not a domain
      // snapped out to whole steps — which on 10…31 would round to 10…40 and
      // draw every gap a quarter shorter than it is.
      const html = buildSlope(parseSlope(ul([
        ['A', [['x', '10'], ['y', '31']]],
        ['B', [['x', '11'], ['y', '30']]],
      ])), { classTokens: ['slope', 'dumbbell'] });
      const tickTexts = [...html.matchAll(/class="cart-tick"[^>]*>.*?<tspan[^>]*>([^<]+)<\/tspan>/g)]
        .map((m) => m[1]);
      assert.ok(tickTexts.length >= 2 && tickTexts.length <= 5, `2-5 ticks, got ${tickTexts.length}`);
      assert.ok(!tickTexts.includes('40'), 'no tick beyond the data');
    });
  });

  describe('printed values — one magnitude for the whole chart', () => {
    const vals = (html) => [...html.matchAll(/class="cart-value slope-value"[^>]*>(?:<tspan[^>]*>([^<]*)<\/tspan>)/g)]
      .map((m) => m[1]);

    test('a chart spanning k and M speaks ONE unit, taken from the axis it would have had', () => {
      // The raw pills are `$800k` and `$3.4M`; printing them verbatim puts two
      // magnitudes on one chart, and a per-value formatTick puts three.
      const html = buildSlope(parseSlope(ul([
        ['Atlas', [['2024', '$1.2M'], ['2026', '$3.4M']]],
        ['Borealis', [['2024', '$800k'], ['2026', '$2.9M']]],
      ])), { classTokens: ['slope'] });
      assert.deepEqual(vals(html), ['$1.2M', '$3.4M', '$0.8M', '$2.9M']);
    });

    test('the ordinary boardroom case is byte-identical to the authored pill', () => {
      const pct = buildSlope(parseSlope(ul([
        ['A', [['x', '31%'], ['y', '24%']]],
        ['B', [['x', '22%'], ['y', '29%']]],
      ])), { classTokens: ['slope'] });
      assert.deepEqual(vals(pct), ['31%', '24%', '22%', '29%']);
      const plain = buildSlope(parseSlope(ul([
        ['A', [['x', '15.4'], ['y', '16']]],
        ['B', [['x', '12'], ['y', '19']]],
      ])), { classTokens: ['slope'] });
      assert.deepEqual(vals(plain), ['15.4', '16', '12', '19']);
    });

    test('a MIXED-unit series adopts no affix — the substrate\'s honest read, and a lint smell', () => {
      // One metric per slope (see antiPatterns). Where an author mixes them the
      // shared affix logic drops the unit rather than asserting one of them.
      const html = buildSlope(parseSlope(ul([
        ['A', [['x', '31%'], ['y', '24%']]],
        ['B', [['x', '15.4'], ['y', '16']]],
      ])), { classTokens: ['slope'] });
      assert.deepEqual(vals(html), ['31', '24', '15.4', '16']);
    });

    test('the desc speaks the same vocabulary as the marks', () => {
      const d = buildDesc(parseSlope(ul([
        ['Atlas', [['2024', '$1.2M'], ['2026', '$3.4M']]],
        ['Borealis', [['2024', '$800k'], ['2026', '$2.9M']]],
      ])));
      assert.match(d, /Atlas \$1\.2M to \$3\.4M, up \$2\.2M/);
      assert.match(d, /Borealis \$0\.8M to \$2\.9M/);
      assert.ok(!/2200000/.test(d), 'no raw magnitude in the read-aloud string');
    });
  });

  describe('buildDesc — the only route to the data', () => {
    test('carries both values, the change AND the rank move', () => {
      const d = buildDesc(parseSlope(TWO));
      assert.match(d, /Slope from 2024 to 2026/);
      assert.match(d, /Atlas 12 to 19, up 7, rank 2 to 1 of 2/);
      assert.match(d, /Borealis 18 to 14, down 4, rank 1 to 2 of 2/);
    });

    test('an unchanged rank says so rather than repeating a number', () => {
      const d = buildDesc(parseSlope(ul([
        ['A', [['x', '10'], ['y', '20']]],
        ['B', [['x', '5'], ['y', '8']]],
      ])));
      assert.match(d, /A 10 to 20, up 10, held rank 1 of 2/);
    });

    test('a lone point is named as such, not silently dropped', () => {
      const d = buildDesc(parseSlope(ul([
        ['Margin', [['FY24', '-4.2'], ['FY26', '6.1']]],
        ['Goodwill', [['FY24', 'n/a'], ['FY26', '2.0']]],
      ])));
      assert.match(d, /Goodwill 2 at FY26 only/);
    });

    test('the desc is escaped, so author angle brackets cannot break the SVG', () => {
      const d = buildDesc(parseSlope(ul([['Leads <30 days', [['x', '1'], ['y', '2']]]])));
      assert.ok(!/<30/.test(d));
      assert.match(d, /&lt;30 days/);
    });
  });

  describe('the stress case renders', () => {
    const CASES = {
      'eight entities, four in a dead heat': ul([
        ['Atlas', [['2024', '12'], ['2026', '19']]],
        ['Borealis', [['2024', '18'], ['2026', '14']]],
        ['Cormorant', [['2024', '15'], ['2026', '16']]],
        ['Delphinus', [['2024', '15.4'], ['2026', '11']]],
        ['Equuleus', [['2024', '15.8'], ['2026', '17']]],
        ['Fornax', [['2024', '16.2'], ['2026', '13']]],
        ['Grus', [['2024', '9'], ['2026', '20']]],
        ['Hydra', [['2024', '20'], ['2026', '9']]],
      ]),
      'a single entity': ul([['Atlas', [['2024', '12'], ['2026', '19']]]]),
      'every value identical': ul([
        ['A', [['x', '50'], ['y', '50']]],
        ['B', [['x', '50'], ['y', '50']]],
      ]),
      'a 40-character label': ul([
        ['Northwest Regional Distribution Partners', [['2022', '31%'], ['2026', '24%']]],
        ['Kestrel', [['2022', '18%'], ['2026', '29%']]],
      ]),
      'three columns': ul([
        ['A', [['22', '31%'], ['24', '27%'], ['26', '24%']]],
        ['B', [['22', '18%'], ['24', '22%'], ['26', '29%']]],
      ]),
      'negatives and a zero': ul([
        ['A', [['x', '-4.2'], ['y', '6.1']]],
        ['B', [['x', '0'], ['y', '-1.5']]],
      ]),
    };
    for (const [name, src] of Object.entries(CASES)) {
      for (const tokens of [['slope'], ['slope', 'dumbbell'], ['slope', 'signal']]) {
        test(`${name} — ${tokens.join(' ')}`, () => {
          const model = parseSlope(src);
          assert.ok(model, 'parses');
          const html = buildSlope(model, { classTokens: tokens });
          assert.match(html, /<div class="slope-figure"/);
          assert.match(html, /<desc>/);
          assert.ok(!/NaN|undefined|Infinity/.test(html), 'no numeric leakage into the SVG');
        });
      }
    }
  });

  describe('the CSS mirror', () => {
    const css = fs.readFileSync(CSS, 'utf8');
    // Comments are stripped first: this file EXPLAINS why it carries no
    // `@layer` and no `margin`, so a raw text scan matches its own prose.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

    test('the stylesheet declares NO font-size — the shared chrome owns every label size', () => {
      // The kernel wraps to `cartesian.FS`, which mirrors chart-family.css
      // § Cartesian chrome and is gated there. A size declared HERE too would be
      // a second source of truth, and drift would wrap text to a width the
      // glyphs do not occupy.
      assert.ok(!/font-size/.test(rules), 'slope.styles.css must not set a font-size');
    });

    test('every label the kernel emits rides a shared `cart-*` class', () => {
      const html = buildSlope(parseSlope(TWO), { classTokens: ['slope'] });
      const classes = [...html.matchAll(/<text class="([^"]+)"/g)].map((m) => m[1]);
      assert.ok(classes.length > 0);
      for (const c of classes) {
        assert.match(c, /^cart-(series|value|axis-title)\b/, `"${c}" is not a shared register`);
      }
    });

    test('no @layer wrapper, and every selector is anchored for the figure re-host', () => {
      assert.ok(!/@layer/.test(rules), '@layer is inert in this bundle and loses the cascade');
      // Split a selector GROUP on top-level commas only — the anchor itself is
      // `:is(a, b)`, so a naive split cuts it in half and every assertion fails
      // on a fragment that was never a selector.
      const groups = (sel) => {
        const out = [];
        let depth = 0;
        let cur = '';
        for (const ch of sel) {
          if (ch === '(') depth++;
          if (ch === ')') depth--;
          if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
          cur += ch;
        }
        out.push(cur);
        return out.map((x) => x.trim()).filter(Boolean);
      };
      for (const sel of rules.split('}').map((b) => b.split('{')[0]).map((x) => x.trim()).filter(Boolean)) {
        for (const one of groups(sel)) {
          assert.match(one, /^:is\(section\.slope, figure\.chart-frame\)/, `unanchored selector: ${one}`);
        }
      }
    });

    test('no hex literal and no margin (HARD RULES #3 and #20)', () => {
      assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(rules), 'hex literal in slope.styles.css');
      assert.ok(!/(^|[\s;{])margin\s*:/.test(rules), 'margin in slope.styles.css');
    });
  });
});
