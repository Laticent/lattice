/**
 * Unit tests for matrix-grid's chart-family builder
 * (lib/components/chart/matrix-grid/matrix-grid.transform.js buildMatrixGridSection).
 *
 * buildMatrixGridSection runs on the raw section HTML before the generic
 * chart-frame skeleton wrap (eyebrow/h2/subtitle/caption lift). It does three
 * things: splits a two-part eyebrow ("column axis · row axis") so the row
 * axis renders as a rotated side label, wraps the table in
 * `.matrix-grid-figure`, and wraps the trailing legend paragraph's inner
 * content in one `<span>` (once so the shared `.chart-caption` rule, then a flex
 * column, didn't tear a `<strong>…</strong> · <em>…</em>` legend into stacked
 * lines; the caption is a block now, and the span stays as the legend's name).
 *
 * Several cases below are regression locks for an independent checker's
 * findings on the initial implementation: an unanchored eyebrow regex that
 * could shred a code-only subtitle or legend (finding #3), `String.replace`
 * special replacement patterns (`$&`, `` $` ``, `$'`, `$$`) splicing
 * unrelated HTML into the table or legend when a cell/legend contained one
 * literally (finding #2), and the row axis being escaped twice — once by
 * markdown-it's own HTML-entity escaping, once by `escAttr` — corrupting an
 * `&` in the label (finding #4).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildMatrixGridSection } = require('../../../lib/components/chart/matrix-grid/matrix-grid.transform');

const ctx = { cls: 'matrix-grid', classTokens: ['matrix-grid'], orientation: 'landscape' };

describe('buildMatrixGridSection', () => {
  test('a bracketed list above the table becomes the axis labels, arrows generated', () => {
    const html = [
      '<h2>Title</h2>',
      '<p><code>[Wider reach, Deeper cognition]</code></p>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    // The axis paragraph is consumed entirely — it is chrome for the grid, not
    // body copy, so it must not also render as a stray code pill.
    assert.doesNotMatch(out, /<p>\s*<code>/);
    // Arrows are GENERATED: the author wrote only the axis names. The row axis
    // is pre-flipped (▼ displays as ▲ after the label's 180° rotation).
    assert.match(out, /data-col-axis="Wider reach ▶"/);
    assert.match(out, /data-row-axis="Deeper cognition ▼"/);
    assert.match(out, /<div class="matrix-grid-figure"[^>]*><table>/);
  });

  test('an arrow the author typed anyway is stripped, never doubled', () => {
    for (const [c, r] of [['Wider reach →', 'Deeper cognition ↑'], ['Wider reach ▶', 'Deeper cognition ▲']]) {
      const html = `<h2>Title</h2><p><code>[${c}, ${r}]</code></p><table><tbody><tr><td>a</td></tr></tbody></table>`;
      const { html: out } = buildMatrixGridSection(html, ctx);
      assert.match(out, /data-col-axis="Wider reach ▶"/, c);
      assert.match(out, /data-row-axis="Deeper cognition ▼"/, r);
    }
  });

  test('no axis paragraph: the grid renders with no axis labels at all', () => {
    const html = '<h2>Title</h2><table><tbody><tr><td>a</td></tr></tbody></table>';
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.doesNotMatch(out, /data-col-axis/);
    assert.doesNotMatch(out, /data-row-axis/);
    assert.match(out, /<div class="matrix-grid-figure">\s*<table>/);
  });

  test('a paragraph with only ONE code is not an axis pair — left as a plain eyebrow', () => {
    const html = [
      '<p><code>Wider reach →</code></p>',
      '<h2>Title</h2>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.match(out, /<p><code>Wider reach →<\/code><\/p>/);
    assert.doesNotMatch(out, /data-row-axis/);
    assert.doesNotMatch(out, /data-col-axis/);
  });

  test('no eyebrow at all: the table still wraps, no data-row-axis', () => {
    const html = '<h2>Title</h2><table><tbody><tr><td>a</td></tr></tbody></table>';
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.match(out, /<div class="matrix-grid-figure">\s*<table>/);
    assert.doesNotMatch(out, /data-row-axis/);
  });

  test('legend: wraps the trailing paragraph inner content in one span', () => {
    const html = [
      '<h2>Title</h2>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
      '<p><strong>Your level</strong> · <em>reachable</em> — a caveat.</p>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.match(
      out,
      /<p><span class="matrix-grid-legend"><strong>Your level<\/strong> · <em>reachable<\/em> — a caveat\.<\/span><\/p>/,
    );
  });

  test('regression (finding #3a): an unanchored eyebrow regex must not shred a code-only SUBTITLE after the h2', () => {
    // No eyebrow before the h2 — the code pill below is the subtitle. An
    // unanchored scan for "the first <p><code>…</code></p> anywhere" finds
    // this one instead, truncates it at the first "·", and steals the rest
    // into data-row-axis — even though it never appeared before the heading.
    const html = [
      '<h2>Title</h2>',
      '<p><code>Read · this way</code></p>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.doesNotMatch(out, /data-row-axis/, 'a post-h2 code pill is never the eyebrow');
    assert.match(out, /<p><code>Read · this way<\/code><\/p>/, 'the subtitle survives intact');
  });

  test('regression (finding #3b): an unanchored eyebrow regex must not shred a code-only LEGEND', () => {
    const html = [
      '<h2>Title</h2>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
      '<p><code>filled · outlined</code></p>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.doesNotMatch(out, /data-row-axis/, 'a trailing code pill is never the eyebrow');
    assert.match(out, /<span class="matrix-grid-legend"><code>filled · outlined<\/code><\/span>/);
  });

  test('regression (finding #2a): a table cell containing "$\'" must not splice the legend into the table', () => {
    const html = [
      '<h2>Title</h2>',
      "<table><tbody><tr><td>Cost $' each</td></tr></tbody></table>",
      '<p>a distinctive legend sentence</p>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.doesNotMatch(out, /a distinctive legend sentence[\s\S]*<\/table>/, 'the legend must not appear inside the table');
    assert.match(out, /Cost \$' each/, 'the literal cell text survives unmangled');
  });

  test('regression (finding #2b): a legend containing "$&", "$\'" or "$`" must not corrupt the caption', () => {
    const html = [
      '<h2>Title</h2>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
      "<p>Cost per $&amp; unit and $` and $' here.</p>",
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    // The wrapped legend must be exactly one span with the literal text intact —
    // no nested <p>, no duplicated/garbled fragments from $-pattern substitution.
    assert.match(
      out,
      /<p><span class="matrix-grid-legend">Cost per \$&amp; unit and \$` and \$' here\.<\/span><\/p>/,
    );
  });

  test('regression (finding #4): the row axis is escaped exactly once — a literal "&" round-trips as one entity', () => {
    const html = [
      '<h2>Title</h2>',
      '<p><code>[Wider reach, Research &amp; development]</code></p>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    // Exactly one level of escaping: the attribute value decodes (by any HTML
    // parser) to "Research & development ▼" — never "&amp;" surviving as
    // literal text inside the attribute. (The trailing glyph is normalized
    // to a pre-flipped solid triangle — see the two-part eyebrow test above.)
    assert.match(out, /data-row-axis="Research &amp; development ▼"/);
    assert.doesNotMatch(out, /&amp;amp;/, 'the ampersand must not be double-escaped');
  });

  test('a table with no eyebrow and no legend still wraps cleanly', () => {
    const html = '<h2>Title</h2><table><tbody><tr><td>a</td></tr></tbody></table>';
    const { html: out, cls } = buildMatrixGridSection(html, ctx);
    assert.match(out, /<div class="matrix-grid-figure">/);
    assert.equal(cls, ctx.cls);
  });
});

// ── Column geometry: the fixed/auto split, and the source order that lands it ──
//
// The table is `table-layout: fixed` so a column width is never a function of
// the text inside it — under `auto` the web font landing after first paint
// re-solved every column and slid every cell sideways, with nothing
// overflowing for a fit gate to report (see the rule's own comment).
//
// That only holds at WIDE. Every narrower family puts `auto` back, because
// `--canvas-scale` raises the type as the box narrows and the content stops
// fitting inside equal columns. Square was the expensive lesson: it was left on
// `fixed` in the first cut and "Distinguished" painted 25.2px straight through
// its own pill (44.5px under `mode: sketch`) — silently, because `.cell` is
// `overflow: visible` and the spill lands inside `.chart-body`, so neither the
// clip probe nor any golden caught it.
//
// Two things therefore need pinning, and neither is the tautology "the file says
// what it says":
//
//   1. The `auto` arm names EVERY non-wide family. `wide` is the ABSENCE of the
//      stamp (lib/adaptive/families.js), so the arm must carry the other three by
//      name; dropping one silently re-introduces the square bug on that family.
//   2. The arm comes AFTER the base rule. It TIES on specificity (`:where()`
//      contributes 0), so source order is the only thing landing it — the same
//      construction the type-step block beside it depends on, and the same one
//      its comment warns about: "Moving this block up silently disables it."
//
// A reorder or a dropped family leaves valid CSS and a green build.
describe('matrix-grid column geometry', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  // Comments stripped first: both declarations are DISCUSSED in the prose above
  // them, so an index into the raw file finds the explanation, not the rule.
  const CSS = fs
    .readFileSync(
      path.join(__dirname, '../../../lib/components/chart/matrix-grid/matrix-grid.styles.css'),
      'utf8',
    )
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const fixedAt = CSS.indexOf('table-layout: fixed');
  const autoAt = CSS.indexOf('table-layout: auto');

  test('the base table is fixed-layout, so column widths do not read the cell text', () => {
    assert.notEqual(fixedAt, -1, 'the base table rule must declare `table-layout: fixed`');
    assert.match(
      CSS.slice(0, fixedAt),
      /\.matrix-grid-figure table \{[^}]*$/,
      '`table-layout: fixed` must sit in the base `.matrix-grid-figure table` rule',
    );
  });

  test('the `auto` arm names every non-wide family — wide is the absence of the stamp', () => {
    assert.notEqual(autoAt, -1, 'a `table-layout: auto` arm must exist');
    // The selector list immediately preceding the declaration.
    const selector = CSS.slice(0, autoAt).split('}').pop();
    for (const family of ['square', 'tall', 'strip']) {
      assert.ok(
        selector.includes(`[data-family="${family}"]`),
        `the \`table-layout: auto\` arm must cover [data-family="${family}"] — omitting it leaves ` +
          'that family on the fixed layout, where a long cell label paints through its own pill ' +
          'with no clip probe and no golden to catch it (square, 25.2px, mode:sketch 44.5px)',
      );
    }
    assert.ok(
      selector.includes('figure.matrix-grid'),
      'the arm must cover the figure render path too, where the family stamp sits on an ancestor',
    );
  });

  test('the arm comes AFTER the base rule — source order is what makes it win', () => {
    assert.ok(
      autoAt > fixedAt,
      'the `table-layout: auto` arm ties the base rule on specificity, so moving it above ' +
        '`table-layout: fixed` silently disables it and every narrow family clips again',
    );
  });

  // The three arms above are POSITION assertions on the source text. An independent
  // checker showed that is narrower than "source order is what makes it win" sounds:
  // three edits break the cascade and leave all three green.
  //
  //   A  delete the `section.matrix-grid:where(…)` half of the arm, keep the `figure`
  //      half — the section path is the only reachable one, so every narrow family
  //      clips, and the family names are all still present in the file.
  //   B  raise the BASE rule to `:is(section.matrix-grid.chart-frame, …)` → (0,3,1).
  //      It then out-specifies the arm and order stops mattering. Not a strawman:
  //      this same file already makes exactly that move for `.chart-caption` below,
  //      and for the same reason.
  //   D  add `!important` to the base declaration.
  //
  // So the ordering claim needs the thing it actually depends on pinned: that the
  // base rule stays at the specificity the arm can tie. These two close A and B/D.
  test('the arm carries the SECTION path, not only the figure path', () => {
    const selector = CSS.slice(0, autoAt).split('}').pop();
    assert.match(
      selector,
      /section\.matrix-grid:where\(/,
      'the arm must carry `section.matrix-grid:where(…)`. The figure path has no producer ' +
        '(matrix-grid is absent from FLOW_CHART_COMPONENTS), so dropping the section half ' +
        'leaves the arm matching nothing and every narrow family back on the fixed layout',
    );
  });

  test('the base rule stays at a specificity the arm can tie', () => {
    const baseSelector = CSS.slice(0, fixedAt).split('}').pop();
    assert.match(
      baseSelector,
      /^\s*:is\(section\.matrix-grid, figure\.matrix-grid\) \.matrix-grid-figure table \{/,
      'the base rule must stay `:is(section.matrix-grid, figure.matrix-grid) .matrix-grid-figure ' +
        'table` — (0,2,1), which the arm ties so source order decides. Adding a class (e.g. ' +
        '`.chart-frame`, as the .chart-caption rule below does) takes it to (0,3,1) and the arm ' +
        'stops applying no matter where it sits',
    );
    assert.doesNotMatch(
      CSS.slice(fixedAt, CSS.indexOf('}', fixedAt)),
      /!important/,
      '`!important` on the base declaration defeats the arm regardless of order or specificity',
    );
  });
});

// ── The cell key ───────────────────────────────────────────────────────────
//
// matrix-grid's shape vocabulary shipped in a `STATE_LABELS` map whose words
// reached a screen reader and nobody looking at the slide. The key now draws
// them, and the interesting property is what it REFUSES to draw: `[x]` has no
// default, because a filled cell's own trailing text is its label. That refusal
// is declared in the manifest with its reason, not left as an absence.

describe('the cell key', () => {
  const {
    buildMatrixGridSection,
  } = require('../../../lib/components/chart/matrix-grid/matrix-grid.transform');
  const { labelSetFor } = require('../../../lib/core/label-set');

  const cell = (shape, text = '') => `<td><span class="cell ${shape}">${text}</span></td>`;
  // `extra` — the author's label set — goes BELOW the table now. Position is
  // what tells the lift a span is a KEY rather than an axis.
  const grid = (cells, extra = '') => '<h2>Rubric</h2>'
    + `<table><tbody><tr><td>A</td>${cells}</tr></tbody></table>${extra}`;
  const CTX = { cls: 'matrix-grid', classTokens: ['matrix-grid'], orientation: 'landscape' };
  const setPara = (t) => `<p><code>${t}</code></p>`;
  const labels = (html) => [...html.matchAll(/matrix-grid-key-label">([^<]*)</g)].map((m) => m[1]);

  const FILLED = cell('cell-filled', 'Senior');
  const OUTLINED = cell('cell-outlined');
  const EMPTY = cell('cell-empty');

  test('names the two keyable shapes with the manifest\'s words', () => {
    const out = buildMatrixGridSection(grid(FILLED + OUTLINED + EMPTY), CTX);
    assert.deepEqual(labels(out.html), ['reachable', 'not applicable']);
  });

  test('[x] is NOT keyed, and the manifest says why', () => {
    // The refusal is the point. A filled cell's trailing text is its label, so
    // a row reading "filled" would repeat on every slide what the cell already
    // says better — and `lint:deck` quotes this reason back to an author.
    const out = buildMatrixGridSection(grid(FILLED + OUTLINED), CTX);
    assert.deepEqual(labels(out.html), ['reachable']);
    const declared = labelSetFor('matrix-grid');
    assert.deepEqual(declared.members.map((m) => m.key), ['[-]', '[ ]']);
    assert.equal(declared.unkeyed[0].key, '[x]');
    assert.match(declared.unkeyed[0].why, /own trailing text IS its label/);
  });

  test('only the shapes actually present get a row', () => {
    assert.deepEqual(labels(buildMatrixGridSection(grid(FILLED + EMPTY), CTX).html),
      ['not applicable']);
  });

  test('a grid of only filled cells gets no key at all', () => {
    const out = buildMatrixGridSection(grid(FILLED), CTX);
    assert.ok(!out.html.includes('matrix-grid-key'),
      'every cell labels itself, so there is nothing for a key to decode');
  });

  test('an author renames a shape, and the other keeps its default', () => {
    const out = buildMatrixGridSection(
      grid(OUTLINED + EMPTY, setPara('[{[-], within reach}]')), CTX);
    assert.deepEqual(labels(out.html), ['within reach', 'not applicable']);
  });

  test('keying [x] binds to nothing and is dropped', () => {
    const out = buildMatrixGridSection(
      grid(FILLED + OUTLINED, setPara('[{[x], filled}]')), CTX);
    assert.deepEqual(labels(out.html), ['reachable']);
  });

  test('the key sits INSIDE the figure, under the grid', () => {
    // Not a sibling: the generic caption lift re-homes the trailing paragraph
    // at the figure's own position, so a key left outside prints BELOW the
    // author's caption and reads as a footnote to the prose.
    const out = buildMatrixGridSection(grid(OUTLINED), CTX);
    assert.match(out.html, /<\/table><ul class="matrix-grid-key"[\s\S]*?<\/ul><\/div>/);
  });

  test('a bracketed list ABOVE the table is read as axes, never as a set', () => {
    // The two constructs are the SAME SHAPE now — both a bracketed list — and
    // only POSITION separates them. This span sits above the table, so it is
    // the axis; the key below still derives its own default.
    const axes = '<p><code>[Wider reach, Deeper cognition]</code></p>';
    const out = buildMatrixGridSection(axes + grid(OUTLINED), CTX);
    assert.match(out.html, /data-col-axis="Wider reach/);
    assert.match(out.html, /data-row-axis="Deeper cognition/);
    assert.deepEqual(labels(out.html), ['reachable']);
  });

  test('an ordinary one-code paragraph survives untouched', () => {
    const out = buildMatrixGridSection(grid(OUTLINED, setPara('Capability · FY26')), CTX);
    assert.match(out.html, /Capability · FY26/);
  });

  test('an authored label lands as text, never as markup', () => {
    const out = buildMatrixGridSection(
      grid(OUTLINED, setPara('[{[-], &lt;img src=x onerror=alert(1)&gt;}]')), CTX);
    assert.ok(!out.html.includes('<img'), 'the label must not become a live element');
    assert.match(out.html, /matrix-grid-key-label">&lt;img/);
  });
});

/**
 * The key and the accessibility tree have to say the SAME words.
 *
 * These fixtures are built with the REAL `cellHtml` emitter rather than a
 * hand-written `<span class="cell …">`, because the bug this block pins lives
 * exactly in the part a hand-written fixture leaves out: the parse-time
 * `.cell-sr-label` span. A synthetic cell with no sr span passes whether or not
 * the sync runs, which is how the divergence survived the first round of tests
 * here (HARD RULE #23 — a proxy that omits the failing element is not a test of
 * it). Issue #2263, criterion 3.
 */
describe('the cell key and the screen-reader label agree', () => {
  const {
    buildMatrixGridSection,
  } = require('../../../lib/components/chart/matrix-grid/matrix-grid.transform');
  const { cellHtml } = require('../../../lib/core/matrix-grid-cells');

  const CTX = { cls: 'matrix-grid', classTokens: ['matrix-grid'], orientation: 'landscape' };
  const td = (shape, label, stateLabel) => `<td>${cellHtml({ shape, label, stateLabel })}</td>`;
  // `extra` — the author's label set — goes BELOW the table now. Position is
  // what tells the lift a span is a KEY rather than an axis.
  const grid = (cells, extra = '') => '<h2>Rubric</h2>'
    + `<table><tbody><tr><td>A</td>${cells}</tr></tbody></table>${extra}`;
  const setPara = (t) => `<p><code>${t}</code></p>`;
  const keyLabels = (h) => [...h.matchAll(/matrix-grid-key-label">([^<]*)</g)].map((m) => m[1]);
  const srLabels = (h) => [...h.matchAll(/cell-sr-label">([^<]*)</g)].map((m) => m[1]);

  const OUTLINED = td('cell-outlined', '', 'reachable');
  const EMPTY = td('cell-empty', '', 'not applicable');
  const FILLED = td('cell-filled', 'Senior', '');

  test('with no override, both surfaces carry the manifest default', () => {
    const out = buildMatrixGridSection(grid(OUTLINED + EMPTY), CTX);
    assert.deepEqual(keyLabels(out.html), ['reachable', 'not applicable']);
    assert.deepEqual(srLabels(out.html), ['reachable', 'not applicable']);
  });

  test('an override reaches the screen reader, not just the visible key', () => {
    // THE REGRESSION ARM. Before the sync, this read
    //   key ['Partially reachable', 'Out of scope']
    //   sr  ['reachable',           'not applicable']
    // — the same cell announced with words the slide does not show.
    const out = buildMatrixGridSection(
      grid(OUTLINED + EMPTY, setPara('[{[-], Partially reachable}, {[ ], Out of scope}]')), CTX);
    assert.deepEqual(keyLabels(out.html), ['Partially reachable', 'Out of scope']);
    assert.deepEqual(srLabels(out.html), ['Partially reachable', 'Out of scope']);
  });

  test('renaming one member leaves the other on its default', () => {
    const out = buildMatrixGridSection(
      grid(OUTLINED + EMPTY, setPara('[{[-], Partially reachable}]')), CTX);
    assert.deepEqual(srLabels(out.html), ['Partially reachable', 'not applicable']);
  });

  test('a filled cell keeps its own trailing text and gains no sr label', () => {
    // `[x]` is `unkeyed`, so nothing may be injected for it — the cell's own
    // text ("Senior") IS its label.
    const out = buildMatrixGridSection(grid(FILLED + OUTLINED), CTX);
    assert.deepEqual(srLabels(out.html), ['reachable']);
    assert.match(out.html, /class="cell cell-filled" data-label="Senior">Senior</);
  });

  test('an override lands as TEXT in the sr label, never as markup', () => {
    const out = buildMatrixGridSection(
      grid(OUTLINED, setPara('[{[-], &lt;img src=x onerror=alert(1)&gt;}]')), CTX);
    assert.ok(!out.html.includes('<img'), 'must not become a live element');
    assert.match(out.html, /cell-sr-label">&lt;img/);
  });

  test('a label carrying a replacement pattern is inserted verbatim', () => {
    // `$&` handed to a STRING replacer expands to the whole match, splicing the
    // surrounding section into the cell; the function replacer inserts it as
    // written. The `&` is then HTML-escaped on the way out, which is why this
    // reads `$&amp;` in the markup and `$&` on the slide — both correct, and
    // asserting the decoded form here would have been asserting the bug's shape.
    const out = buildMatrixGridSection(grid(OUTLINED, setPara('[{[-], cost $& fee}]')), CTX);
    assert.deepEqual(srLabels(out.html), ['cost $&amp; fee']);
    assert.ok(!out.html.includes('<table'.repeat(2)), 'nothing spliced in');
  });
});
