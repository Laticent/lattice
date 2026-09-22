/**
 * Unit: `dominant-baseline` reaches the `<tspan>`, on every surface that sets one.
 *
 * THE DEFECT THIS PINS. A `<tspan>` carries its own `dominant-baseline: auto`,
 * and the two engines resolve that `auto` differently. Chromium follows SVG2 and
 * resolves it against the parent's COMPUTED value, so a positioned tspan centers
 * on its `y`. WebKit follows SVG 1.1 and resolves it to `alphabetic`, so `y`
 * becomes the glyph baseline and the whole label paints about one font-size too
 * high. Measured on the chart gallery: 107 of 256 labels sat 4–13px high on a
 * 1280×720 slide in Safari, and 0 in Chromium (#2297,
 * `engineering/decisions/2026-09-22-webkit-tspan-baseline.md`).
 *
 * WHY IT NEEDS A GATE AT ALL, AND WHY THIS ONE IS TEXT-SHAPED. Every gate in
 * this repo renders through headless Chromium — `npm test`, the integration
 * tier, the PDF path, CI. None of them can see a WebKit-only paint, so nothing
 * here asserts the painted result; `tools/audit-svg-baselines.mjs` does that
 * on demand, against a real WebKit. What CAN be gated is the SOURCE invariant:
 * wherever we declare a baseline, it is declared one level down as well.
 *
 * Three arms, and each covers a surface the other two cannot see:
 *   1. The kernel — `wrapSvgLabel` actually emits it on both nodes (behavioral).
 *   2. The census — every `<tspan>` builder in the chart bucket is listed with
 *      what it owes, so a fourth cannot appear quietly. Text-matched, so it
 *      fails on a new emitter AND on a stale entry.
 *   3. The stylesheets — a CSS rule that sets `dominant-baseline` on a class has
 *      a companion rule carrying it to that class's tspans. This is the arm that
 *      earns its keep: the kernel fix covers a label whose emitter DECLARES the
 *      baseline, and a CSS-only baseline is exactly the case it does not reach.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { wrapSvgLabel } = require('../../../lib/components/chart/_chart-family/svg-label');

describe('wrapSvgLabel — the baseline reaches every tspan', () => {
  test('a declared baseline lands on the <text> AND on each <tspan>', () => {
    const { svg, lines } = wrapSvgLabel('a label long enough to wrap onto several lines', {
      x: 10, y: 30, width: 40, fontSize: 8, baseline: 'central', vAlign: 'middle',
    });
    assert.ok(lines.length > 1, 'fixture must actually wrap, or the assertion proves nothing');
    assert.match(svg, /<text[^>]*dominant-baseline="central"/);
    const tspans = svg.match(/<tspan[^>]*>/g) || [];
    assert.equal(tspans.length, lines.length);
    for (const t of tspans) assert.match(t, /dominant-baseline="central"/, t);
  });

  test('each baseline value travels verbatim — `hanging` drifted worst of all', () => {
    for (const baseline of ['hanging', 'middle', 'central', 'auto']) {
      const { svg } = wrapSvgLabel('word', { x: 0, y: 0, width: 100, fontSize: 8, baseline });
      assert.match(svg, new RegExp(`<tspan[^>]*dominant-baseline="${baseline}"`), baseline);
    }
  });

  test('no declared baseline still emits no attribute — the untouched default', () => {
    const { svg } = wrapSvgLabel('word', { x: 0, y: 0, width: 100, fontSize: 8 });
    assert.ok(!svg.includes('dominant-baseline'), svg);
  });
});

/**
 * Every site in the chart bucket that BUILDS a `<tspan>`, and what each owes.
 *
 * A census rather than a blanket rule, because two of the four legitimately owe
 * nothing and a blanket rule would either fail them or be widened until it
 * certified everything. `owes` is the mechanism, not a preference.
 */
const TSPAN_BUILDERS = [
  {
    file: 'lib/components/chart/_chart-family/svg-label.js',
    owes: 'kernel',
    why: 'the shared wrapping emitter behind ~10 chart transforms; it owns the ' +
      'baseline whenever a caller declares one and repeats it per line. It ' +
      'interpolates the attribute rather than writing it literally, which no text ' +
      'matcher can read — the behavioral suite above is its assertion, and this ' +
      'entry only records that it is covered there',
  },
  {
    file: 'lib/components/chart/state-chart/state-chart.transform.js',
    owes: 'attr',
    why: 'two hand-rolled emitters (the node label and the multi-line edge label) ' +
      'that predate the kernel and set the baseline on their own <text>',
  },
  {
    file: 'lib/components/chart/_chart-family/svg-legend.js',
    owes: 'none',
    why: 'declares no dominant-baseline anywhere — every line is positioned by an ' +
      'explicit baseline y, so there is nothing to carry down and WebKit and ' +
      'Chromium already agree (measured at 0.7px, rasterization noise)',
  },
  {
    file: 'lib/components/chart/_chart-family/standalone-svg.js',
    owes: 'style',
    why: 'sets an inline `style` ON the tspan it creates, not on an ancestor, so ' +
      'the value is already one level down',
  },
];

// `<tspan ` or `<tspan"` — an opening tag with attributes to follow. Prose saying
// `<tspan>` does not match, which is why the doc comments in these files do not
// register as emitters.
const BUILDS_TSPAN = /<tspan[ "]|createElementNS\([^)]*['"]tspan['"]/;

function chartSources(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) chartSources(rel, out);
    else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) out.push(rel);
  }
  return out;
}

describe('the tspan-builder census', () => {
  test('no builder appears or disappears unlisted', () => {
    const found = chartSources('lib/components/chart').filter((f) => BUILDS_TSPAN.test(read(f)));
    const listed = TSPAN_BUILDERS.map((b) => b.file);
    assert.deepEqual(found.sort(), listed.sort(),
      'A <tspan> builder in lib/components/chart is not on TSPAN_BUILDERS (or a listed ' +
      'one no longer builds any). Add it with what it owes, or drop the stale entry — ' +
      'the whole point is that a new one cannot arrive silently, because no gate in ' +
      'this repo renders WebKit.');
  });

  for (const b of TSPAN_BUILDERS.filter((x) => x.owes === 'attr')) {
    test(`${b.file} — every emitted tspan carries the baseline`, () => {
      const src = read(b.file);
      for (const [i, line] of src.split('\n').entries()) {
        if (!BUILDS_TSPAN.test(line)) continue;
        // The attribute may be interpolated on the same line or on the next one
        // (the kernel spreads its template across two).
        const window = line + '\n' + (src.split('\n')[i + 1] || '');
        assert.match(window, /dominant-baseline/,
          `${b.file}:${i + 1} builds a <tspan> with no dominant-baseline on it. ${b.why}.`);
      }
    });
  }

  for (const b of TSPAN_BUILDERS.filter((x) => x.owes === 'none')) {
    test(`${b.file} — still declares no baseline at all`, () => {
      assert.ok(!read(b.file).includes('dominant-baseline'),
        `${b.file} now sets a dominant-baseline, so the census entry is stale: it owes ` +
        `'attr' on its tspans. ${b.why}.`);
    });
  }

  for (const b of TSPAN_BUILDERS.filter((x) => x.owes === 'style')) {
    test(`${b.file} — the baseline rides an inline style on the tspan itself`, () => {
      const src = read(b.file);
      assert.match(src, /dominant-baseline:\s*central/,
        `${b.file} no longer writes the baseline into its declaration. ${b.why}.`);
      assert.match(src, /span\.setAttribute\('style'/,
        `${b.file} no longer applies that declaration to the tspan it created, so the ` +
        'value is back on an ancestor and WebKit will ignore it.');
    });
  }
});

/**
 * The stylesheets. A rule like `.cart-tick { dominant-baseline: central }` matches
 * the `<text>` and nothing else — in WebKit the tspan inside it still paints
 * alphabetic, exactly as if the rule were absent. So every class a chart
 * stylesheet gives a baseline needs a companion rule reaching its tspans.
 */
const CHART_CSS = [
  'lib/components/chart/_chart-family/chart-family.css',
  'lib/components/chart/funnel/funnel.styles.css',
  'lib/components/chart/word-cloud/word-cloud.styles.css',
];

/** Class names in a selector, and whether the selector targets a `tspan`. */
function baselineRules(css) {
  const rules = [];
  // Comments carry example selectors; strip them before matching.
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of body.matchAll(/([^{}]+)\{([^{}]*dominant-baseline[^{}]*)\}/g)) {
    const sel = m[1].trim();
    rules.push({
      sel,
      classes: [...sel.matchAll(/\.([\w-]+)/g)].map((c) => c[1]),
      onTspan: /\btspan\b/.test(sel),
    });
  }
  return rules;
}

describe('the stylesheet companion rules', () => {
  test('every chart stylesheet that sets a baseline is in the list', () => {
    const found = chartCssFiles().filter((f) => read(f).includes('dominant-baseline'));
    assert.deepEqual(found.sort(), [...CHART_CSS].sort(),
      'A chart stylesheet sets dominant-baseline and is not covered here.');
  });

  for (const file of CHART_CSS) {
    test(`${file} — each styled class reaches its tspans`, () => {
      const rules = baselineRules(read(file));
      const covered = new Set(rules.filter((r) => r.onTspan).flatMap((r) => r.classes));
      const declared = new Set(rules.filter((r) => !r.onTspan).flatMap((r) => r.classes));
      assert.ok(declared.size > 0, 'fixture: expected at least one styled class');
      for (const c of declared) {
        assert.ok(covered.has(c),
          `.${c} gets a dominant-baseline from CSS but no rule carries it to its ` +
          '<tspan>. In WebKit the rule then does nothing for a wrapped label — it ' +
          'paints alphabetic, about a font-size high. Add .' + c + ' to the ' +
          'companion tspan rule in this file.');
      }
      // A stale companion is a defect too: it says a class is protected when the
      // declaration it mirrors is gone.
      for (const c of covered) {
        assert.ok(declared.has(c),
          `.${c} has a tspan companion rule but nothing sets its baseline any more — ` +
          'drop the stale entry.');
      }
    });
  }
});

function chartCssFiles(dir = 'lib/components/chart', out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) chartCssFiles(rel, out);
    else if (e.name.endsWith('.css')) out.push(rel);
  }
  return out;
}
