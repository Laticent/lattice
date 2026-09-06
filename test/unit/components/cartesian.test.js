/**
 * Unit: lib/components/chart/_chart-family/cartesian.js — the shared plot
 * substrate for the Cartesian chart members (bar, stacked-bar, line,
 * waterfall, scatter, slope, bullet).
 *
 * This kernel's blast radius is seven components, so the arms here are written
 * against the things a member would otherwise get silently wrong:
 *
 *   1. Ticks — the nice-number ladder, hostile domains, and the float-drift
 *      the generator exists to avoid (a step of 0.1 accumulated by addition
 *      prints `0.30000000000000004`).
 *   2. Value parsing — the magnitude suffix is SCALE, not decoration, and `%`
 *      is deliberately not a magnitude.
 *   3. Formatting — the axis speaks the author's own affix, and never emits a
 *      doubled magnitude (`$4MM`).
 *   4. The series DSL — the detail-vs-data rule, which is what keeps a detail
 *      bullet ending in inline code from being plotted at zero.
 *   5. Scales and the plot box.
 *   6. The emitted chrome carries NO color (HARD RULE #3) and the class
 *      vocabulary the family stylesheet paints.
 *   7. The CSS MIRROR: the `FS` table here and the `font-size` values in
 *      chart-family.css § Cartesian chrome must agree exactly. Silent drift
 *      wraps text to a width the glyphs do not occupy.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../../../lib/components/chart/_chart-family/cartesian');

const FAMILY_CSS = path.join(
  __dirname, '..', '..', '..',
  'lib/components/chart/_chart-family/chart-family.css',
);

/** Build the <ul> inner HTML the dispatcher hands a kernel. */
function ul(items) {
  return items.map((i) => `<li>${i}</li>`).join('');
}

describe('cartesian — ticks', () => {
  test('picks a nice step off the 1/2/2.5/5/10 ladder', () => {
    assert.equal(C.niceStep(0.9), 1);
    assert.equal(C.niceStep(1.7), 2);
    assert.equal(C.niceStep(2.3), 2.5);
    assert.equal(C.niceStep(4), 5);
    assert.equal(C.niceStep(7), 10);
    assert.equal(C.niceStep(230), 250);
  });

  test('covers the data and lands near the requested tick count', () => {
    const t = C.niceTicks(0, 4.7);
    assert.ok(t.max >= 4.7, 'domain must cover the data');
    assert.equal(t.min, 0);
    assert.ok(t.ticks.length >= 3 && t.ticks.length <= 6);
    assert.equal(t.ticks[0], t.min);
    assert.equal(t.ticks[t.ticks.length - 1], t.max);
  });

  test('includeZero pulls the domain to zero; false lets the data fill the box', () => {
    assert.equal(C.niceTicks(60, 75, { includeZero: true }).min, 0);
    assert.ok(C.niceTicks(60, 75, { includeZero: false }).min > 0);
  });

  test('an all-negative series keeps zero as the TOP of the domain', () => {
    const t = C.niceTicks(-40, -10);
    assert.equal(t.max, 0);
    assert.ok(t.min <= -40);
  });

  test('a flat series still gets a readable axis rather than a zero-height plot', () => {
    const zero = C.niceTicks(0, 0);
    assert.ok(zero.max > zero.min, 'a domain of 0..0 must be widened');
    const flat = C.niceTicks(7, 7);
    assert.ok(flat.max > flat.min);
    assert.ok(flat.ticks.length >= 2);
  });

  test('ticks are free of binary-float drift', () => {
    // Accumulated by repeated addition this prints 0.30000000000000004.
    for (const t of C.niceTicks(0, 0.5).ticks) {
      assert.equal(String(t).length <= 6, true, `tick ${t} carries float noise`);
    }
    for (const t of C.niceTicks(0, 9).ticks) assert.equal(t, Math.round(t * 1e6) / 1e6);
  });

  test('a hostile domain never produces an unbounded tick set', () => {
    for (const [lo, hi] of [
      [0, 1e12], [-1e9, 1e9], [0.0001, 0.0003], [-1e-9, 1e-9], [1e-6, 1e6],
    ]) {
      const t = C.niceTicks(lo, hi);
      assert.ok(t.ticks.length > 0 && t.ticks.length < 60,
        `[${lo},${hi}] produced ${t.ticks.length} ticks`);
      assert.ok(t.ticks.every(Number.isFinite));
    }
  });

  test('non-finite input degrades to a usable axis instead of NaN', () => {
    for (const [lo, hi] of [[NaN, NaN], [undefined, undefined], [Infinity, 10]]) {
      const t = C.niceTicks(lo, hi);
      assert.ok(t.ticks.every(Number.isFinite), `[${lo},${hi}] leaked a non-finite tick`);
      assert.ok(t.ticks.length > 0);
    }
  });
});

describe('cartesian — value parsing', () => {
  test('the magnitude suffix is applied, because an axis has to mix magnitudes', () => {
    assert.equal(C.parseValue('1.2M'), 1200000);
    assert.equal(C.parseValue('12k'), 12000);
    assert.equal(C.parseValue('800K'), 800000);
    assert.equal(C.parseValue('3B'), 3e9);
    assert.equal(C.parseValue('2bn'), 2e9);
  });

  test('% is NOT a magnitude', () => {
    assert.equal(C.parseValue('12%'), 12);
    assert.equal(C.parseValue('99.5%'), 99.5);
  });

  test('commas, currency and signs are tolerated', () => {
    assert.equal(C.parseValue('$1,200'), 1200);
    assert.equal(C.parseValue('-3.5'), -3.5);
    assert.equal(C.parseValue('  42  '), 42);
  });

  test('a non-numeric pill is NaN, not zero — zero would be plotted as data', () => {
    assert.ok(Number.isNaN(C.parseValue('EMEA')));
    assert.ok(Number.isNaN(C.parseValue('')));
    assert.ok(Number.isNaN(C.parseValue(null)));
  });
});

describe('cartesian — tick formatting', () => {
  test('compacts only when the step is also large, so 0..1500 stays whole', () => {
    assert.equal(C.formatTick(1000, { step: 500 }), '1000');
    assert.equal(C.formatTick(1500000, { step: 500000 }), '1.5M');
    assert.equal(C.formatTick(20000, { step: 10000 }), '20k');
  });

  test('every tick on one axis compacts to the SAME unit', () => {
    // A mixed axis (0 · 500k · 1M · 1.5M) is a visible defect — a reader
    // re-scales their eye at every gridline. The unit is a property of the
    // AXIS, chosen once from its widest tick.
    for (const hi of [1.4e6, 9.5e3, 1.1e9, 1500]) {
      const { ticks, step } = C.niceTicks(0, hi);
      const fmt = C.axisFormatter({ ticks, step });
      // Zero is exempt and deliberately so: it carries no magnitude, and `$0k`
      // reads as a quantity of thousands.
      const units = ticks.filter((t) => t !== 0).map((t) => fmt(t).replace(/[\d.,-]/g, ''));
      assert.equal(new Set(units).size, 1,
        `mixed units on the 0..${hi} axis: ${ticks.map(fmt).join(' · ')}`);
    }
  });

  test('speaks the author\'s own affix', () => {
    assert.equal(C.formatTick(4000000, { step: 1000000, prefix: '$' }), '$4M');
    assert.equal(C.formatTick(50, { step: 25, suffix: '%' }), '50%');
  });

  test('never doubles the magnitude letter', () => {
    // A series authored as `$1.2M` yields suffix 'M'; an axis that ALSO
    // compacts to millions must not print `$4MM`.
    const affix = C.affixOf(['$1.2M', '$3.4M', '$5.6M']);
    assert.equal(affix.suffix, '', 'a magnitude letter must not survive as an affix');
    const { ticks, step } = C.niceTicks(0, C.parseValue('$5.6M'));
    const fmt = C.axisFormatter({ ticks, step, affix });
    for (const t of ticks) {
      assert.ok(!/MM|kk|BB/.test(fmt(t)), `doubled magnitude in tick "${fmt(t)}"`);
    }
    assert.equal(fmt(4000000), '$4M');
  });

  test('a real unit is NOT a magnitude and survives onto the axis', () => {
    // `kg` is a unit; `k` is a magnitude. Getting this backwards either eats
    // the unit or multiplies the number by a thousand.
    assert.equal(C.parseValue('12kg'), 12);
    assert.equal(C.affixOf(['12kg', '18kg']).suffix, 'kg');
    assert.equal(C.affixOf(['12%', '18%']).suffix, '%');
  });

  test('a mixed-unit series adopts no affix, which is the honest read', () => {
    assert.deepEqual(C.affixOf(['$4M', '12%']), { prefix: '', suffix: '' });
  });
});

describe('cartesian — the series DSL', () => {
  test('parses the flat shape', () => {
    const m = C.parseSeries(ul(['Alpha <code>12</code>', 'Beta <code>7</code>']));
    assert.equal(m.flat, true);
    assert.deepEqual(m.groups.map((g) => g.label), ['Alpha', 'Beta']);
    assert.deepEqual(m.groups.map((g) => g.num), [12, 7]);
    assert.equal(m.min, 7);
    assert.equal(m.max, 12);
  });

  test('parses the nested multi-series shape and keeps authored series order', () => {
    const m = C.parseSeries(
      '<li>Q1<ul><li>Product <code>2.4</code></li><li>Services <code>1.8</code></li></ul></li>' +
      '<li>Q2<ul><li>Product <code>3.0</code></li><li>Services <code>2.2</code></li></ul></li>');
    assert.equal(m.flat, false);
    assert.deepEqual(m.series, ['Product', 'Services']);
    assert.deepEqual(m.groups.map((g) => g.label), ['Q1', 'Q2']);
    assert.deepEqual(m.groups[0].points.map((p) => p.num), [2.4, 1.8]);
  });

  test('a nested bullet with no pill is DETAIL, not a data point at zero', () => {
    const m = C.parseSeries(
      '<li>Q1<ul><li>Product <code>2.4</code></li><li>Closed two weeks early</li></ul></li>');
    assert.deepEqual(m.groups[0].points.map((p) => p.series), ['Product']);
    assert.deepEqual(m.groups[0].detail, ['Closed two weeks early']);
  });

  test('a nested bullet whose pill is NOT a number is DETAIL — the rule that matters', () => {
    // This is the case a presence-only test gets wrong: the bullet ends in
    // inline code, but the code is a region, not a measurement.
    const m = C.parseSeries(
      '<li>Q1<ul><li>Revenue <code>2.4</code></li><li>Best quarter in <code>EMEA</code></li></ul></li>');
    assert.deepEqual(m.groups[0].points.map((p) => p.series), ['Revenue']);
    assert.equal(m.groups[0].detail.length, 1);
    assert.match(m.groups[0].detail[0], /EMEA/);
  });

  test('returns null when there is nothing to draw — the pass-through signal', () => {
    assert.equal(C.parseSeries(''), null);
    assert.equal(C.parseSeries(ul(['Just a label'])), null);
  });

  test('reports series past the cap rather than truncating in silence', () => {
    const inner = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      .map((s, i) => `<li>${s.toUpperCase()} <code>${i + 1}</code></li>`).join('');
    const m = C.parseSeries(`<li>Q1<ul>${inner}</ul></li>`);
    assert.equal(m.series.length, 6);
    assert.deepEqual(m.seriesOverflow, ['G']);
  });

  test('carries the authored group total alongside nested points', () => {
    const m = C.parseSeries(
      '<li>Q1 <code>4.2</code><ul><li>Product <code>2.4</code></li><li>Services <code>1.8</code></li></ul></li>');
    assert.equal(m.groups[0].total, 4.2);
    assert.deepEqual(m.groups[0].points.map((p) => p.num), [2.4, 1.8]);
  });
});

describe('cartesian — scales and the plot box', () => {
  test('linearScale maps the domain onto the range, inverted for a value axis', () => {
    const p = C.plotBox({});
    const s = C.linearScale([0, 100], [p.y1, p.y0]);
    assert.equal(s(0), p.y1, 'zero sits on the baseline');
    assert.equal(s(100), p.y0, 'the maximum sits at the top');
    assert.equal(s(50), (p.y0 + p.y1) / 2);
  });

  test('a zero-span domain pins to the range midpoint instead of dividing by zero', () => {
    const s = C.linearScale([5, 5], [100, 0]);
    assert.equal(s(5), 50);
    assert.ok(Number.isFinite(s(9)));
  });

  test('bandScale centers each band in its slot and never returns a negative width', () => {
    const b = C.bandScale(4, [0, 100]);
    assert.ok(b.width > 0 && b.width < b.step);
    for (let i = 0; i < 4; i++) {
      assert.ok(b.start(i) >= 0 && b.start(i) + b.width <= 100, `band ${i} escapes the range`);
      assert.ok(Math.abs(b.center(i) - (b.start(i) + b.width / 2)) < 1e-9);
    }
    for (const n of [0, 1]) {
      const one = C.bandScale(n, [0, 100]);
      assert.ok(Number.isFinite(one.width) && one.width >= 0);
      assert.ok(Number.isFinite(one.center(0)));
    }
  });

  test('the plot box respects gutter overrides and stays inside the viewBox', () => {
    const p = C.plotBox({ view: C.VIEW.landscape, gutter: { left: 44 } });
    assert.equal(p.x0, 44);
    assert.equal(p.x1, C.VIEW.landscape.w - C.GUTTER.right);
    assert.ok(p.w > 0 && p.h > 0);
  });

  test('portrait gets its own taller viewBox; square keeps landscape', () => {
    assert.deepEqual(C.viewFor('portrait'), C.VIEW.portrait);
    assert.deepEqual(C.viewFor('square'), C.VIEW.landscape);
    assert.deepEqual(C.viewFor(undefined), C.VIEW.landscape);
    assert.ok(C.VIEW.portrait.h > C.VIEW.landscape.h);
  });
});

describe('cartesian — the emitted chrome', () => {
  const plot = C.plotBox({});
  const { ticks, step } = C.niceTicks(0, 100);
  const scale = C.linearScale([0, 100], [plot.y1, plot.y0]);

  test('emits the family class vocabulary the stylesheet paints', () => {
    const grid = C.buildGrid({ plot, ticks, scale });
    assert.match(grid, /class="cart-grid"/);
    assert.match(grid, /class="cart-zero"/, 'zero must be its own class, not a styled gridline');
    assert.match(C.buildAxisRule({ plot }), /class="cart-axis"/);
    assert.match(C.buildValueTicks({ plot, ticks, scale, step }), /class="cart-tick"/);
    assert.match(C.buildAxisTitle('Cost', { x: 100, y: 10 }), /class="cart-axis-title"/);
  });

  test('emits NO color — palette lives in CSS (HARD RULE #3)', () => {
    const out = [
      C.buildGrid({ plot, ticks, scale }),
      C.buildAxisRule({ plot }),
      C.buildValueTicks({ plot, ticks, scale, step }),
      C.buildCategoryLabels({ plot, labels: ['Q1', 'Q2'], center: (i) => 100 + i * 60, width: 50 }),
      C.buildValueLabel('4.2', { x: 10, y: 10 }),
      C.buildAxisTitle('Cost', { x: 100, y: 10 }),
    ].join('');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(out), 'a hex literal reached the emitted SVG');
    assert.ok(!/\b(?:rgb|hsl|oklch)\(/.test(out), 'a color function reached the emitted SVG');
    assert.ok(!/\bfill\s*[:=]\s*"?(?!none)[a-z]/.test(out), 'a named fill reached the emitted SVG');
  });

  test('the fill defs name TOKENS, never a color, and are document-unique', () => {
    const a = C.buildFillDefs({ slots: [1, 2] });
    const b = C.buildFillDefs({ slots: [1, 2] });
    assert.match(a.defs, /var\(--chart-cat-1-hue\)/);
    assert.match(a.defs, /var\(--chart-fill-top-l\)/);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(a.defs));
    assert.notEqual(a.id(1), b.id(1),
      'two charts on one slide would silently paint with each other\'s stops');
    assert.match(a.url(1), /^url\(#.+\)$/);

    const s = C.buildFillDefs({ kind: 'state', slots: ['pass', 'fail'] });
    assert.match(s.defs, /var\(--state-pass-hue\)/);
  });

  test('category labels are culled rather than overprinted when they cannot fit', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Business unit ${i}`);
    const out = C.buildCategoryLabels({
      plot, labels: many, center: (i) => plot.x0 + i * 4, width: 40,
    });
    const drawn = (out.match(/class="cart-cat"/g) || []).length;
    assert.ok(drawn > 0, 'culling must not remove every label');
    assert.ok(drawn < many.length, 'colliding labels must be culled, not overprinted');
  });
});

describe('cartesian — the CSS mirror', () => {
  // The kernel breaks lines and culls ticks against `FS`; the stylesheet paints
  // the font sizes. A silent drift wraps text to a width the glyphs do not
  // occupy, which is invisible until a label clips.
  const css = fs.readFileSync(FAMILY_CSS, 'utf8');

  const PAIRS = [
    ['cart-tick', 'tick'],
    ['cart-cat', 'cat'],
    ['cart-value', 'value'],
    ['cart-series', 'series'],
    ['cart-axis-title', 'axisTitle'],
  ];

  for (const [cls, key] of PAIRS) {
    test(`.${cls} font-size matches FS.${key}`, () => {
      const rule = css.match(
        new RegExp(`\\.chart-frame\\s+\\.${cls}\\s*\\{([^}]*)\\}`));
      assert.ok(rule, `no .${cls} rule in chart-family.css`);
      const fontSize = rule[1].match(/font-size:\s*([\d.]+)px/);
      assert.ok(fontSize, `.${cls} declares no px font-size`);
      assert.equal(Number(fontSize[1]), C.FS[key],
        `.${cls} paints ${fontSize[1]}px but the kernel wraps to FS.${key} = ${C.FS[key]}`);
    });
  }

  test('the Cartesian chrome block is unlayered and hex-free', () => {
    // Start AFTER the section's own header comment and strip every remaining
    // comment: the block's prose explains why `@layer` is not used and why a
    // hex would be wrong, so a naive scan fails on the explanation rather than
    // on a rule. The ownership gates strip comments for the same reason.
    const marker = css.indexOf('CARTESIAN CHROME');
    assert.ok(marker > 0, 'the Cartesian chrome block is missing');
    const block = css
      .slice(css.indexOf('*/', marker) + 2)
      .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(block.includes('.cart-grid'), 'the Cartesian chrome rules are missing');
    assert.ok(!/@layer/.test(block), '@layer is inert here and loses the cascade (#26)');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'a hex literal in layout CSS (#3)');
    assert.ok(!/(^|[;{\s])margin(-[a-z]+)?\s*:\s*(?!0\s*;)/.test(block),
      'no margin in engine layout CSS (#20)');
  });
});

describe('cartesian — defects found by the independent checker', () => {
  // Each arm below is a bug that was CONFIRMED with a reproduction against the
  // first cut of this kernel. They are kept as named regressions because every
  // one of them would otherwise have multiplied across seven members.

  test('a minus that is not adjacent to the digits is still a minus', () => {
    // `-$0.8M` took the first numeric run and dropped the sign, so every
    // negative step of a waterfall pointed up and the bridge closed on the
    // wrong number without ever crossing the zero rule it is read against.
    assert.equal(C.parseValue('-$0.8M'), -800000);
    assert.equal(C.parseValue('$-1.2M'), -1200000);
    assert.equal(C.parseValue('($1.2M)'), -1200000, 'the accounting parenthesis');
    assert.equal(C.parseValue('−1.2M'), -1200000, 'U+2212, what a spreadsheet paste gives');
    assert.equal(C.parseValue('- 1.2'), -1.2);
    assert.equal(C.parseValue('$1.2M'), 1200000, 'a positive is still positive');
  });

  test('the 2.5 rung of the nice ladder is labeled 2.5, not 3', () => {
    // decimalsFor returned 0 for any step >= 1, so a gridline drawn at 2.5 was
    // labeled 3 — a 20% error on the reference a reader takes values off, on
    // the most ordinary domain there is.
    const { ticks, step } = C.niceTicks(0, 10);
    const fmt = C.axisFormatter({ ticks, step });
    assert.deepEqual(ticks.map(fmt), ['0', '2.5', '5', '7.5', '10']);
    for (const hi of [9, 10, 1e7, 9.7e6, 0.1]) {
      const t = C.niceTicks(0, hi);
      const f = C.axisFormatter({ ticks: t.ticks, step: t.step });
      for (const v of t.ticks) {
        const printed = Number(f(v).replace(/[^\d.-]/g, '')) * (/M$/.test(f(v)) ? 1e6 : /k$/.test(f(v)) ? 1e3 : 1);
        if (v !== 0) {
          assert.ok(Math.abs(printed - v) <= Math.abs(v) * 0.02,
            `tick ${v} printed as ${f(v)} on the 0..${hi} axis`);
        }
      }
    }
  });

  test('an axis below 1e-4 does not print duplicate ticks', () => {
    const t = C.niceTicks(0, 0.00006);
    const fmt = C.axisFormatter({ ticks: t.ticks, step: t.step });
    const printed = t.ticks.map(fmt);
    assert.equal(new Set(printed).size, printed.length, `duplicates: ${printed.join(' · ')}`);
  });

  test('a nanoscale domain does not collapse every tick to zero', () => {
    // round6 was an absolute toFixed(6), so every tick under 1e-6 flattened to
    // 0 — and since buildGrid tests `t === 0` (and -0 === 0) that painted five
    // stacked zero rules and not one gridline.
    const t = C.niceTicks(-1e-9, 1e-9);
    assert.ok(t.ticks.some((v) => v !== 0), 'every tick flattened to zero');
    const grid = C.buildGrid({ plot: C.plotBox({}), ticks: t.ticks, scale: () => 50 });
    assert.equal((grid.match(/cart-zero/g) || []).length, 1, 'exactly one zero rule');
  });

  test('a pill that merely CONTAINS digits is detail, not a data point', () => {
    // `parseValue('PROJ-42')` is -42, so a ticket id was plotted as a negative
    // data point that dragged the axis to -42 and minted a phantom series.
    const m = C.parseSeries(
      '<li>Q1<ul><li>Revenue <code>2.4</code></li><li>Ticket <code>PROJ-42</code></li></ul></li>');
    assert.deepEqual(m.series, ['Revenue']);
    assert.equal(m.groups[0].detail.length, 1);
    assert.ok(m.min >= 0 && m.max === 2.4, `axis was dragged to ${m.min}..${m.max}`);
    assert.equal(C.isValuePill('PROJ-42'), false);
    assert.equal(C.isValuePill('$1,200'), true);
    assert.equal(C.isValuePill('-$0.8M'), true);
    assert.equal(C.isValuePill('12%'), true);
    assert.equal(C.isValuePill('EMEA'), false);
  });

  test('mixed-depth authoring keeps the flat group in the domain', () => {
    // An author converts one group to multi-series and leaves another flat —
    // the commonest authoring edit. The flat group used to fall out of the
    // domain entirely, so a member drew a bar several times the axis maximum.
    const m = C.parseSeries(
      '<li>Q1<ul><li>P <code>2</code></li></ul></li><li>Q2 <code>9</code></li>');
    assert.equal(m.mixedDepth, true, 'the model must flag it so a member can refuse');
    assert.equal(m.max, 9, 'the flat group must reach the domain');
  });

  test('a series past the cap is TAGGED, not left to contradict the axis', () => {
    // `series` was capped while `points` was not, so a member iterating points
    // drew a 7th mark whose palette index was -1 — an unstyled mark — and the
    // axis carried headroom no drawn mark reached.
    const inner = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      .map((x, i) => `<li>${x.toUpperCase()} <code>${(i + 1) * 100}</code></li>`).join('');
    const m = C.parseSeries(`<li>Q1<ul>${inner}</ul></li>`);
    assert.deepEqual(m.seriesOverflow, ['G']);
    assert.equal(m.max, 600, 'the axis must not be set by a series that is never drawn');
    assert.deepEqual(m.groups[0].points.map((p) => p.over),
      [false, false, false, false, false, false, true]);
  });

  test('an <ol> sublist is a sublist', () => {
    // `1. Product `2.4`` under a group rendered a blank chart: splitNested
    // searched only for <ul> while parseTopLevelLis tracked <ol> correctly.
    const m = C.parseSeries('<li>Q1<ol><li>P <code>2</code></li></ol></li>');
    assert.ok(m, 'an ordered sublist returned the pass-through signal');
    assert.deepEqual(m.series, ['P']);
  });

  test('the vertical axis culls its labels — the horizontal-bar branch', () => {
    // This branch had NO cull at all. Thirty rows on the landscape plot gave a
    // 4.9-unit band pitch against a 9.4-unit line height: every row label
    // overprinted its neighbors and nothing was legible.
    const plot = C.plotBox({});
    const b = C.bandScale(30, [plot.y0, plot.y1]);
    const out = C.buildCategoryLabels({
      plot, labels: Array.from({ length: 30 }, (_, i) => `Business unit ${i}`),
      center: (i) => b.center(i), width: 26, axis: 'y',
    });
    const drawn = (out.match(/class="cart-cat"/g) || []).length;
    assert.ok(drawn > 0 && drawn < 30, `drew ${drawn} of 30 — expected a cull`);
  });

  test('the horizontal cull measures the PAINTED width, not the allowed width', () => {
    // Culling on the allowed width threw away short names that had room: 2 of
    // 20 survived a case where every one fits.
    const plot = C.plotBox({});
    const b = C.bandScale(20, [plot.x0, plot.x1]);
    const out = C.buildCategoryLabels({
      plot, labels: Array.from({ length: 20 }, (_, i) => `B${i}`),
      center: (i) => b.center(i), width: b.width,
    });
    assert.equal((out.match(/class="cart-cat"/g) || []).length, 20,
      'short labels that fit their bands must not be culled');
  });

  test('markFormatter speaks the axis unit at the value\'s own precision', () => {
    // formatTick per mark gave three units on one chart; axisFormatter rounded
    // a real 400k value to "0M".
    const { ticks, step } = C.niceTicks(0, 5e6);
    const fmt = C.markFormatter({ ticks, step });
    assert.deepEqual([2500000, 900000, 5000000, 400000].map(fmt),
      ['2.5M', '0.9M', '5M', '0.4M']);
  });

  test('includeZero:false is honored for a flat positive series', () => {
    const t = C.niceTicks(42, 42, { includeZero: false });
    assert.ok(t.min > 0, `min was ${t.min} — the series was squashed against the top`);
  });

  test('a domain near Number.MAX_VALUE terminates instead of throwing', () => {
    // hi overflowed to Infinity, n with it, and the loop ran for ten seconds
    // before throwing an uncaught RangeError from inside a chart kernel.
    const t = C.niceTicks(0, 1.6e308);
    assert.ok(t.ticks.length > 0 && t.ticks.length <= 201);
    assert.ok(t.ticks.every(Number.isFinite));
    const d = C.niceTicks(1e-323, 4e-323);
    assert.ok(d.ticks.length > 0 && d.ticks.every(Number.isFinite), 'denormal domain');
  });

  test('bandScale survives a reversed range and a NaN count', () => {
    // linearScale's own doc trains a caller to pass [y1, y0]; a member writing
    // bandScale(n, [plot.y1, plot.y0]) by analogy got width 0 — invisible
    // bars, no error.
    const b = C.bandScale(3, [100, 0]);
    assert.ok(b.width > 0, 'a descending range must not yield zero-width bands');
    assert.ok(Number.isFinite(C.bandScale(NaN, [0, 100]).width));
  });

  test('a gradient slot cannot break out of its id attribute', () => {
    const d = C.buildFillDefs({ kind: 'state', slots: ['a"onload=x'] });
    assert.ok(!/["'<>]/.test(d.id('a"onload=x')), `unescaped id: ${d.id('a"onload=x')}`);
    // The hostile slot text must not survive anywhere in the emitted defs —
    // not in the id, and not in the `var(--state-…)` name either.
    assert.ok(!d.defs.includes('onload=x'), 'the raw slot reached the markup');
    assert.ok(!d.defs.includes('"onload'), 'an attribute break-out survived');
  });

  test('the gradient stem is a registered render-id family', () => {
    // render-ids.js decides whether a deck is squatting an id by matching the
    // family NAME. A stem it does not carry is a stem an author's raw
    // <linearGradient> can hijack — and SVG is first-def-wins, so the chart
    // would paint with the author's gradient while its legend read correctly.
    const ids = require('../../../lib/core/render-ids');
    ids.resetRenderIds('<linearGradient id="cart-fill-1-1-1">');
    assert.notEqual(ids.renderIdPrefix(), '', 'cart-fill is not in the FAMILIES probe');
    ids.resetRenderIds('');
  });

  test('buildSvgRoot emits the contract the skill pins', () => {
    const svg = C.buildSvgRoot({
      view: C.VIEW.landscape, className: 'bar-svg',
      title: 'Bar chart', desc: 'Alpha 12; Beta 7', body: '<g/>',
    });
    assert.match(svg, /viewBox="0 0 320 180"/);
    assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
    assert.match(svg, /role="img"/);
    assert.match(svg, /<title>Bar chart<\/title>/);
    assert.match(svg, /<desc>Alpha 12; Beta 7<\/desc>/);
    // role="img" prunes the subtree, so title/desc are the ONLY route to the
    // data — they must survive author text that looks like markup.
    const hostile = C.buildSvgRoot({
      view: C.VIEW.landscape, className: 'x', title: 'a<b>&c', desc: 'd<e>', body: '',
    });
    assert.match(hostile, /<title>a&lt;b&gt;&amp;c<\/title>/);
  });
});

describe('cartesian — domain policy', () => {
  test('the default snaps the DOMAIN, which is right for a bar', () => {
    const t = C.niceTicks(0, 4.4);
    assert.equal(t.min, 0, 'a bar baseline is zero');
    assert.ok(t.max >= 4.4);
    assert.equal(t.ticks[t.ticks.length - 1], t.max, 'the top tick IS the domain top');
  });

  test('`tight` fills the plot with the data, which is right for a trend', () => {
    // Snapping the domain gave a $60k..$420k series a $0..$600k axis — the
    // right third of the plot spent on nothing.
    const snapped = C.niceTicks(60000, 420000);
    const tight = C.niceTicks(60000, 420000, { includeZero: false, tight: true });
    assert.equal(snapped.max, 600000);
    assert.ok(tight.min > 0 && tight.min < 60000, 'the domain hugs the data');
    assert.ok(tight.max > 420000 && tight.max < 500000);
    assert.ok(tight.ticks.every((v) => v >= tight.min && v <= tight.max),
      'every drawn tick must fall inside the domain');
    assert.ok(tight.ticks.length >= 2, 'a tight axis still needs gridlines');
  });

  test('`tight` falls back rather than drawing an axis with no gridlines', () => {
    // A pad narrower than one step can leave nothing inside the domain.
    const t = C.niceTicks(1000, 1000.0001, { tight: true, includeZero: false });
    assert.ok(t.ticks.length >= 2);
  });

  test("target 'auto' spends less of the plot on dead headroom", () => {
    const fixed = C.niceTicks(0, 4.4, { target: 4 });
    const auto = C.niceTicks(0, 4.4, { target: 'auto' });
    assert.ok(auto.max <= fixed.max, `auto ${auto.max} should not exceed fixed ${fixed.max}`);
    assert.ok(auto.max >= 4.4, 'and must still cover the data');
  });

  test('zero carries no magnitude on a compacted axis', () => {
    const t = C.niceTicks(0, 420000);
    assert.equal(C.axisFormatter({ ticks: t.ticks, step: t.step, affix: { prefix: '$' } })(0), '$0');
    assert.equal(C.markFormatter({ ticks: t.ticks, step: t.step })(0), '0');
  });
});

describe('cartesian — gaps the member agents found', () => {
  test('the affix survives EVERY sign form parseValue understands', () => {
    // affixOf adopts an affix only when every value agrees, so one negative
    // used to drop the `$` from the whole axis: the parts printed `$4.2M` from
    // their raw text while the computed total printed `3.4M`, on one slide.
    assert.deepEqual(C.affixOf(['$4.2M', '-$0.8M', '($1.2M)']), { prefix: '$', suffix: '' });
    assert.deepEqual(C.affixOf(['+1.4%', '-0.9%']), { prefix: '', suffix: '%' });
  });

  test('the axis title measures its own uppercase tracking', () => {
    // `.cart-axis-title` paints uppercase at 0.12em tracking; measured at the
    // flat advance it under-counted and ellipsized a caption that fitted.
    assert.ok(!C.buildAxisTitle('Second category', { x: 100, y: 10, width: 90 }).includes('…'),
      'a caption that fits was ellipsized');
  });

  test('bandScale caps a band so one category is not a slab', () => {
    assert.equal(C.bandScale(2, [0, 300], { maxWidth: 40 }).width, 40);
    const b = C.bandScale(2, [0, 300], { maxWidth: 40 });
    assert.ok(b.center(0) < b.center(1) && b.start(0) >= 0);
  });

  test('buildValueLabel takes a font size, so a member is not pinned to FS.value', () => {
    // The size is a MEASUREMENT input, not an emitted attribute (CSS owns what
    // is painted), so the proof is that the same text wraps differently: a
    // string that fits one line at FS.value must break at twice the size.
    const small = C.buildValueLabel('1,234,567', { x: 10, y: 10, width: 44 });
    const large = C.buildValueLabel('1,234,567', { x: 10, y: 10, width: 44, fontSize: 20 });
    const lines = (svg) => (svg.match(/<tspan/g) || []).length;
    assert.equal(lines(small), 1);
    assert.ok(lines(large) > 1 || large.includes('…'),
      'the font size did not reach the measurement');
  });
});

describe('cartesian — the magnitude unit comes from the domain', () => {
  const label = (lo, hi, affix = {}) => {
    const t = C.niceTicks(lo, hi, { includeZero: lo === 0, tight: lo !== 0 });
    return t.ticks.map(C.axisFormatter({ ticks: t.ticks, step: t.step, affix })).join(' · ');
  };

  test('a narrow axis high up the scale speaks its own magnitude', () => {
    // Gating the unit on the STEP read the wrong quantity: a $4.12M-$4.31M
    // axis stepping by 50k printed `$4300k`, because the step alone said
    // "thousands" while the numbers were plainly millions.
    const out = label(4120000, 4310000, { prefix: '$' });
    assert.ok(/M/.test(out), `expected millions, got ${out}`);
    assert.ok(!/k/.test(out), `thousands leaked in: ${out}`);
  });

  test('compaction must buy back more characters than it costs', () => {
    // `k` carries a floor of 1e4, not 1e3, so a 1500-max axis stays whole.
    assert.equal(label(0, 1500), '0 · 500 · 1000 · 1500');
    assert.match(label(0, 95000), /k/);
  });

  test('no tick ever needs more than two decimals', () => {
    for (const [lo, hi] of [[0, 1500], [0, 1.4e6], [4.12e6, 4.31e6], [0, 12000], [0, 1.1e9]]) {
      for (const part of label(lo, hi).split(' · ')) {
        const dp = (part.match(/\.(\d+)/) || ['', ''])[1].length;
        assert.ok(dp <= 2, `${part} on the ${lo}..${hi} axis carries ${dp} decimals`);
      }
    }
  });

  test('pointScale is a real export, not a bandScale trick', () => {
    // Members were synthesizing one with `bandScale(n, r, { padOuter: -0.5 })`.
    const ps = C.pointScale(5, [30, 310]);
    assert.equal(ps.at(0), 30, 'the first point sits on the plot edge');
    assert.equal(ps.at(4), 310, 'and the last on the other');
    assert.equal(ps.at(2), 170);
    assert.equal(C.pointScale(1, [30, 310]).at(0), 170, 'a lone point centers');
    const inset = C.pointScale(5, [30, 310], { inset: 10 });
    assert.equal(inset.at(0), 40);
  });

  test('edgeAnchor turns the first and last category label inward', () => {
    const plot = C.plotBox({});
    const ps = C.pointScale(3, [plot.x0, plot.x1]);
    const out = C.buildCategoryLabels({
      plot, labels: ['Q1', 'Q2', 'Q3'], center: ps.at, width: 40, edgeAnchor: true,
    });
    assert.match(out, /text-anchor="start"/);
    assert.match(out, /text-anchor="end"/);
  });
});

describe('cartesian — a category name is never silently dropped', () => {
  test('a row chart ellipsizes a long name instead of culling it', () => {
    // The vertical branch had no cull at all, then gained one — and the cure
    // was worse: ten dumbbell rows with two-line names lost FIVE names, and
    // five rows rendered anonymous with nothing on the slide to say so. Given
    // the band pitch, the line budget comes from the row height, so a name
    // that does not fit is ellipsized and every row keeps its label.
    const plot = C.plotBox({});
    const b = C.bandScale(10, [plot.y0, plot.y1]);
    const names = Array.from({ length: 10 }, (_, i) => `Professional services division ${i}`);
    const culled = C.buildCategoryLabels({
      plot, labels: names, center: (i) => b.center(i), width: 26, axis: 'y',
    });
    const kept = C.buildCategoryLabels({
      plot, labels: names, center: (i) => b.center(i), width: 26, axis: 'y', pitch: b.step,
    });
    assert.ok((culled.match(/class="cart-cat"/g) || []).length < 10, 'the hazard is real');
    assert.equal((kept.match(/class="cart-cat"/g) || []).length, 10,
      'every row must keep its name when the pitch is known');
  });

  test('the vertical axis measures and emits at the SAME width', () => {
    // It used to measure at the caller's `width` and emit at the gutter, so a
    // label could be culled for colliding at a size it was never painted at.
    const plot = C.plotBox({ gutter: { left: 60 } });
    const b = C.bandScale(4, [plot.y0, plot.y1]);
    const out = C.buildCategoryLabels({
      plot, labels: ['Alpha division', 'Beta', 'Gamma', 'Delta'],
      center: (i) => b.center(i), width: 5, axis: 'y', pitch: b.step,
    });
    assert.equal((out.match(/class="cart-cat"/g) || []).length, 4,
      'a width of 5 must not shrink the real gutter box');
  });
});
