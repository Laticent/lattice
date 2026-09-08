/**
 * Unit: lib/components/chart/bar/bar.transform.js — kernel for the `bar`
 * chart-family member.
 *
 * Section dispatch and the chart-frame wrap live in chart-family.js; the shared
 * plot substrate (ticks, scales, gutters, chrome) is covered by
 * test/unit/components/cartesian.test.js. What is tested HERE is the part this
 * kernel decides for itself:
 *
 *   1. Parsing — the flat and nested shapes, detail-vs-data, the empty bail.
 *   2. Shape resolution — which of the four forms a slide gets, including the
 *      two decisions that are measured rather than declared: the value axis and
 *      the automatic switch to the row form.
 *   3. Geometry — bars start at zero, negatives hang below it, a diverging
 *      domain is symmetric, no bar escapes its plot.
 *   4. Emission — the figure class, the viewBox, a `<desc>` carrying the data
 *      AND the ranking, the texture hooks, and NO color anywhere.
 *   5. The stylesheet mirror — the class names the kernel emits are the ones
 *      the stylesheet paints, and the stylesheet does not declare a `fill` that
 *      would beat the kernel's gradient attribute.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseBar, buildBar, transformSection,
  resolveShape, wantsValueAxis, padFor, domainFor, bestTicks, marksOf,
  rowGutterFor, maxBarFor, maxRowBarFor, GUT_COL_NOAXIS,
} = require('../../../lib/components/chart/bar/bar.transform');
const cart = require('../../../lib/components/chart/_chart-family/cartesian');

const CSS = fs.readFileSync(
  path.join(__dirname, '../../../lib/components/chart/bar/bar.styles.css'), 'utf8');
// The rules only — the file's prose explains the traps by name (`nth-child`,
// `@layer`, `margin`, `fill`), so a check run over the comments would fail on
// the documentation of the very thing it is guarding.
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** The <ul> inner HTML the dispatcher hands the kernel, flat form. */
function ul(rows) {
  return rows
    .map(([label, value]) => `<li>${label}${value != null ? ` <code>${value}</code>` : ''}</li>`)
    .join('');
}

/** The nested form: [[category, [[series, value], …]], …]. */
function nested(groups) {
  return groups.map(([label, kids]) =>
    `<li>${label}<ul>${kids.map(([k, v]) =>
      `<li>${k}${v != null ? ` <code>${v}</code>` : ''}</li>`).join('')}</ul></li>`).join('');
}

const REGIONS = [['North America', '$4.2M'], ['EMEA', '$3.1M'], ['APAC', '$1.8M'], ['LATAM', '$0.6M']];
const SIGNED = [['Platform', '4.1'], ['Services', '2.6'], ['Hardware', '-1.2'], ['Legacy', '-2.4']];
const LONG_NAMES = [
  ['Commercial Banking', '182'], ['Wealth & Asset Management', '154'],
  ['Global Transaction Services', '121'], ['Insurance & Protection', '96'],
  ['Markets & Securities', '74'], ['Retail & Small Business', '61'],
];
const ctx = (tokens = []) => ({ cls: ['bar', ...tokens].join(' '), classTokens: ['bar', ...tokens] });

// Every BAR in the figure, as {x, y, width, height, ...attrs}. Matched on the
// mark class, not the element: a grouped chart's key is built from <rect>
// swatches that are chrome, not data.
function rects(html) {
  return [...html.matchAll(/<rect class="bar-mark[^<>]*>/g)].map((m) => {
    const out = {};
    // The leading `\s` and the bounded tail are load-bearing: `[a-z-]+` behind
    // no delimiter backtracks polynomially on a long run of `-` (CodeQL
    // js/polynomial-redos). A space cannot be matched by the name class, so a
    // failed attempt cannot restart inside a name it already rejected.
    for (const a of m[0].matchAll(/\s([a-z][a-z-]{0,30})="([^"]*)"/g)) {
      out[a[1]] = /^(x|y|width|height)$/.test(a[1]) ? Number(a[2]) : a[2];
    }
    return out;
  });
}

describe('bar kernel', () => {
  describe('parseBar — source parsing', () => {
    test('reads the flat shape into one group per item, values scaled', () => {
      const m = parseBar(ul(REGIONS));
      assert.equal(m.flat, true);
      assert.deepEqual(m.groups.map((g) => g.label), ['North America', 'EMEA', 'APAC', 'LATAM']);
      assert.deepEqual(m.groups.map((g) => g.num), [4.2e6, 3.1e6, 1.8e6, 0.6e6]);
      // The authored affix survives onto the axis; the magnitude letter does not
      // (parseValue already folded it into the number).
      assert.equal(m.affix.prefix, '$');
      assert.equal(m.affix.suffix, '');
    });

    test('reads the nested shape as multi-series, series in first-seen order', () => {
      const m = parseBar(nested([
        ['Americas', [['Plan', '3.2'], ['Actual', '3.9']]],
        ['EMEA', [['Plan', '2.6'], ['Actual', '3.1']]],
      ]));
      assert.equal(m.flat, false);
      assert.deepEqual(m.series, ['Plan', 'Actual']);
      assert.deepEqual(m.groups[0].points.map((p) => p.num), [3.2, 3.9]);
    });

    test('a nested item whose pill is NOT a number is detail, not a data point', () => {
      const m = parseBar(
        '<li>Q1 <code>4.2</code><ul><li>Closed two weeks early</li>' +
        '<li>Best quarter in <code>EMEA</code></li></ul></li><li>Q2 <code>5.1</code></li>');
      assert.equal(m.flat, true, 'a non-numeric pill must not mint a series');
      assert.deepEqual(m.groups[0].detail, ['Closed two weeks early', 'Best quarter in EMEA']);
      assert.equal(m.groups[0].num, 4.2);
    });

    test('returns null when there is nothing to draw', () => {
      assert.equal(parseBar(''), null);
      assert.equal(parseBar('<li>No value at all</li>'), null, 'no finite value anywhere');
    });

    test('a malformed value leaves its category label but plots no bar', () => {
      const m = parseBar(ul([['Good', '10'], ['Broken', 'n/a']]));
      assert.equal(m.groups.length, 2);
      assert.ok(Number.isNaN(m.groups[1].num), 'unparseable value is NaN, not 0');
      const drawn = marksOf(m);
      assert.deepEqual(drawn.map((d) => d.label), ['Good'], 'only the finite value is drawn');
    });

    test('a single-item list is legal and draws one bar', () => {
      const html = buildBar(parseBar(ul([['Only line', '48']])), ctx());
      assert.equal(rects(html).length, 1);
    });
  });

  describe('resolveShape — which of the four forms', () => {
    test('grouped is derived from the DATA, not from the class token', () => {
      const flat = resolveShape(parseBar(ul(REGIONS)), ctx(['grouped']));
      assert.equal(flat.grouped, false, 'a grouped token on a flat list still draws one series');
      const nest = resolveShape(parseBar(nested([['A', [['x', '1'], ['y', '2']]]])), ctx());
      assert.equal(nest.grouped, true, 'nesting alone selects the grouped form');
    });

    test('row and diverging come from their class tokens', () => {
      assert.equal(resolveShape(parseBar(ul(REGIONS)), ctx(['row'])).row, true);
      assert.equal(resolveShape(parseBar(ul(SIGNED)), ctx(['diverging'])).diverging, true);
      assert.equal(resolveShape(parseBar(ul(SIGNED)), ctx()).diverging, false,
        'a negative value alone is NOT the diverging claim');
    });

    test('the row form is auto-selected only when a name would be SHORTENED', () => {
      // Six long names share the width, so each band is too narrow — rotate.
      const many = resolveShape(parseBar(ul(LONG_NAMES)), ctx());
      assert.equal(many.row, true);
      assert.equal(many.autoRow, true);
      // The same names at three categories have three times the band and fit.
      const few = resolveShape(parseBar(ul(LONG_NAMES.slice(0, 3))), ctx());
      assert.equal(few.row, false, 'the trigger is band width, not name length');
      // Short names never trigger it however many there are.
      const short = resolveShape(
        parseBar(ul(Array.from({ length: 8 }, (_, i) => [`Q${i + 1}`, String(100 + i)]))), ctx());
      assert.equal(short.row, false);
    });
  });

  describe('wantsValueAxis — the axis is a fallback, and it is measured', () => {
    test('a single series labels its bars directly, even at eight categories', () => {
      const m = parseBar(ul(Array.from({ length: 8 }, (_, i) => [`Q${i + 1}`, String(120 + i)])));
      assert.equal(wantsValueAxis(m, { grouped: false, row: false }, {}), false);
    });

    test('a dense grouped chart falls back to the axis', () => {
      const m = parseBar(nested(['Americas', 'EMEA', 'APAC', 'LATAM'].map((g) => [g,
        [['FY23', '3.2'], ['FY24', '3.5'], ['FY25', '3.9'], ['FY26', '4.4']]])));
      assert.equal(wantsValueAxis(m, { grouped: true, row: false }, {}), true,
        'four series leave each bar too narrow for its own number');
    });

    test('a sparse grouped chart still labels directly', () => {
      const m = parseBar(nested(['Americas', 'EMEA', 'APAC'].map((g) => [g,
        [['Plan', '3.2'], ['Actual', '3.9']]])));
      assert.equal(wantsValueAxis(m, { grouped: true, row: false }, {}), false);
    });

    test('a row chart never needs one — its values print into a sized gutter', () => {
      const m = parseBar(ul(LONG_NAMES));
      assert.equal(wantsValueAxis(m, { grouped: false, row: true }, {}), false);
    });
  });

  describe('geometry', () => {
    test('bar length is proportional to value and measured from zero', () => {
      const model = parseBar(ul([['A', '100'], ['B', '50'], ['C', '25']]));
      const r = rects(buildBar(model, ctx()));
      assert.equal(r.length, 3);
      // Same baseline for every bar…
      const bases = r.map((b) => b.y + b.height);
      assert.ok(Math.max(...bases) - Math.min(...bases) < 0.02, 'all bars share one baseline');
      // …and height in the same ratio as the values.
      assert.ok(Math.abs(r[1].height / r[0].height - 0.5) < 0.01);
      assert.ok(Math.abs(r[2].height / r[0].height - 0.25) < 0.01);
    });

    test('a zero value draws a bar of no length rather than a floor', () => {
      const r = rects(buildBar(parseBar(ul([['Some', '48'], ['None', '0']])), ctx()));
      assert.equal(r[1].height, 0, 'zero must not be inflated into a visible sliver');
    });

    test('a negative bar hangs BELOW the zero rule, from the same baseline', () => {
      const model = parseBar(ul(SIGNED));
      const html = buildBar(model, ctx());
      const r = rects(html);
      const zeroY = Number(html.match(/<line class="cart-zero"[^<>]*y1="([\d.-]+)"/)[1]);
      // Positive bars end AT zero; negative bars start at it.
      assert.ok(Math.abs(r[0].y + r[0].height - zeroY) < 0.02, 'positive bar sits on zero');
      assert.ok(Math.abs(r[2].y - zeroY) < 0.02, 'negative bar hangs from zero');
      assert.ok(r[2].height > 0);
    });

    test('a signed series without `diverging` still gets a zero rule, not a floor rule', () => {
      const html = buildBar(parseBar(ul(SIGNED)), ctx());
      assert.match(html, /class="cart-zero"/);
      assert.doesNotMatch(html, /class="cart-axis"/,
        'the plot-edge rule would read as a second baseline under the negative bars');
    });

    test('`diverging` centers zero: both sides get the same reach', () => {
      const model = parseBar(ul([['Up', '2.4'], ['Down', '-0.5']]));
      const d = domainFor(model, { diverging: true }, false);
      assert.equal(d.min, -d.max, 'the domain is symmetric about zero');
      assert.equal(d.max, 2.4);
      // Without the token the domain is the data's own extent.
      const plain = domainFor(model, { diverging: false }, false);
      assert.equal(plain.min, -0.5);
      assert.equal(plain.max, 2.4);
    });

    test('every bar stays inside its plot on every form', () => {
      const cases = [
        [ul(REGIONS), []], [ul(SIGNED), []], [ul(LONG_NAMES), []],
        [ul(SIGNED), ['diverging']], [ul(SIGNED), ['diverging', 'row']],
        [nested([['A', [['x', '1'], ['y', '2']]], ['B', [['x', '3'], ['y', '4']]]]), []],
      ];
      for (const [inner, tokens] of cases) {
        const model = parseBar(inner);
        const html = buildBar(model, ctx(tokens));
        const view = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
        for (const b of rects(html)) {
          assert.ok(b.x >= 0 && b.x + b.width <= view[1] + 0.01, `x in range for ${tokens}`);
          assert.ok(b.y >= 0 && b.y + b.height <= view[2] + 0.01, `y in range for ${tokens}`);
        }
      }
    });

    test('padFor keeps the gap under half the bar at every supported count', () => {
      for (let n = 1; n <= 12; n++) {
        assert.ok(padFor(n) > 0 && padFor(n) < 0.6, `n=${n}`);
      }
      assert.ok(padFor(3) > padFor(10), 'fewer bars get more air, not less');
    });

    test('the bar-width cap grows with the plot depth, so portrait is not thermometers', () => {
      const land = cart.plotBox({ view: cart.viewFor('landscape'), gutter: GUT_COL_NOAXIS });
      const port = cart.plotBox({ view: cart.viewFor('portrait'), gutter: GUT_COL_NOAXIS });
      assert.ok(maxBarFor(port) > maxBarFor(land));
      assert.ok(maxRowBarFor(port) > maxRowBarFor(land));
    });

    test('the row gutter grows to fit the longest name and then stops', () => {
      assert.ok(rowGutterFor(parseBar(ul([['Q1', '1'], ['Q2', '2']]))) < 60, 'short names stay tight');
      assert.ok(rowGutterFor(parseBar(ul(LONG_NAMES))) > 80, 'long names get room');
      const absurd = parseBar(ul([['x'.repeat(400), '1'], ['y', '2']]));
      assert.ok(rowGutterFor(absurd) <= 96, 'one runaway name cannot eat the plot');
    });
  });

  describe('bestTicks — an axis that prints what it means', () => {
    test('never returns a tick set the shared formatter would misprint', () => {
      // A 2.5 step is on niceTicks' ladder, and axisFormatter prints whole
      // numbers for any step >= 1 — so 0/2.5/5 would paint "0 · 3 · 5".
      for (let hi = 1; hi <= 400; hi += 1) {
        const t = bestTicks(0, hi);
        const fmt = cart.axisFormatter({ ticks: t.ticks, step: t.step });
        for (const v of t.ticks) {
          const back = cart.parseValue(fmt(v));
          assert.ok(Math.abs(back - v) <= Math.abs(t.step) * 0.001,
            `hi=${hi}: tick ${v} printed as ${fmt(v)}`);
        }
      }
    });

    test('keeps the gridline count inside the family budget', () => {
      for (let hi = 1; hi <= 200; hi += 1) {
        const t = bestTicks(0, hi);
        assert.ok(t.ticks.length <= 5, `hi=${hi} produced ${t.ticks.length} gridlines`);
      }
    });
  });

  describe('emission', () => {
    test('the figure root carries the literal class the manifest declares', () => {
      const html = buildBar(parseBar(ul(REGIONS)), ctx());
      assert.match(html, /<div class="bar-figure">/);
      const manifest = require('../../../lib/components/chart/bar/bar.manifest.json');
      assert.equal(manifest.kernel.figureClass, 'bar-figure');
    });

    test('the svg declares a viewBox and the family aspect contract', () => {
      const html = buildBar(parseBar(ul(REGIONS)), ctx());
      assert.match(html, /viewBox="0 0 320 180"/);
      assert.match(html, /preserveAspectRatio="xMidYMid meet"/);
      assert.match(html, /role="img"/);
      assert.match(html, /<title>Bar chart<\/title>/);
    });

    test('the desc carries every value AND the comparison the chart is for', () => {
      const html = buildBar(parseBar(ul(REGIONS)), ctx());
      const desc = html.match(/<desc>([^<]*)<\/desc>/)[1];
      for (const [label, value] of REGIONS) {
        assert.ok(desc.includes(label), `desc names ${label}`);
        assert.ok(desc.includes(value), `desc carries ${value}`);
      }
      // role="img" prunes every <text>, so the ranking has to be in here too.
      assert.match(desc, /Highest North America \$4\.2M, lowest LATAM \$0\.6M/);
    });

    test('the grouped desc names the series inside each category', () => {
      const html = buildBar(parseBar(nested([
        ['Americas', [['Plan', '3.2'], ['Actual', '3.9']]],
        ['EMEA', [['Plan', '2.6'], ['Actual', '3.1']]],
      ])), ctx());
      const desc = html.match(/<desc>([^<]*)<\/desc>/)[1];
      assert.match(desc, /Americas — Plan 3\.2, Actual 3\.9/);
      assert.match(desc, /Highest Americas Actual 3\.9/);
    });

    test('NO color literal appears anywhere in the output', () => {
      const forms = [
        buildBar(parseBar(ul(REGIONS)), ctx()),
        buildBar(parseBar(ul(LONG_NAMES)), ctx(['row'])),
        buildBar(parseBar(ul(SIGNED)), ctx(['diverging'])),
        buildBar(parseBar(nested(['A', 'B', 'C', 'D'].map((g) => [g,
          [['w', '1'], ['x', '2'], ['y', '3'], ['z', '4']]]))), ctx()),
      ];
      for (const html of forms) {
        assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/, 'hex literal');
        assert.doesNotMatch(html, /\b(?:rgba?|hsla?|oklch)\(/, 'function color');
        assert.doesNotMatch(html, /:\s*(?:red|blue|green|black|white|gray|grey)\b/, 'named color');
        // The one color-adjacent thing that IS allowed: a token name inside a
        // gradient stop, which is the family's idiom.
        assert.match(html, /var\(--chart-cat-\d-hue\)/);
      }
    });

    test('gradient ids are document-unique, so two bar charts cannot swap fills', () => {
      const a = buildBar(parseBar(ul(REGIONS)), ctx());
      const b = buildBar(parseBar(ul(REGIONS)), ctx());
      const idOf = (h) => h.match(/<linearGradient id="([^"]+)"/)[1];
      assert.notEqual(idOf(a), idOf(b));
    });

    test('every mark carries the family texture hooks', () => {
      const plain = rects(buildBar(parseBar(ul(REGIONS)), ctx()));
      for (const r of plain) {
        assert.equal(r['data-hue'], '1', 'a single series is one categorical slot');
        assert.equal(r['data-anima-role'], 'bar');
        assert.ok(r['data-label']);
      }
      const grouped = rects(buildBar(parseBar(nested([
        ['A', [['x', '1'], ['y', '2'], ['z', '3']]],
      ])), ctx()));
      assert.deepEqual(grouped.map((r) => r['data-hue']), ['1', '2', '3']);

      const signed = rects(buildBar(parseBar(ul(SIGNED)), ctx(['diverging'])));
      assert.deepEqual(signed.map((r) => r['data-s']), ['up', 'up', 'down', 'down']);
      assert.deepEqual(signed.map((r) => r['data-hue']), ['1', '1', '2', '2']);
    });

    test('detail rides the shared mark-detail substrate, and is absent when unused', () => {
      const withDetail = buildBar(parseBar(
        '<li>Q1 <code>4.2</code><ul><li>Two renewals landed</li></ul></li>' +
        '<li>Q2 <code>5.1</code></li>'), ctx());
      assert.match(withDetail, /<template class="chart-detail" data-mark="0">/);
      assert.match(withDetail, /<!-- Q1 \(4\.2\): Two renewals landed -->/);
      const without = buildBar(parseBar(ul([['Q1', '4.2'], ['Q2', '5.1']])), ctx());
      assert.doesNotMatch(without, /chart-detail|<!--/);
    });

    test('transformSection splices the list, and passes the section through when it cannot', () => {
      const html = '<h2>Heading</h2><ul><li>A <code>2</code></li><li>B <code>1</code></li></ul>';
      const out = transformSection(html, ctx());
      assert.match(out, /<h2>Heading<\/h2>/);
      assert.doesNotMatch(out, /<ul>/);
      const empty = '<h2>Heading</h2><ul><li>No values here</li></ul>';
      assert.equal(transformSection(empty, ctx()), empty);
      assert.equal(transformSection('<h2>No list</h2>', ctx()), '<h2>No list</h2>');
    });
  });

  describe('the stress case renders', () => {
    const manifest = require('../../../lib/components/chart/bar/bar.manifest.json');

    test('every manifest sample parses and builds without throwing', () => {
      const samples = [manifest.sample, manifest.skeleton, manifest.stressDoc.sample,
        ...Object.values(manifest.variantDocs).map((v) => v.sample)];
      for (const md of samples) {
        const tokens = md.match(/_class:\s*([^\s-][^-]*?)\s*-->/)[1].trim().split(/\s+/);
        const items = [...md.matchAll(/^(\s*)- (.+)$/gm)];
        const inner = items.map(([, indent, body], i) => {
          const html = body.replace(/`([^`]*)`/g, '<code>$1</code>');
          const next = items[i + 1];
          const child = next && next[1].length > indent.length;
          return { depth: indent.length, html, child };
        });
        // Rebuild the <ul> HTML markdown-it would produce for the sample.
        let out = '';
        for (let i = 0; i < inner.length; i++) {
          const it = inner[i];
          if (it.depth) continue;
          let li = `<li>${it.html}`;
          const kids = [];
          for (let j = i + 1; j < inner.length && inner[j].depth; j++) kids.push(inner[j].html);
          if (kids.length) li += `<ul>${kids.map((k) => `<li>${k}</li>`).join('')}</ul>`;
          out += `${li}</li>`;
        }
        const model = parseBar(out);
        assert.ok(model, `sample parses: ${md.slice(0, 40)}`);
        const html = buildBar(model, { classTokens: tokens });
        assert.match(html, /<div class="bar-figure">/);
        assert.ok(rects(html).length > 0, 'the stress sample draws bars');
      }
    });

    test('a portrait deck renders every form', () => {
      for (const tokens of [[], ['row'], ['diverging'], ['diverging', 'row']]) {
        const html = buildBar(parseBar(ul(SIGNED)), { classTokens: tokens, orientation: 'portrait' });
        assert.match(html, /viewBox="0 0 320 300"/);
        assert.ok(rects(html).length === 4);
      }
    });
  });

  describe('the stylesheet mirrors the kernel', () => {
    test('every container and mark class the kernel emits is painted', () => {
      const emitted = new Set();
      for (const tokens of [[], ['row'], ['diverging']]) {
        const html = buildBar(parseBar(ul(SIGNED)), ctx(tokens));
        for (const m of html.matchAll(/class="(bar-[^"]*)"/g)) {
          for (const c of m[1].split(/\s+/)) emitted.add(c);
        }
      }
      for (const cls of emitted) {
        // Structural hooks the stylesheet deliberately does not paint: the figure
        // and svg are sized above, and `.bar-marks` / `.bar-lane` exist so a
        // stylesheet CAN address every bar at once (the a11y and print texture
        // sheets do) without this file needing a rule of its own.
        if (['bar-svg', 'bar-figure', 'bar-lane', 'bar-marks'].includes(cls)) continue;
        assert.ok(RULES.includes(`.${cls}`), `bar.styles.css paints .${cls}`);
      }
      assert.ok(emitted.has('bar-signed') && emitted.has('bar-cat'),
        'the two mark containers are mutually exclusive, and both are emitted');
    });

    test('the stylesheet never declares a fill on a mark', () => {
      // The bar's fill is the canonical gradient, emitted as a presentation
      // attribute. A CSS `fill` BEATS a presentation attribute, so one here
      // would silently throw the gradient — and the legend swatch's match with
      // the bar — away.
      const markRules = RULES.split('}').filter((r) => /\.bar-mark|\.bar-up|\.bar-down/.test(r));
      assert.ok(markRules.length > 0);
      for (const rule of markRules) {
        assert.doesNotMatch(rule, /[^-]\bfill\s*:/, `no fill in: ${rule.trim().slice(0, 60)}`);
      }
    });

    // The six `.bar-cat > g:nth-of-type(N)` lane rules are gone. Each bar carries
    // its own `data-hue` and the family's slot table resolves --mark-ink from it,
    // so the slot travels ON THE MARK rather than being re-derived from the lane's
    // document position — which also means a lane that skips a series can no
    // longer put the next one at the wrong ordinal. slot-contract.md
    test('the edge paints from the mark contract, not from lane position', () => {
      assert.doesNotMatch(RULES, /nth-child/);
      assert.doesNotMatch(RULES, /nth-of-type\(\d\) \.bar-mark/, 'no lane-position rule survives');
      assert.doesNotMatch(RULES, /\[data-cat=/, 'data-cat is retired, not renamed in place');
      assert.ok(RULES.includes('.bar-cat .bar-mark { stroke: var(--mark-ink, var(--chart-cat-1-ink)); }'),
        'one declaration, with the fallback an unset custom property needs');
    });

    test('no hex literal and no @layer wrapper in the stylesheet', () => {
      assert.doesNotMatch(RULES, /#[0-9a-fA-F]{3,8}\b/);
      assert.doesNotMatch(RULES, /@layer/);
      assert.doesNotMatch(RULES, /^\s*margin(-|\s*:)/m, 'HARD RULE #20 — no margin in layout CSS');
    });
  });
});

describe('bar — defects the adversarial trio confirmed', () => {
  const flat = (rows) => parseBar(rows.map(([l, v]) => `<li>${l} <code>${v}</code></li>`).join(''));

  test('the row form keeps EVERY category name', () => {
    // `buildCategoryLabels` culls a colliding vertical label unless it is told
    // the band pitch. Ten business-unit names rendered six — and the auto-`row`
    // flip exists precisely to avoid losing a name, so losing them in the
    // destination made the flip self-defeating.
    const names = ['Commercial Banking', 'Wealth & Asset Management', 'Insurance & Protection',
      'Retail & Small Business', 'Private Credit Partnerships', 'Treasury & Liquidity Services',
      'Global Transaction Services', 'Markets & Securities', 'Corporate Advisory', 'Digital Channels'];
    const svg = buildBar(flat(names.map((n, i) => [n, 10 - i])), { classTokens: ['bar'] });
    assert.equal((svg.match(/class="cart-cat"/g) || []).length, names.length);
  });

  test('no label escapes the viewBox, wrapped or not', () => {
    // `CAT_GAP_X` was 11, paying for an ascender the substrate had already
    // fixed; the second line of a two-line name landed at y=180.2 in a
    // 0 0 320 180 box and the SVG clipped it.
    const svg = buildBar(flat([['Retail Banking', 41], ['Wealth Mgmt', 33],
      ['Markets Desk', 28], ['Card Issuing', 22], ['Trade Finance', 18]]), { classTokens: ['bar'] });
    const h = Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(svg)[1]);
    for (const m of svg.matchAll(/<tspan[^<>]*\sy="([-\d.]+)"/g)) {
      assert.ok(Number(m[1]) <= h, `a label baseline at ${m[1]} is past the ${h}-unit viewBox`);
    }
  });

  test('a value label is never truncated into a different number', () => {
    // The fit test measured against the BAND and the paint used the BAR, so a
    // figure that passed the test was then ellipsized: `$1,234,567,890` printed
    // as `$1,234,…`, a well-formed wrong number beside a correct bar.
    for (const tokens of [['bar'], ['bar', 'row']]) {
      const svg = buildBar(flat([['North America', '$1,234,567,890'], ['EMEA', '$987,654,321']]),
        { classTokens: tokens });
      assert.ok(!svg.includes('…'), `${tokens.join(' ')} ellipsized a figure`);
    }
  });

  test('a flat group in a nested list still draws its bar', () => {
    // Branching on the model-wide `flat` flag meant a mixed list drew nothing
    // for the flat group while its value still set the domain — the chart
    // squashed for a number that appeared nowhere on it.
    const m = parseBar('<li>Q1 <code>40</code></li>'
      + '<li>Q2<ul><li>Plan <code>3</code></li><li>Actual <code>5</code></li></ul></li>');
    const svg = buildBar(m, { classTokens: ['bar'] });
    assert.equal((svg.match(/class="bar-mark"/g) || []).length, 3);
    assert.match(svg, /data-value="40"/);
  });

  test('the description matches the picture past the series cap', () => {
    // It announced a seventh series painted nowhere and then computed a
    // "highest" from the drawn six that the listed seven contradicted.
    const inner = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      .map((x, i) => `<li>${x.toUpperCase()} <code>${(i + 1) * 10}</code></li>`).join('');
    const svg = buildBar(parseBar(`<li>Q1<ul>${inner}</ul></li>`), { classTokens: ['bar'] });
    const desc = /<desc>([^<]*)<\/desc>/.exec(svg)[1];
    assert.ok(!/ G 70/.test(desc), 'an undrawn series was announced as data');
    assert.match(desc, /Not shown, past the six-series limit: G/);
    assert.match(desc, /Highest Q1 F 60/);
  });

  test('the legend swatch carries data-hue so the a11y texture can pair it', () => {
    const inner = ['a', 'b', 'c'].map((x, i) => `<li>${x} <code>${i + 1}</code></li>`).join('');
    const svg = buildBar(parseBar(`<li>Q1<ul>${inner}</ul></li><li>Q2<ul>${inner}</ul></li>`),
      { classTokens: ['bar'] });
    // Matched as whole tags, then filtered — `chart-key-swatch[^>]*data-hue`
    // chains an unbounded run into a literal the run can itself match, which
    // backtracks polynomially (CodeQL js/polynomial-redos). `[^<>]*>` cannot.
    const swatches = (svg.match(/<rect class="chart-key-swatch[^<>]*>/g) || [])
      .filter((tag) => tag.includes('data-hue'));
    assert.ok(swatches.length >= 3);
  });

  test('twenty categories keep twenty labels', () => {
    const svg = buildBar(flat(Array.from({ length: 20 }, (_, i) => [`Q${i + 1}`, i + 1])),
      { classTokens: ['bar'] });
    assert.equal((svg.match(/class="cart-cat"/g) || []).length, 20);
  });
});
