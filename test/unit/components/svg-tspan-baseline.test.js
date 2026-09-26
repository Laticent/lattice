/**
 * Unit: `dominant-baseline` reaches the `<tspan>`, on every surface that sets one.
 *
 * THE DEFECT THIS PINS. A `<tspan>` carries its own `dominant-baseline: auto`,
 * and BOTH SVG 1.1 (§10.9.2) and SVG 2 say that on a tspan `auto` keeps the
 * PARENT's dominant baseline. Chromium does that, so a positioned tspan centers
 * on its `y`. WebKit resolves it to `alphabetic` instead — conforming to neither
 * spec — so `y` becomes the glyph baseline and the label paints high: 0.35em for
 * `central`, 0.72em for `hanging`. On the chart gallery that put 107 of 256
 * labels 4–13px high on a 1280×720 slide in Safari, and 0 in Chromium (#2297,
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
    file: 'lib/components/chart/flowchart/flowchart.layout.js',
    owes: 'attr',
    why: 'the browser pass paints each shape name and note as one <text> of measured ' +
      'lines, centred with `central`, so every line carries it',
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

// An opening `<tspan` tag with SOMETHING to follow — an attribute, a closing
// quote, or a string concatenation (`'<tspan' + attrs`). Prose saying `<tspan>`
// does not match, which is why the doc comments in these files do not register
// as emitters. The concatenation form matters: an earlier cut required a space
// or a double quote right after the tag name, and `'<tspan' + posAttrs(i)` was
// then invisible to BOTH the file census and the per-line check.
const BUILDS_TSPAN = /<tspan(?![>a-zA-Z])|createElementNS\([^)]*['"]tspan['"]/;

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
      const lines = read(b.file).split('\n');
      for (const [i, line] of lines.entries()) {
        if (!BUILDS_TSPAN.test(line)) continue;
        // Two lines, because an emitter may spread one tspan template across a
        // pair. But the window is CUT at the first `<text` after the `<tspan`:
        // the idiomatic shape puts the wrapping `<text>` — which legitimately
        // carries the attribute — on the very next line, and a window that
        // swallowed it would certify a tspan with no baseline at all, the exact
        // defect this file exists for.
        const window = (line + '\n' + (lines[i + 1] || '')).split('<tspan').slice(1).join('<tspan');
        const upToText = window.split('<text')[0];
        assert.match(upToText, /dominant-baseline/,
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

/**
 * Every rule that sets a `dominant-baseline`: the classes it names, the VALUE it
 * sets, and whether it targets a `tspan`.
 *
 * The value is carried because a companion rule that sets the WRONG one is worse
 * than a missing companion: it out-specifies both the `<text>` rule and any
 * presentation attribute, so the tspan paints one baseline while its `<text>`
 * paints another — wrong in BOTH engines and in the PDF, where a missing
 * companion is at least correct everywhere Chromium renders.
 */
function baselineRules(css) {
  const rules = [];
  // Comments carry example selectors; strip them before matching.
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Split on braces rather than matching rules with a regex. `([^{}]+)\{…\}` is
  // quadratic — the unbounded selector match is retried at every offset, so a long
  // brace-free stretch costs O(n^2) (measured 0.5s at 2k repetitions, 500s at 64k).
  // CodeQL flags this exact shape as high severity wherever it can trace the input
  // to something untrusted; it is the same defect where it cannot. A split is
  // linear and keeps the `[^{}]` semantics: a selector is the run of text since the
  // last brace of either kind.
  const chunks = body.split(/([{}])/);
  for (let k = 1; k < chunks.length; k += 2) {
    // `{` followed by text and then `}` is a rule. `{` followed by another `{` is
    // a nested block (`@media`), whose inner rules are visited on their own turn.
    if (chunks[k] !== '{' || chunks[k + 2] !== '}') continue;
    const decls = chunks[k + 1];
    if (!decls.includes('dominant-baseline')) continue;
    const sel = chunks[k - 1].trim();
    const parts = compounds(sel);
    const onTspan = parts.at(-1) === 'tspan';
    // The SUBJECT compound — what the rule actually selects. For a tspan rule
    // that is the compound before `tspan`, whose classes are the ones being
    // covered. Reading classes from the WHOLE selector instead is how a rule
    // like `:is(section.funnel, …) svg text` certifies itself: its ancestor
    // classes are already in the covered set from some other rule, while the
    // thing it really styles is a bare element.
    const subject = onTspan ? (parts.at(-2) || '') : (parts.at(-1) || '');
    rules.push({
      sel,
      subject,
      classes: [...subject.matchAll(/\.([\w-]+)/g)].map((c) => c[1]),
      value: (decls.match(/dominant-baseline:\s*([\w-]+)/) || [])[1] || null,
      onTspan,
    });
  }
  return rules;
}

/**
 * A selector split into its compounds — the whitespace/combinator-separated
 * pieces — with parentheses respected, so `:is(a, b) .c tspan` is three pieces
 * and not five.
 */
function compounds(sel) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && /[\s>+~]/.test(ch)) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
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
      // A class -> value map on each side. A class set alone cannot catch a
      // companion that carries the wrong value, which is the worse of the two
      // defects this arm exists to find.
      const sideOf = (onTspan) => {
        const m = new Map();
        for (const r of rules.filter((x) => x.onTspan === onTspan)) {
          for (const c of r.classes) m.set(c, r.value);
        }
        return m;
      };
      const covered = sideOf(true);
      const declared = sideOf(false);
      assert.ok(declared.size > 0, 'fixture: expected at least one styled class');

      // A selector naming no class at all (`section.chart-frame svg text`) is
      // outside what a class map can reason about, so it would be certified by
      // silence. Refuse it rather than pass it.
      for (const r of rules) {
        assert.ok(r.classes.length > 0,
          `\`${r.sel}\` sets a dominant-baseline, but the thing it selects ` +
          `(\`${r.subject}\`) names no class — so this arm cannot tell whether its ` +
          'tspans are covered, and would certify it by silence. Scope it to a ' +
          'class, or teach this check the shape.');
      }

      for (const [c, value] of declared) {
        assert.ok(covered.has(c),
          `.${c} gets a dominant-baseline from CSS but no rule carries it to its ` +
          '<tspan>. In WebKit the rule then does nothing for a wrapped label — it ' +
          'paints alphabetic. Add .' + c + ' to the companion tspan rule in this file.');
        assert.equal(covered.get(c), value,
          `.${c}'s companion tspan rule sets \`${covered.get(c)}\` while its <text> ` +
          `rule sets \`${value}\`. The companion out-specifies both the <text> rule ` +
          'and any presentation attribute, so the line and its box would paint ' +
          'different baselines in EVERY engine — not just WebKit.');
      }
      // A stale companion is a defect too: it says a class is protected when the
      // declaration it mirrors is gone.
      for (const c of covered.keys()) {
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
