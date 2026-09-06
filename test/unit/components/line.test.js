/**
 * Unit: lib/components/chart/line/line.transform.js — the kernel for the `line`
 * chart-family member (the Cartesian trend chart, with its `area`,
 * `stacked-area` and `step` variants).
 *
 * Section dispatch and the `.chart-frame` wrap live in the family dispatcher;
 * this kernel only produces the figure. Covered here:
 *
 *   1. parseLine — the flat and nested shapes, the TRANSPOSE into series rows,
 *      the detail-vs-data rule, holes, and every reason to return null.
 *   2. variantOf — the deliberate downgrades (`area` with several series,
 *      `stacked-area` with one).
 *   3. The zero rule — the one decision a reader is most likely to challenge.
 *   4. Geometry invariants — a hole BREAKS the line, the stack's top band lands
 *      on the total, a step path is orthogonal, an area closes on the baseline.
 *   5. The palette-blind contract — no color literal reaches the output.
 *   6. The a11y contract — the `<desc>` carries the MOVEMENT, and every mark
 *      carries the slot attributes the texture rules key on.
 *   7. The stylesheet mirror — the kernel wraps text to the shared `cart-*`
 *      sizes, so this member's own CSS must not re-declare a font size.
 *
 * The shared substrate (`_chart-family/cartesian.js`) has its own suite —
 * ticks, scales, `parseSeries`, the painted chrome — and is not re-tested here.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseLine, buildLine, variantOf, includeZeroFor, segmentsOf, DOT_MIN_SPACING,
} = require('../../../lib/components/chart/line/line.transform');

const CSS_PATH = path.join(__dirname, '../../../lib/components/chart/line/line.styles.css');

// The <li> HTML the dispatcher hands a kernel, matching Marp Core / emulator
// output. `flat` is one li per point; `nested` is a group per category.
const flat = (rows) => rows
  .map(([label, value]) => `<li>${label}${value != null ? ` <code>${value}</code>` : ''}</li>`)
  .join('');
const nested = (groups) => groups
  .map(([cat, rows]) => `<li>${cat}<ul>${flat(rows)}</ul></li>`)
  .join('');

const build = (model, tokens = ['line']) => buildLine(model, { classTokens: tokens });
const paths = (html, cls) => html.match(new RegExp(`<path class="${cls}[^"]*"[^<>]*>`, 'g')) || [];
const dAttr = (tag) => tag.match(/ d="([^"]*)"/)[1];

describe('line kernel', () => {
  describe('parseLine — the flat shape', () => {
    test('reads one unnamed series across the authored categories', () => {
      const m = parseLine(flat([['Q1', '4.2'], ['Q2', '5.1'], ['Q3', '4.8']]));
      assert.deepEqual(m.cats, ['Q1', 'Q2', 'Q3']);
      assert.deepEqual(m.series, ['']);
      assert.equal(m.flat, true);
      assert.deepEqual(m.rows[0].map((p) => p.num), [4.2, 5.1, 4.8]);
    });

    test('keeps the author’s raw pill alongside the parsed number', () => {
      const m = parseLine(flat([['FY24', '$4.2M'], ['FY25', '$5.1M']]));
      assert.deepEqual(m.rows[0].map((p) => p.raw), ['$4.2M', '$5.1M']);
      // The magnitude suffix is SCALE, not decoration — that is what lets
      // `800k` and `1.2M` sit on one axis.
      assert.deepEqual(m.rows[0].map((p) => p.num), [4200000, 5100000]);
      assert.deepEqual(m.affix, { prefix: '$', suffix: '' });
    });

    test('never sorts — the authored order IS the axis order', () => {
      const m = parseLine(flat([['Q3', '9'], ['Q1', '1'], ['Q2', '5']]));
      assert.deepEqual(m.cats, ['Q3', 'Q1', 'Q2']);
      assert.deepEqual(m.rows[0].map((p) => p.num), [9, 1, 5]);
    });
  });

  describe('parseLine — the nested shape', () => {
    test('transposes categories x series into one row per series', () => {
      const m = parseLine(nested([
        ['Q1', [['Product', '2.4'], ['Services', '1.8']]],
        ['Q2', [['Product', '3.0'], ['Services', '2.2']]],
      ]));
      assert.deepEqual(m.series, ['Product', 'Services']);
      assert.equal(m.flat, false);
      assert.deepEqual(m.rows[0].map((p) => p.num), [2.4, 3.0]);
      assert.deepEqual(m.rows[1].map((p) => p.num), [1.8, 2.2]);
    });

    test('a category missing a series leaves a HOLE, not a zero', () => {
      const m = parseLine(nested([
        ['Q1', [['Product', '2.4'], ['Services', '1.8']]],
        ['Q2', [['Product', '3.0']]],
        ['Q3', [['Product', '3.4'], ['Services', '2.9']]],
      ]));
      assert.equal(m.rows[1][1], null, 'the absent point is null, not 0');
      assert.equal(m.rows[1][2].num, 2.9);
    });

    test('detail vs data is settled by whether the pill is a NUMBER', () => {
      const m = parseLine(
        '<li>Q1<ul>'
        + '<li>Product <code>2.4</code></li>'
        + '<li>Closed two weeks early</li>'
        + '<li>Best quarter in <code>EMEA</code></li>'
        + '</ul></li>'
        + '<li>Q2<ul><li>Product <code>3.0</code></li></ul></li>',
      );
      assert.deepEqual(m.series, ['Product'], 'a non-numeric pill is not a series');
      assert.match(m.marks[0].detail, /Closed two weeks early/);
      assert.match(m.marks[0].detail, /Best quarter in EMEA/);
    });
  });

  describe('parseLine — when there is nothing to draw', () => {
    test('an empty list returns null', () => {
      assert.equal(parseLine(''), null);
    });

    test('a list with no numeric pill at all returns null', () => {
      assert.equal(parseLine(flat([['Alpha'], ['Beta']])), null);
    });

    test('a single point returns null — one reading is not a trend', () => {
      assert.equal(parseLine(flat([['Q1', '5.2']])), null);
      assert.ok(parseLine(flat([['Q1', '5.2'], ['Q2', '5.4']])), 'two points is the floor');
    });

    test('a MIXED-DEPTH list is reported, and the flat category is a hole', () => {
      // One category written flat among nested ones belongs to no series.
      const m = parseLine(
        '<li>Q1<ul><li>Product <code>2.4</code></li></ul></li>'
        + '<li>Q2 <code>9</code></li>'
        + '<li>Q3<ul><li>Product <code>3.1</code></li></ul></li>',
      );
      assert.equal(m.mixedDepth, true, 'the model says so, and the docs name it');
      assert.equal(m.rows[0][1], null, 'the flat category carries no series point');
    });

    test('a malformed value is dropped rather than plotted at zero', () => {
      const m = parseLine(flat([['Q1', '4.2'], ['Q2', 'tbc'], ['Q3', '5.0']]));
      assert.equal(m.rows[0][1], null);
      assert.deepEqual(m.cats, ['Q1', 'Q2', 'Q3'], 'the category itself survives');
    });
  });

  describe('variantOf — the deliberate downgrades', () => {
    test('the bare class is a plain line', () => {
      assert.equal(variantOf(['line'], 3), 'line');
    });

    test('`area` with several series falls back to plain lines', () => {
      // Two opaque filled regions hide each other; the composition claim has
      // its own variant.
      assert.equal(variantOf(['line', 'area'], 1), 'area');
      assert.equal(variantOf(['line', 'area'], 2), 'line');
    });

    test('`stacked-area` with one series IS an area', () => {
      assert.equal(variantOf(['line', 'stacked-area'], 1), 'area');
      assert.equal(variantOf(['line', 'stacked-area'], 3), 'stacked-area');
    });

    test('`step` is independent of series count', () => {
      assert.equal(variantOf(['line', 'step'], 1), 'step');
      assert.equal(variantOf(['line', 'step'], 4), 'step');
    });
  });

  describe('the zero rule', () => {
    test('a filled chart ALWAYS reaches zero', () => {
      assert.equal(includeZeroFor('area', 4.1, 4.4), true);
      assert.equal(includeZeroFor('stacked-area', 4.1, 4.4), true);
    });

    test('a trend well above zero floats, so the shape fills the box', () => {
      assert.equal(includeZeroFor('line', 4.1, 4.4), false);
      assert.equal(includeZeroFor('step', 1200, 1690), false);
    });

    test('a trend that already comes near zero snaps to it', () => {
      assert.equal(includeZeroFor('line', 1, 100), true, 'min is 1% of max');
      assert.equal(includeZeroFor('line', 23, 100), false, 'min is 23% of max');
    });

    test('a negative series does NOT force the zero branch — zero is a tick anyway', () => {
      assert.equal(includeZeroFor('line', -0.4, 5.4), false);
      const html = build(parseLine(flat([['Q1', '-1.8'], ['Q2', '0'], ['Q3', '2.9']])));
      assert.match(html, /class="cart-zero"/, 'the zero rule is still drawn');
    });

    test('an area’s baseline is the axis: the fill closes on the zero line', () => {
      const html = build(parseLine(flat([['Jan', '8.2'], ['Feb', '7.6'], ['Mar', '9.6']])), ['line', 'area']);
      const area = paths(html, 'line-area')[0];
      const d = dAttr(area);
      const closing = d.slice(d.indexOf(' L', d.lastIndexOf('L') - 40));
      // The last two vertices share one y — the baseline — and the path closes.
      const ys = [...d.matchAll(/L[-\d.]+ ([-\d.]+)/g)].map((mm) => Number(mm[1]));
      assert.equal(ys[ys.length - 1], ys[ys.length - 2], 'the region closes on one flat baseline');
      assert.match(d, /Z$/);
      assert.ok(closing.length > 0);
    });
  });

  describe('geometry invariants', () => {
    test('segmentsOf splits a row into contiguous runs around its holes', () => {
      assert.deepEqual(segmentsOf([{}, {}, null, {}, {}]), [[0, 1], [3, 4]]);
      assert.deepEqual(segmentsOf([null, null]), []);
      assert.deepEqual(segmentsOf([{}, {}, {}]), [[0, 1, 2]]);
    });

    test('a hole BREAKS the line into two paths rather than bridging it', () => {
      const whole = build(parseLine(nested([
        ['Q1', [['A', '1'], ['B', '5']]],
        ['Q2', [['A', '2'], ['B', '6']]],
        ['Q3', [['A', '3'], ['B', '7']]],
      ])));
      const holed = build(parseLine(nested([
        ['Q1', [['A', '1'], ['B', '5']]],
        ['Q2', [['A', '2']]],
        ['Q3', [['A', '3'], ['B', '7']]],
      ])));
      assert.equal(paths(whole, 'line-path').length, 2, 'two whole series, two paths');
      // B is now two runs of one point each — no path at all, two lone dots.
      assert.equal(paths(holed, 'line-path').length, 1);
      assert.equal((holed.match(/line-dot-lone/g) || []).length, 2);
    });

    test('the top of a stack lands exactly on the running total', () => {
      const edgeYs = (groups) => {
        const html = build(parseLine(nested(groups)), ['line', 'stacked-area']);
        const edges = paths(html, 'line-path line-edge').map(dAttr);
        return {
          count: paths(html, 'line-band').length,
          top: [...edges[edges.length - 1].matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((mm) => Number(mm[2])),
        };
      };
      // Totals equal across both categories, from series that individually
      // move — so a FLAT top edge is proof the bands are summing, not just
      // tracking their own series.
      const level = edgeYs([
        ['FY24', [['L', '6'], ['S', '3'], ['P', '1']]],
        ['FY25', [['L', '4'], ['S', '4'], ['P', '2']]],
      ]);
      assert.equal(level.count, 3, 'one band per series');
      assert.equal(level.top[0], level.top[1], '9 and 9: the total did not move');

      // And when the total DOES grow, the top edge climbs (smaller y).
      const rising = edgeYs([
        ['FY24', [['L', '6'], ['S', '3'], ['P', '1']]],
        ['FY25', [['L', '5'], ['S', '4'], ['P', '2']]],
      ]);
      assert.ok(rising.top[1] < rising.top[0], '10 then 11: the stack rises');
    });

    test('a step path is orthogonal — plateaus and jumps, never a diagonal', () => {
      const html = build(parseLine(flat([['Q1', '1200'], ['Q2', '1200'], ['Q3', '1450']])), ['line', 'step']);
      const d = dAttr(paths(html, 'line-path')[0]);
      assert.match(d, /^M[\d.]+ [\d.]+ H/);
      assert.ok(!/L/.test(d), 'no diagonal segment: a step never interpolates');
      assert.ok(/V/.test(d), 'the jump is a vertical');
    });

    test('a plain line IS interpolated — the two variants differ in the path', () => {
      const m = parseLine(flat([['Q1', '1200'], ['Q2', '1200'], ['Q3', '1450']]));
      const d = dAttr(paths(build(m), 'line-path')[0]);
      assert.match(d, /^M[\d.]+ [\d.]+ L/);
      assert.ok(!/[HV]/.test(d));
    });

    test('dots are a function of density, not of taste', () => {
      const sparse = build(parseLine(flat(
        Array.from({ length: 6 }, (_, i) => [`P${i}`, String(10 + i)]),
      )));
      const dense = build(parseLine(flat(
        Array.from({ length: 24 }, (_, i) => [`P${i}`, String(10 + i)]),
      )));
      assert.ok((sparse.match(/class="line-dot"/g) || []).length === 6, 'six points, six dots');
      assert.equal(dense.match(/class="line-dot"/g), null, 'at 24 points the dots would bead the line');
      assert.ok(DOT_MIN_SPACING > 0);
    });

    test('a stacked area never draws dots — they would sit on a filled band', () => {
      const html = build(parseLine(nested([
        ['FY24', [['L', '6'], ['S', '3']]],
        ['FY25', [['L', '5'], ['S', '4']]],
      ])), ['line', 'stacked-area']);
      assert.equal(html.match(/class="line-dot"/g), null);
    });
  });

  describe('direct labeling, and the legend it falls back to', () => {
    test('a series is named at the end of its own line, carrying its last value', () => {
      const html = build(parseLine(nested([
        ['Q1', [['Product', '2.4'], ['Services', '1.8']]],
        ['Q2', [['Product', '3.0'], ['Services', '2.2']]],
      ])));
      assert.match(html, /class="cart-series line-series"[^<>]*data-cat="0"/);
      assert.match(html, /<tspan[^<>]*>Product 3\.0<\/tspan>/);
      assert.match(html, /<tspan[^<>]*>Services 2.2<\/tspan>/);
      assert.equal(html.includes('chart-key'), false, 'no legend when direct labeling fits');
    });

    test('a name too long for the right column falls back to the shared key', () => {
      const html = build(parseLine(nested([
        ['H1', [['Strategic Alliance Partners', '12.4'], ['Regional Distribution Network', '9.8']]],
        ['H2', [['Strategic Alliance Partners', '18.2'], ['Regional Distribution Network', '6.2']]],
      ])));
      assert.match(html, /chart-key/, 'the legend took over');
      assert.equal(html.includes('class="cart-series line-series"'), false, 'and the direct labels are gone');
      // The key must carry the endpoint values too, or the fallback loses data
      // the direct label was carrying.
      assert.match(html, /18\.2/);
    });

    test('the values are dropped for EVERY series or for none', () => {
      // `Northern Region Total` + ` 12.4` does not fit one line, so the whole
      // chart degrades to names only rather than labeling some series richer
      // than others.
      const html = build(parseLine(nested([
        ['H1', [['Northern Region', '12.4'], ['South', '9.8']]],
        ['H2', [['Northern Region', '18.2'], ['South', '6.2']]],
      ])));
      // Split on the close tag instead of a lazy any-char run behind a literal
      // (the polynomial-backtracking shape CodeQL flags).
      const names = html.split('class="cart-series line-series"').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('</text>')));
      const withValue = names.filter((t) => /\d/.test(t)).length;
      assert.ok(withValue === 0 || withValue === names.length, 'all or nothing');
    });

    test('a flat series labels its endpoint value alone — there is no name', () => {
      const html = build(parseLine(flat([['Jan', '82'], ['Feb', '78'], ['Mar', '104']])));
      assert.match(html, /class="cart-value line-endvalue"/);
      assert.equal(html.includes('class="cart-series line-series"'), false);
    });
  });

  describe('the figure contract', () => {
    const m = parseLine(nested([
      ['Q1', [['Product', '2.4'], ['Services', '1.8']]],
      ['Q2', [['Product', '3.0'], ['Services', '2.2']]],
    ]));

    test('the figure class is present LITERALLY, as the kernel gate requires', () => {
      const html = build(m);
      assert.ok(html.includes('class="line-figure"'), 'checkChartKernels text-matches this');
      assert.match(html, /data-variant="line"/);
    });

    test('the root svg carries a viewBox and the family aspect ratio', () => {
      assert.match(build(m), /<svg class="cart-svg line-svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid meet" role="img">/);
    });

    test('the root comes from the shared emitter, so the a11y contract is intact', () => {
      // buildSvgRoot owns viewBox + preserveAspectRatio + role and escapes the
      // title/desc; a hand-written root is seven chances to drop a piece.
      const html = build(m);
      assert.equal((html.match(/role="img"/g) || []).length, 1);
      assert.match(html, /<title>[^<]+<\/title><desc>/, 'title then desc, in that order');
      const amped = build(parseLine(nested([
        ['Q1', [['Ops & IT', '2']]],
        ['Q2', [['Ops & IT', '3']]],
      ])));
      assert.match(amped, /<desc>[^<]*Ops &amp; IT/, 'the desc is escaped by the emitter');
    });

    test('portrait takes the family’s taller box', () => {
      const html = buildLine(m, { classTokens: ['line'], orientation: 'portrait' });
      assert.match(html, /viewBox="0 0 320 300"/);
    });

    test('NO color literal reaches the output — palette lives in CSS', () => {
      for (const tokens of [['line'], ['line', 'area'], ['line', 'stacked-area'], ['line', 'step']]) {
        const html = build(m, tokens);
        assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(html), false, `hex literal in ${tokens.join(' ')}`);
        assert.equal(/\brgba?\(/.test(html), false, `rgb() in ${tokens.join(' ')}`);
        assert.equal(/\b(?:red|blue|green|navy|teal|orange|purple)\b/i.test(html), false);
      }
    });

    test('a filled variant references the family gradient by a UNIQUE id', () => {
      const one = build(m, ['line', 'stacked-area']);
      const two = build(m, ['line', 'stacked-area']);
      const idOf = (h) => h.match(/<linearGradient id="([^"]+)"/)[1];
      assert.notEqual(idOf(one), idOf(two), 'two charts on one slide must not share stops');
      // The stops name TOKENS, which is the family idiom and not a color.
      assert.match(one, /var\(--chart-cat-1-hue\)/);
    });

    test('every mark carries the slot attributes the texture rules key on', () => {
      const stacked = build(m, ['line', 'stacked-area']);
      assert.match(stacked, /<path class="line-band" data-cat="1"/, 'filled marks carry data-cat');
      assert.match(stacked, /class="line-path line-edge" data-cat="1" data-series="1"/);
      const plain = build(m);
      assert.match(plain, /<path class="line-path" data-cat="0" data-series="0"/, 'stroked marks carry data-series');
      assert.match(plain, /<circle class="line-dot" data-cat="0"/);
      assert.match(plain, /style="--i:1"/, 'and the family --i index');
    });

    test('detail rides the category band and folds into the speaker note', () => {
      const withDetail = parseLine(
        '<li>Q1 <code>4</code><ul><li>Closed two weeks early</li></ul></li>'
        + '<li>Q2 <code>6</code></li>',
      );
      const html = build(withDetail);
      assert.match(html, /<rect class="line-hit" data-mark="0"/);
      assert.match(html, /<template class="chart-detail" data-mark="0">/);
      assert.match(html, /<!-- Q1 \(4\): Closed two weeks early -->/);
    });

    test('a chart with no detail emits neither the hit band nor the note', () => {
      const html = build(m);
      assert.equal(html.includes('line-hit'), false);
      assert.equal(html.includes('chart-detail'), false);
      assert.equal(html.includes('<!--'), false);
    });
  });

  describe('the <desc> — the only route to the data for a screen reader', () => {
    test('it carries the MOVEMENT, not just the endpoint values', () => {
      const html = build(parseLine(nested([
        ['Q1 2025', [['Enterprise', '4.1'], ['Services', '1.2']]],
        ['Q2 2025', [['Enterprise', '4.4'], ['Services', '2.6']]],
        ['Q3 2025', [['Enterprise', '3.5'], ['Services', '5.2']]],
      ])));
      const desc = html.match(/<desc>([^<]*)<\/desc>/)[1];
      assert.match(desc, /3 points, first Q1 2025, last Q3 2025/);
      assert.match(desc, /Enterprise — 4\.1 at Q1 2025, 3\.5 at Q3 2025, down 15%/);
      assert.match(desc, /peak 4\.4 at Q2 2025/, 'a peak between the ends is named');
      assert.match(desc, /Services — 1\.2 at Q1 2025, 5\.2 at Q3 2025, up 333%/);
    });

    test('it says how many points were not reported', () => {
      const html = build(parseLine(nested([
        ['Q1', [['A', '1'], ['B', '5']]],
        ['Q2', [['A', '2']]],
        ['Q3', [['A', '3'], ['B', '7']]],
      ])));
      assert.match(html, /1 point not reported/);
    });

    test('a stacked area also states the total', () => {
      const html = build(parseLine(nested([
        ['FY24', [['L', '6'], ['S', '3']]],
        ['FY25', [['L', '5'], ['S', '4']]],
      ])), ['line', 'stacked-area']);
      assert.match(html, /Total — 9 at FY24, 9 at FY25/);
    });

    test('the title names the VARIANT, because the variant is the claim', () => {
      assert.match(build(parseLine(flat([['a', '1'], ['b', '2']]))), /<title>Line chart<\/title>/);
      assert.match(build(parseLine(flat([['a', '1'], ['b', '2']])), ['line', 'area']), /<title>Area chart<\/title>/);
      assert.match(build(parseLine(flat([['a', '1'], ['b', '2']])), ['line', 'step']), /<title>Step line chart<\/title>/);
    });
  });

  describe('the stress case', () => {
    const sample = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../../lib/components/chart/line/line.manifest.json'), 'utf8'),
    ).stressDoc.sample;

    test('the manifest’s own stress sample parses and builds on every variant', () => {
      // Rebuild the <li> HTML the dispatcher would hand us from the markdown.
      const lines = sample.split('\n').filter((l) => /^\s*-\s/.test(l));
      let html = '';
      let open = false;
      for (const raw of lines) {
        const depth = raw.match(/^\s*/)[0].length;
        const body = raw.replace(/^\s*-\s/, '').replace(/`([^`]*)`/g, '<code>$1</code>');
        if (depth === 0) {
          if (open) { html += '</ul></li>'; open = false; }
          html += `<li>${body}<ul>`;
          open = true;
        } else {
          html += `<li>${body}</li>`;
        }
      }
      if (open) html += '</ul></li>';

      const m = parseLine(html);
      assert.ok(m, 'the stress sample parses');
      assert.equal(m.series.length, 6, 'six series, the family cap');
      assert.equal(m.cats.length, 6);
      assert.equal(m.rows[4][4], null, 'the authored hole survives');
      for (const tokens of [['line'], ['line', 'area'], ['line', 'stacked-area'], ['line', 'step']]) {
        assert.doesNotThrow(() => build(m, tokens), `${tokens.join(' ')} threw`);
      }
    });

    test('a longest-realistic label, a zero and a negative all render', () => {
      const m = parseLine(nested([
        ['Financial Year 2024 (restated)', [['Public Sector Frameworks', '0']]],
        ['Financial Year 2025 (restated)', [['Public Sector Frameworks', '-0.4']]],
        ['Financial Year 2026 (forecast)', [['Public Sector Frameworks', '3.1']]],
      ]));
      assert.doesNotThrow(() => build(m));
      const html = build(m);
      assert.match(html, /class="cart-zero"/, 'the zero rule anchors the sign');
    });
  });

  describe('the stylesheet mirror', () => {
    const raw = fs.readFileSync(CSS_PATH, 'utf8');
    // Comment prose in this file NAMES the traps it avoids (`@layer`,
    // `nth-child`), so the assertions below have to read the rules, not the
    // documentation of the rules.
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

    test('the stylesheet declares NO font size — the shared cart-* rules own it', () => {
      // The kernel wraps its labels to `cart-series` / `cart-value` / `cart-cat`
      // sizes, which chart-family.css paints and cartesian.test.js pins. A size
      // declared here would silently break lines to a width the glyphs do not
      // occupy.
      assert.equal(/font-size/.test(css), false);
    });

    test('no hex literal and no margin (HARD RULES #3 and #20)', () => {
      assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(css), false);
      assert.equal(/(^|[\s;{])margin\s*:/.test(css), false);
    });

    test('every rule is anchored for the Read·Article figure re-host', () => {
      const selectors = css
        .split('}')
        .map((block) => block.split('{')[0].trim())
        .filter(Boolean);
      for (const sel of selectors) {
        assert.ok(
          sel.includes('figure.chart-frame') || sel.startsWith('section.line'),
          `unanchored selector: ${sel}`,
        );
      }
    });

    test('the stylesheet is unlayered (cascade.md)', () => {
      assert.equal(/@layer/.test(css), false);
    });

    test('marks cycle by data-cat, never by nth-child', () => {
      assert.equal(/nth-child/.test(css), false);
      assert.match(css, /\[data-cat="5"\]/, 'all six categorical slots are painted');
    });
  });
});

// ── Defects the adversarial trio confirmed ─────────────────────────────────
//
// Each arm reproduces something a reader would have seen on a slide, and each
// was invisible to a 51-green suite because the old assertions read constants
// back out of the module or matched a substring that survives the bug.
describe('line — defects the adversarial trio confirmed', () => {
  const desc = (html) => html.match(/<desc>([^<]*)<\/desc>/)[1];

  test('a long category label stays inside the viewBox', () => {
    // The gutters used to GROW to hold the half-width of a centered edge label;
    // `left` was clamped, so past ~20 characters the first label simply painted
    // outside the 320-unit viewBox, and `right` was not clamped at all, so an
    // 80-character label squeezed the plot to a third of the canvas.
    const long = ['Financial Year 2024 (restated)', 'Financial Year 2025 (restated)',
      'Financial Year 2026 (forecast)'];
    const html = build(parseLine(flat(long.map((c, i) => [c, `${4 + i}`]))));
    // The run is BOUNDED: a literal prefix followed by an unbounded `[^>]*`
    // restarts at every occurrence of the prefix, which backtracks
    // polynomially (CodeQL js/polynomial-redos).
    const xs = [...html.matchAll(/class="cart-cat"[^<>]{0,80}><tspan x="([-\d.]+)"/g)]
      .map((m) => Number(m[1]));
    assert.ok(xs.length >= 2, 'the edge labels survive the cull');
    for (const x of xs) assert.ok(x >= 0 && x <= 320, `a category label anchored at ${x}`);
    // And the plot never inverts, whatever the label length.
    const huge = build(parseLine(flat([['X'.repeat(140), '4'], ['Y', '5']])));
    const [, w] = huge.match(/viewBox="0 0 (\d+) (\d+)"/) || [];
    assert.ok(Number(w) > 0);
  });

  test('the plot-edge rule is drawn ONLY where the axis reaches zero', () => {
    // Signed: `buildGrid` draws the real zero rule, and a second one at the
    // plot edge reads as the floor.
    const signed = build(parseLine(flat([['Q1', '-1.8'], ['Q2', '0.5'], ['Q3', '2.9']])));
    assert.doesNotMatch(signed, /class="cart-axis"/);
    assert.match(signed, /class="cart-zero"/);
    // Floating: the bottom of the plot is not the baseline either, and the rule
    // sat a couple of units under the lowest gridline, reading as a duplicate
    // whose heavier half a reader takes for zero.
    assert.doesNotMatch(build(parseLine(flat([['Q1', '4.1'], ['Q2', '4.4'], ['Q3', '4.2']]))),
      /class="cart-axis"/);
    // Zero-anchored: one rule, and it IS the baseline.
    const zeroed = build(parseLine(flat([['Q1', '0'], ['Q2', '3'], ['Q3', '5']])));
    assert.match(zeroed, /class="cart-axis"/);
  });

  test('the seventh series is NAMED in the description, never just dropped', () => {
    const seven = nested([
      ['Q1', Array.from({ length: 7 }, (_, i) => [`S${i}`, `${i + 1}`])],
      ['Q2', Array.from({ length: 7 }, (_, i) => [`S${i}`, `${i + 2}`])],
    ]);
    const html = build(parseLine(seven));
    assert.match(desc(html), /Not shown, past the six-series limit: S6/);
  });

  test('a duplicate series name does not stretch the axis with a value nothing draws', () => {
    const m = parseLine(nested([
      ['Q1', [['EMEA', '2.4'], ['EMEA', '9.9'], ['APAC', '5']]],
      ['Q2', [['EMEA', '3.0'], ['EMEA', '1.1'], ['APAC', '6']]],
    ]));
    assert.equal(m.max, 6, 'the domain is the DRAWN maximum, not the parsed one');
    assert.equal(m.min, 2.4);
  });

  test('one real point across several categories is refused, like one category', () => {
    // The floor counted CATEGORIES, so a half-filled draft rendered the "lone
    // dot adrift in an empty box" the refusal is written to prevent.
    assert.equal(parseLine(flat([['Q1', '4.2'], ['Q2', 'tbc'], ['Q3', 'n/a']])), null);
    assert.ok(parseLine(flat([['Q1', '4.2'], ['Q2', 'tbc'], ['Q3', '5.0']])));
  });

  test('an isolated reading gets ONE circle, not two at the same point', () => {
    const html = build(parseLine(nested([
      ['Q1', [['A', '1'], ['B', '5']]],
      ['Q2', [['A', '2']]],
      ['Q3', [['A', '3'], ['B', '7']]],
    ])));
    const circles = (html.match(/<circle/g) || []).length;
    assert.equal(circles, 5, 'five reported points, five dots');
  });

  test('a series that stops early says WHEN it stopped', () => {
    const html = build(parseLine(nested([
      ['Q1', [['Enterprise', '4.1'], ['Pilot', '1.2']]],
      ['Q2', [['Enterprise', '4.6'], ['Pilot', '1.4']]],
      ['Q3', [['Enterprise', '5.2']]],
      ['Q4', [['Enterprise', '6.0']]],
    ])));
    // The label is painted in the right gutter whatever the series does, so the
    // text has to carry the category or it asserts a Q4 value that never was.
    assert.match(html, /Pilot 1\.4 at Q2/);
  });

  test('the description names the trough, not only the peak', () => {
    const d = desc(build(parseLine(flat([
      ['Jan', '8.2'], ['Feb', '7.4'], ['Mar', '6.9'], ['Apr', '7.8'], ['Jun', '9.6'],
    ]))));
    assert.match(d, /low 6\.9 at Mar/);
  });

  test('the description names first and last, so a repeating axis is unambiguous', () => {
    const d = desc(build(parseLine(flat([
      ['Q1', '1200'], ['Q2', '1200'], ['Q3', '1200'],
      ['Q4', '1450'], ['Q1', '1450'], ['Q2', '1690'],
    ])), ['line', 'step']));
    assert.match(d, /first Q1, last Q2/);
  });

  test('a stacked total is formatted like every other number on the chart', () => {
    const d = desc(build(parseLine(nested([
      ['FY24', [['License', '$6.2M'], ['Support', '$2.8M'], ['Services', '$1.4M']]],
      ['FY25', [['License', '$5.6M'], ['Support', '$3.4M'], ['Services', '$2.0M']]],
    ])), ['line', 'stacked-area']));
    assert.doesNotMatch(d, /Total — \d{7}/, 'never eight bare digits');
    assert.match(d, /Total — \$1[01](\.\d)?M at FY24/);
  });
});
