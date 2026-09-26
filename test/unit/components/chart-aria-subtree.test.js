/**
 * Census: every chart `<svg>` hides its marks from the accessibility tree.
 *
 * WHAT WENT WRONG, AND WHY A SOURCE TEST IS THE RIGHT GUARD.
 * ARIA calls `role="img"` children-presentational, so the whole chart family
 * was built on the belief that putting it on the `<svg>` root pruned everything
 * beneath it. Ten docblocks across nine components stated it outright — "it
 * PRUNES the whole subtree", "this `<desc>` is the ONLY route a screen reader
 * has" — and the descs were written to carry the entire dataset on that
 * understanding.
 *
 * Chromium does not implement it that way for SVG. Measured over the rendered
 * chart gallery with CDP `Accessibility.getFullAXTree`, every one of the
 * fifteen chart roots exposed its accessible name AND every text node beneath
 * it: 24 unignored descendants under `bar`, 223 under `map`. A screen reader
 * heard the curated sentence and could then walk into `North America`, `EMEA`,
 * `$4.2M` as loose text — the same numbers a second time, stripped of the
 * relationship that made them mean anything.
 *
 * The claim had been wrong for as long as it had been written down, and nothing
 * in the tree could tell. That is what this file is for.
 *
 * WHY NOT DRIVE THE REAL AX TREE HERE. Because the real measurement needs a
 * browser, and a unit test that launches Chromium is one nobody runs. The
 * browser measurement is the EVIDENCE (it is how the defect was found and how
 * the fix was confirmed, per HARD RULE #23); this arm pins the MECHANISM that
 * evidence showed to work, so a member cannot quietly stop emitting it. The two
 * are different jobs and this one is deliberately the cheap one.
 *
 * WHAT IT DOES NOT COVER, stated rather than implied:
 *   · `state-chart` writes its geometry at RUNTIME (`installStateChartLayout`
 *     → `draw()`), so no build-time string carries its marks. It is checked by
 *     source instead — the one `svg.innerHTML =` assignment must go through the
 *     wrapper.
 *   · The `state-index` BADGE is an HTML `<span role="img" aria-label>`, not an
 *     SVG root, and it leaks its own numeral. That is left alone on purpose:
 *     its docblock records that hiding it once removed the state identifier the
 *     transitions reference, which was worse. Verbose beats missing there.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');

const ROOT = path.join(__dirname, '..', '..', '..');
const P = (p) => path.join(ROOT, p);
const { transformChartSection } = require(P('lib/components/chart/_chart-family/chart-family.js'));
const md = new MarkdownIt({ html: true });

/**
 * One authored slide per chart that emits an `<svg role="img">` root at build
 * time. Kept as real markdown rather than fixtures so a member that changes its
 * authoring shape fails here loudly instead of silently rendering nothing.
 */
const SLIDES = {
  bar: '## B.\n\n- North America `4.2M`\n- EMEA `3.1M`\n- APAC `2.4M`\n',
  'stacked-bar': '## S.\n\n- Q1\n  - New `12`\n  - Renewal `8`\n- Q2\n  - New `14`\n  - Renewal `9`\n',
  line: '## L.\n\n- Q1 2025 `4.2`\n- Q2 2025 `5.1`\n- Q3 2025 `6.4`\n',
  waterfall: '## W.\n\n- Opening `10`\n- Upsell `+3`\n- Churn `-2`\n- Closing `11`\n',
  scatter: '## Sc.\n\n- Atlas `$420k` `18%`\n- Borealis `$310k` `24%`\n- Cardinal `$180k` `52%`\n',
  slope: '## Sl.\n\n- Northwind\n  - 2023 `31%`\n  - 2026 `24%`\n- Kestrel\n  - 2023 `22%`\n  - 2026 `29%`\n',
  bullet: '## Bu.\n\n- Qualified pipeline `128%` `100%`\n- New ARR `4.2M` `5M`\n',
  funnel: '## F.\n\n- Visitors `12000`\n- Signups `4800`\n- Paid `1200`\n',
  piechart: '## P.\n\n- Alpha `46`\n- Beta `32`\n- Gamma `22`\n',
  radar: '## R.\n\n- Meridian\n  - Speed `8`\n  - Cost `6`\n  - Care `7`\n',
  'hub-spoke': '## HS.\n\n- Program office\n  - Onboarding `at-risk`\n  - Governance\n  - Branch network\n',
  'hub-spoke tiered': '## HT.\n\n- Platform org\n  - Payments\n    - Acquiring\n    - Fraud `blocked`\n  - Data\n    - Warehouse\n',
  quadrant: '`[{Effort, 0..10}, {Reach, 0..100}]`\n\n## Q.\n\n- Bets\n  - Scoring v2 `3, 70`\n'
    + '- Wins\n  - Weekly brief `8, 40`\n- Defer\n  - Weighting UI `4, 55`\n- Sinks\n  - Exports `2, 20`\n',
  gantt: '`Q1 2025 - Q4 2025`\n\n## G.\n\n- Build\n  - Kernel `Q1-Q2`\n  - Ship `Q3-Q4`\n',
  'word-cloud': '## WC.\n\n- alpha `9`\n- beta `7`\n- gamma `5`\n- delta `3`\n',
  // A MULTI-ROOT VARIANT, and the reason the per-root scan below exists. The
  // small-multiples radar emits one `<svg role="img">` PER SERIES, and the
  // family-wide pass missed every one of them: measured on the shipped radar
  // gallery, 5 of 15 roots still exposed their subtree and four were these.
  // A document-wide `assert.match(html, /<g aria-hidden/)` cannot see that —
  // one wrapped root satisfies it for the whole slide.
  'radar small-multiples': '## RM.\n\n- Meridian\n  - Speed `8`\n  - Cost `6`\n  - Care `7`\n'
    + '- Kestrel\n  - Speed `6`\n  - Cost `8`\n  - Care `5`\n',
  heatmap: '## H.\n\n|  | M0 | M1 |\n| --- | --: | --: |\n| Jan | 100 | 62 |\n| Feb | 100 | 58 |\n',
  map: '## M.\n\n- Kenya `4.2`\n- Nigeria `3.1`\n- India `2.8`\n',
};

/**
 * Every text node in `html` that a screen reader would still reach — i.e. one
 * that sits outside every `aria-hidden` subtree.
 *
 * A SCAN, NOT A REGEX MATCH. The first cut of this file asserted
 * `/<g aria-hidden="true">/` against the whole document, which a multi-root
 * chart passes as soon as ONE of its roots is wrapped — exactly how the
 * small-multiples radar slipped through. This walks the tag stream instead and
 * tracks how deep inside `aria-hidden` it is, so a leak anywhere is visible
 * wherever it is.
 */
function exposedText(html, tags = ['text', 'tspan']) {
  const out = [];
  let depth = 0;          // open elements carrying aria-hidden="true"
  const stack = [];       // one entry per open element: was it aria-hidden?
  const TAG = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let m = TAG.exec(html);
  let textTag = null;
  while (m) {
    const [, closing, name, attrs, selfClose] = m;
    if (closing) {
      if (textTag === name) textTag = null;
      const wasHidden = stack.pop();
      if (wasHidden) depth--;
    } else if (!selfClose) {
      const hidden = /aria-hidden\s*=\s*"true"/.test(attrs);
      stack.push(hidden);
      if (hidden) depth++;
      if (tags.includes(name) && depth === 0) textTag = name;
    }
    const next = TAG.exec(html);
    if (textTag && depth === 0) {
      const slice = html.slice(m.index + m[0].length, next ? next.index : html.length).trim();
      if (slice) out.push(slice);
    }
    m = next;
  }
  return out;
}

/** Every `<svg …>` opening tag in a rendered chart, with its attributes. */
function svgRoots(html) {
  return [...html.matchAll(/<svg\b([^>]*)>/g)].map((m) => m[1]);
}

describe('chart SVGs hide their marks from the accessibility tree', () => {
  for (const [cls, body] of Object.entries(SLIDES)) {
    test(`${cls}: the marks sit in an aria-hidden group`, () => {
      const res = transformChartSection(md.render(body), cls, 'landscape');
      assert.ok(res?.transformed, `${cls} did not transform — the authored sample is wrong, not the component`);

      const roots = svgRoots(res.html);
      assert.ok(roots.length > 0, `${cls} emitted no <svg> root`);

      // Every root that claims to be an image must either hide itself outright
      // (a decorative basemap) or carry the marks group.
      const imgRoots = roots.filter((a) => /role="img"/.test(a));
      assert.ok(imgRoots.length > 0, `${cls} emitted no <svg role="img"> root`);

      // PER ROOT, not per document. `<title>`/`<desc>` are the curated route and
      // are meant to stay reachable; every OTHER text node is a mark and must
      // not be.
      const leaked = exposedText(res.html)
        .filter((t) => !res.html.includes(`<title>${t}</title>`))
        .filter((t) => !res.html.includes(`<desc>${t}</desc>`));
      assert.deepEqual(
        leaked, [],
        `${cls} leaves ${leaked.length} mark(s) in the accessibility tree: ${JSON.stringify(leaked.slice(0, 6))}\n`
        + '  `role="img"` does NOT prune an SVG subtree in Chromium — measured, 24 unignored\n'
        + '  descendants under `bar` alone — so without an aria-hidden group a screen reader\n'
        + '  reads the curated <desc> and then every tick and label again as loose text.\n'
        + '  Wrap the marks with cartesian.js § ariaHiddenMarks.\n',
      );
    });
  }

  test('the accessible name and description stay OUTSIDE the hidden group', () => {
    // The whole point of hiding the marks is that <title>/<desc> become the
    // route to the data. Hiding them too would leave the chart nameless — a
    // strictly worse outcome than the leak, and an easy mistake when wrapping.
    // A PER-ROOT CHECK, and the two things it must NOT do — both learned by
    // getting them wrong here first.
    //
    // It must not treat every `<title>` as a chart name. `map` emits 176 of
    // them, one per country path, and those belong INSIDE the hidden group
    // exactly like the marks; only the root's own title is the accessible name.
    //
    // And it must not require a `<title>` at all. A small-multiples mini names
    // itself with `aria-label` on the root, which is an equally valid
    // accessible name — demanding a title would fail a chart that is correct.
    for (const [cls, body] of Object.entries(SLIDES)) {
      const { html } = transformChartSection(md.render(body), cls, 'landscape');
      const reachable = new Set(exposedText(html, ['title', 'desc']));
      const named = [];
      for (const m of html.matchAll(/<svg\b([^>]*)>/g)) {
        if (!/role="img"/.test(m[1])) continue;          // a decorative root needs no name
        if (/aria-hidden\s*=\s*"true"/.test(m[1])) continue;
        const label = /aria-label="([^"]*)"/.exec(m[1]);
        const after = html.slice(m.index + m[0].length);
        const title = /^\s*<title>([^<]*)<\/title>/.exec(after);
        const name = label?.[1].trim() || title?.[1].trim() || '';
        named.push({
          name,
          reachable: Boolean(label?.[1].trim() || (title && reachable.has(title[1].trim()))),
        });
      }
      assert.ok(named.length > 0, `${cls}: no <svg role="img"> root to name`);
      const nameless = named.filter((r) => !r.name || !r.reachable);
      assert.equal(
        nameless.length, 0,
        `${cls}: ${nameless.length} of ${named.length} chart root(s) have no reachable accessible name — `
        + 'either no aria-label and no <title>, or a <title> buried inside the aria-hidden group. '
        + 'That is strictly worse than the leak the wrapper fixes: the chart becomes anonymous.',
      );
    }
  });

  test('state-chart marks its runtime geometry aria-hidden IN PLACE', () => {
    // Its geometry is written by draw() in the browser, so no build-time string
    // carries it — pinned at the source instead, see the file docblock.
    //
    // AND IT IS THE ONE MEMBER THAT MUST NOT USE THE SHARED WRAPPER. Wrapping
    // its marks in a `<g>` moved the drawing: `check:chart-fit` went red at
    // square with the machine painting ~40px outside its stage on both sides,
    // reproducibly, twice on each arm. It is the family's only runtime-laid-out
    // member — it measures the document it just wrote and scales itself to fit —
    // so an element that is free everywhere else is not free here. This arm
    // therefore pins the OPPOSITE of the others: no wrapper, and an explicit
    // per-child marking pass that skips <title>/<desc>.
    const src = fs.readFileSync(P('lib/components/chart/state-chart/state-chart.transform.js'), 'utf8');
    const writes = [...src.matchAll(/svg\.innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.equal(writes.length, 1, `expected exactly one svg.innerHTML assignment, found ${writes.length}`);
    assert.doesNotMatch(
      writes[0], /ariaHiddenMarks\(/,
      'state-chart must NOT use the shared wrapper — the extra <g> moves its layout '
      + 'and takes check:chart-fit red at square.',
    );
    assert.match(
      src, /for \(const el of[^)]*svg\.children[\s\S]{0,500}setAttribute\('aria-hidden', 'true'\)/,
      'state-chart\'s runtime redraw leaves its geometry in the accessibility tree.\n'
      + '  It must mark the children it just wrote, or every state name and edge label is\n'
      + '  read aloud a second time after the <desc>.\n',
    );
    assert.match(
      src, /tag === 'title' \|\| tag === 'desc'/,
      'the marking pass must skip <title>/<desc>, or the chart loses its accessible name',
    );
    // The pass must survive the synthetic DOM the kernel's own tests build.
    // Unguarded it threw `svg.children is not iterable` and took 72 arms with it:
    // an a11y decoration must never be the reason a render fails.
    assert.match(
      src, /svg\.children \? \[\.\.\.svg\.children\] : \[\]/,
      'the marking pass must tolerate a DOM with no children collection',
    );
  });
});
