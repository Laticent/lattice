/**
 * Unit: lib/components/chart/state-chart/state-chart.transform.js — kernel for
 * the `state-chart` chart-family member.
 *
 * Section dispatch + chart-frame wrapping live in lib/components/chart/_chart-family/chart-family.js
 * (state-chart is one of CHART_LAYOUTS); this kernel just produces the figure HTML.
 * Tests cover the layers chart-family delegates to:
 *
 *   1. Transition-token lex: parseTransitionToken — `=>N`, `event=>N`,
 *      whitespace variants, `self` keyword, HTML-entity-escaped `&gt;`.
 *   2. State parsing: parseStateLi — label / status / start / end /
 *      unknown-pill fallthrough.
 *   3. Top-level parsing: parseStateChart — flatten transitions, resolve
 *      `self`, implicit start / terminal fallbacks.
 *   4. Lane assignment: assignEdgeLanes — greedy interval-packing.
 *   5. Variant dispatch: pickVariant.
 *   6. SVG emission: buildStateChart — figure structure, edge / arrow /
 *      label counts, data-dir attribution.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  STATE_CHART_VARIANTS,
  STATUS_KEYWORDS,
  parseTransitionToken,
  parseStateLi,
  parseStateChart,
  extractStateList,
  buildStateChart,
  matchEyebrowText,
  STATE_CHART_BROWSER_JS,
  installStateChartLayout,
} = require('../../../lib/components/chart/state-chart/state-chart.transform');

// ── Fixtures ────────────────────────────────────────────────────────────

// Mirrors what markdown-it / lattice-emulator emit for the worked example
// in the manifest. `>` inside inline code is HTML-escaped to `&gt;`.
const OL_WORKED = (
  '<ol>' +
    '<li>Draft <code>start</code>' +
      '<ul>' +
        '<li><code>submit =&gt; 2</code></li>' +
        '<li><code>discard =&gt; 6</code></li>' +
      '</ul>' +
    '</li>' +
    '<li>Submitted <code>on-track</code>' +
      '<ul>' +
        '<li><code>review =&gt; 3</code></li>' +
      '</ul>' +
    '</li>' +
    '<li>In Review' +
      '<ul>' +
        '<li><code>approve =&gt; 4</code></li>' +
        '<li><code>reject =&gt; 1</code></li>' +
        '<li><code>revise =&gt; self</code></li>' +
      '</ul>' +
    '</li>' +
    '<li>Approved <code>done</code>' +
      '<ul>' +
        '<li><code>publish =&gt; 5</code></li>' +
      '</ul>' +
    '</li>' +
    '<li>Published <code>live</code>' +
      '<ul>' +
        '<li><code>archive =&gt; 6</code></li>' +
      '</ul>' +
    '</li>' +
    '<li>Archived <code>end</code></li>' +
  '</ol>'
);

// ── Transition token lex ────────────────────────────────────────────────

describe('parseTransitionToken', () => {
  test('basic: event with target index', () => {
    assert.deepEqual(parseTransitionToken('submit=>2'), { event: 'submit', to: 2 });
  });

  test('whitespace around arrow is insignificant', () => {
    const expected = { event: 'submit', to: 2 };
    assert.deepEqual(parseTransitionToken('submit => 2'), expected);
    assert.deepEqual(parseTransitionToken('submit =>2'), expected);
    assert.deepEqual(parseTransitionToken('submit=> 2'), expected);
    assert.deepEqual(parseTransitionToken('  submit  =>  2  '), expected);
  });

  test('event is optional', () => {
    assert.deepEqual(parseTransitionToken('=>3'), { event: '', to: 3 });
    assert.deepEqual(parseTransitionToken('=> 3'), { event: '', to: 3 });
  });

  test('self keyword resolves the target slot', () => {
    assert.deepEqual(parseTransitionToken('revise => self'), { event: 'revise', to: 'self' });
    assert.deepEqual(parseTransitionToken('=>self'), { event: '', to: 'self' });
  });

  test('multi-word events are allowed', () => {
    assert.deepEqual(parseTransitionToken('auth success => 4'), { event: 'auth success', to: 4 });
  });

  test('HTML-escaped &gt; decodes to => before matching', () => {
    assert.deepEqual(parseTransitionToken('submit =&gt; 2'), { event: 'submit', to: 2 });
    assert.deepEqual(parseTransitionToken('=&gt;self'), { event: '', to: 'self' });
  });

  test('malformed tokens return null', () => {
    assert.equal(parseTransitionToken('submit -> 2'), null);   // ASCII arrow rejected
    assert.equal(parseTransitionToken('submit → 2'), null);    // Unicode arrow rejected
    assert.equal(parseTransitionToken('=> notanumber'), null);
    assert.equal(parseTransitionToken('=>'), null);
    assert.equal(parseTransitionToken('just prose'), null);
  });
});

// ── State li parsing ────────────────────────────────────────────────────

describe('parseStateLi', () => {
  test('plain state has no metadata, no transitions', () => {
    const s = parseStateLi('In Review', 3);
    assert.equal(s.index, 3);
    assert.equal(s.label, 'In Review');
    assert.equal(s.status, null);
    assert.equal(s.isStart, false);
    assert.equal(s.isTerminal, false);
    assert.deepEqual(s.transitions, []);
  });

  test('start keyword routes to isStart, label is stripped', () => {
    const s = parseStateLi('Draft <code>start</code>', 1);
    assert.equal(s.label, 'Draft');
    assert.equal(s.isStart, true);
    assert.equal(s.status, null);
  });

  test('end keyword routes to isTerminal', () => {
    const s = parseStateLi('Archived <code>end</code>', 6);
    assert.equal(s.label, 'Archived');
    assert.equal(s.isTerminal, true);
  });

  test('status keyword routes to status pill', () => {
    const s = parseStateLi('Submitted <code>on-track</code>', 2);
    assert.equal(s.label, 'Submitted');
    assert.equal(s.status, 'on-track');
  });

  test('multiple metadata tokens in any order', () => {
    const a = parseStateLi('Draft <code>start</code> <code>on-track</code>', 1);
    const b = parseStateLi('Draft <code>on-track</code> <code>start</code>', 1);
    assert.equal(a.isStart, true);
    assert.equal(a.status, 'on-track');
    assert.equal(b.isStart, true);
    assert.equal(b.status, 'on-track');
  });

  test('unknown trailing tokens are preserved in the label', () => {
    const s = parseStateLi('Review <code>pending</code>', 3);
    assert.equal(s.status, null);
    assert.match(s.label, /Review/);
    assert.match(s.label, /pending/);
  });

  test('inline code mid-label is preserved as literal label content', () => {
    // `POST /submit handler` with code mid-label, then status pill trailing.
    const s = parseStateLi('<code>POST /submit</code> handler <code>on-track</code>', 2);
    assert.equal(s.status, 'on-track');
    assert.match(s.label, /POST \/submit/);
    assert.match(s.label, /handler/);
  });

  test('transitions parsed from nested ul', () => {
    const s = parseStateLi(
      'Draft<ul><li><code>submit =&gt; 2</code></li><li><code>discard =&gt; 6</code></li></ul>',
      1
    );
    assert.equal(s.transitions.length, 2);
    assert.deepEqual(s.transitions[0], { event: 'submit', to: 2 });
    assert.deepEqual(s.transitions[1], { event: 'discard', to: 6 });
  });

  test('non-transition nested bullets become the state detail (the reveal payload)', () => {
    const s = parseStateLi(
      'Draft<ul><li>just a note about this state</li><li><code>submit =&gt; 2</code></li></ul>',
      1
    );
    assert.equal(s.transitions.length, 1);
    // Prose bullets are no longer dropped — they are captured as per-node detail.
    assert.equal(s.detail.length, 1);
    assert.match(s.detail[0], /just a note/);
  });
});

// ── Top-level parse ─────────────────────────────────────────────────────

describe('parseStateChart', () => {
  test('null for empty list', () => {
    assert.equal(parseStateChart(''), null);
  });

  test('worked example: six states, eight transitions', () => {
    const model = parseStateChart(OL_WORKED.replace(/^<ol>|<\/ol>$/g, ''));
    assert.equal(model.states.length, 6);
    assert.equal(model.transitions.length, 8);

    // State 1: Draft, explicit start, no status
    assert.equal(model.states[0].label, 'Draft');
    assert.equal(model.states[0].isStart, true);

    // State 3 has the self-loop (revise => self resolved to => 3)
    const selfLoops = model.transitions.filter(t => t.isSelf);
    assert.equal(selfLoops.length, 1);
    assert.equal(selfLoops[0].from, 3);
    assert.equal(selfLoops[0].to, 3);
    assert.equal(selfLoops[0].event, 'revise');

    // Back-edges: reject => 1 (from 3 to 1)
    const backEdges = model.transitions.filter(t => t.to < t.from && !t.isSelf);
    assert.equal(backEdges.length, 1);
    assert.equal(backEdges[0].event, 'reject');
  });

  test('self keyword resolves to current state index', () => {
    const ol = '<li>A<ul><li><code>x =&gt; self</code></li></ul></li><li>B</li>';
    const model = parseStateChart(ol);
    assert.equal(model.transitions.length, 1);
    assert.deepEqual(model.transitions[0], { from: 1, to: 1, event: 'x', isSelf: true });
  });

  test('out-of-range targets land in annotations, not transitions', () => {
    const ol = '<li>A<ul><li><code>boom =&gt; 99</code></li></ul></li>';
    const model = parseStateChart(ol);
    assert.equal(model.transitions.length, 0);
    assert.equal(model.states[0].annotations.length, 1);
    assert.match(model.states[0].annotations[0], /unresolved/);
  });

  test('implicit start: state 1 when no explicit start declared', () => {
    const ol = '<li>A</li><li>B</li>';
    const model = parseStateChart(ol);
    assert.equal(model.states[0].isStart, true);
    assert.equal(model.states[1].isStart, false);
  });

  test('implicit terminal: states with no outgoing edges, when no end declared', () => {
    const ol = '<li>A<ul><li><code>=&gt; 2</code></li></ul></li><li>B</li>';
    const model = parseStateChart(ol);
    assert.equal(model.states[0].isTerminal, false);
    assert.equal(model.states[1].isTerminal, true);
  });

  test('explicit end disables implicit-terminal heuristic', () => {
    const ol = '<li>A<ul><li><code>=&gt; 2</code></li></ul></li><li>B <code>end</code></li><li>C</li>';
    const model = parseStateChart(ol);
    assert.equal(model.states[0].isTerminal, false);
    assert.equal(model.states[1].isTerminal, true);
    // C has no outgoing edges but isn't marked terminal because an explicit end exists.
    assert.equal(model.states[2].isTerminal, false);
  });
});

// ── Split-list reassembly (the two-digit-marker indent trap) ──────────────
// A numbered machine authored with ascending markers (1. 2. … 10. 11.) and the
// house 3-space nested-transition indent is SPLIT by markdown-it at item 10:
// `10. ` is one char wider than `1. `, so the 3-space child no longer nests, the
// transition <ul> is ejected, and every later state restarts as its own
// <ol start="N">. extractStateList must reassemble that run into one list so no
// state is lost. Driven through real markdown-it — the actual upstream producer
// of the split — so a markdown-it change that reshapes the split is caught here.
describe('extractStateList — reassembles markdown-it split lists', () => {
  const MarkdownIt = require('markdown-it');
  const md = new MarkdownIt({ html: true });
  const machine = (n, marker) => {
    let src = '';
    for (let i = 1; i <= n; i++) {
      src += `${marker(i)}. State ${i}\n   - \`go => ${i < n ? i + 1 : 1}\`\n`;
    }
    return md.render(src);
  };

  test('14 ascending-numbered states survive the split, edges intact', () => {
    const html = machine(14, (i) => i);
    // Sanity: markdown-it really did split this into multiple <ol> fragments.
    assert.ok((html.match(/<ol/g) || []).length > 1, 'fixture must actually split');

    const ext = extractStateList(html);
    const model = parseStateChart(ext.inner);
    assert.equal(model.states.length, 14, 'every state past 9 is recovered');
    assert.equal(model.transitions.length, 14, 'every transition resolves');
    assert.equal(model.states[13].label, 'State 14');
    // The boundary that used to break (9→10) and the back-edge from the last state.
    assert.equal(model.transitions.find((t) => t.from === 10)?.to, 11);
    assert.equal(model.transitions.find((t) => t.from === 14)?.to, 1);
    assert.equal(model.transitions.filter((t) => t.to < 1 || t.to > 14).length, 0);
  });

  test('the reassembled region spans the whole run (splice replaces all fragments)', () => {
    const html = `<p>lead</p>${machine(12, (i) => i)}<p>tail</p>`;
    const ext = extractStateList(html);
    // start at the first <ol>, end after the LAST leaked fragment — nothing of the
    // machine is left behind in html.slice(ext.end) to leak onto the slide.
    assert.equal(html.slice(0, ext.start).endsWith('<p>lead</p>'), true);
    // Only inter-block whitespace (markdown-it's trailing newline) may remain
    // before the tail — no leaked list fragment.
    assert.equal(html.slice(ext.end).trimStart().startsWith('<p>tail</p>'), true);
  });

  test('the all-`1.` house form (no split) is unchanged', () => {
    const model = parseStateChart(extractStateList(machine(14, () => 1)).inner);
    assert.equal(model.states.length, 14);
    assert.equal(model.transitions.length, 14);
  });

  test('a normal ≤9-state machine is untouched by the extractor', () => {
    const model = parseStateChart(extractStateList(machine(4, (i) => i)).inner);
    assert.equal(model.states.length, 4);
    assert.equal(model.transitions.length, 4);
  });

  test('a genuinely separate trailing <ol> (no start=) is NOT swallowed', () => {
    // Only markdown-it\'s resumed `<ol start="N">` is a split continuation; an
    // unrelated fresh list must stay out of the machine.
    const html = '<ol><li>A<ul><li><code>=&gt; 2</code></li></ul></li><li>B</li></ol>' +
      '<ol><li>unrelated</li></ol>';
    const model = parseStateChart(extractStateList(html).inner);
    assert.equal(model.states.length, 2, 'the second plain <ol> is left alone');
  });
});

// ── Variant axes (direction × presentation) ──────────────────────────────

const MODEL = parseStateChart(OL_WORKED.replace(/^<ol>|<\/ol>$/g, ''));

describe('variant dispatch', () => {
  test('STATE_CHART_VARIANTS lists the modifier classes', () => {
    assert.deepEqual(STATE_CHART_VARIANTS, ['lr', 'inline', 'curved']);
  });

  test('default (no modifier) is the SVG canvas, top-to-bottom', () => {
    const html = buildStateChart(MODEL, ['state-chart']);
    assert.match(html, /data-variant="default"/);
    assert.match(html, /data-sc-dir="tb"/);
    assert.match(html, /class="state-chart-edges"/);
  });

  test('lr sets direction to left-to-right on the SVG canvas', () => {
    const html = buildStateChart(MODEL, ['state-chart', 'lr']);
    assert.match(html, /data-variant="default"/);
    assert.match(html, /data-sc-dir="lr"/);
    assert.match(html, /class="state-chart-edges"/);
  });

  test('portrait forces tb even when lr is requested (a row cannot fit a tall box)', () => {
    // The deck-wide orientation overrides the lr token: CSS reflow AND the
    // browser edge-router both key off data-sc-dir, so the flip must happen here
    // (see state-chart.transform.js §buildStateChart, decision doc §10).
    const html = buildStateChart(MODEL, ['state-chart', 'lr'], 'portrait');
    assert.match(html, /data-sc-dir="tb"/);
    assert.doesNotMatch(html, /data-sc-dir="lr"/);
  });

  test('portrait leaves the default tb untouched; landscape/square keep lr', () => {
    assert.match(buildStateChart(MODEL, ['state-chart'], 'portrait'), /data-sc-dir="tb"/);
    assert.match(buildStateChart(MODEL, ['state-chart', 'lr'], 'landscape'), /data-sc-dir="lr"/);
    // 'square' is a non-portrait orientation (1:1-ish): only 'portrait' flips, so
    // a square lr machine stays lr (and the @container fill doesn't fire either).
    assert.match(buildStateChart(MODEL, ['state-chart', 'lr'], 'square'), /data-sc-dir="lr"/);
    assert.match(buildStateChart(MODEL, ['state-chart', 'lr']), /data-sc-dir="lr"/);
  });

  test('portrait flips the horizontal (lr inline) alias back to a tb inline list', () => {
    const html = buildStateChart(MODEL, ['state-chart', 'horizontal'], 'portrait');
    assert.match(html, /data-variant="inline"/);
    assert.match(html, /data-sc-dir="tb"/);
  });

  test('curved sets the Bézier edge style on the SVG canvas', () => {
    const html = buildStateChart(MODEL, ['state-chart', 'curved']);
    assert.match(html, /data-variant="default"/);
    assert.match(html, /data-sc-style="curved"/);
    // default direction is preserved; curved is orthogonal to lr/tb
    assert.match(html, /data-sc-dir="tb"/);
  });

  test('default (orthogonal) omits the curved style attr', () => {
    const html = buildStateChart(MODEL, ['state-chart']);
    assert.doesNotMatch(html, /data-sc-style/);
  });

  test('lr + curved compose: left-to-right Bézier canvas', () => {
    const html = buildStateChart(MODEL, ['state-chart', 'lr', 'curved']);
    assert.match(html, /data-sc-dir="lr"/);
    assert.match(html, /data-sc-style="curved"/);
  });

  test('inline is the HTML-chip presentation, default tb direction', () => {
    const html = buildStateChart(MODEL, ['state-chart', 'inline']);
    assert.match(html, /data-variant="inline"/);
    assert.match(html, /data-sc-dir="tb"/);
    assert.match(html, /class="state-chip"/);
    assert.doesNotMatch(html, /state-chart-edges/);
  });

  test('lr + inline compose: horizontal chips', () => {
    const html = buildStateChart(MODEL, ['state-chart', 'lr', 'inline']);
    assert.match(html, /data-variant="inline"/);
    assert.match(html, /data-sc-dir="lr"/);
    assert.match(html, /class="state-chip"/);
  });

  test('horizontal is a backwards-compatible alias for lr inline', () => {
    const html = buildStateChart(MODEL, ['state-chart', 'horizontal']);
    assert.match(html, /data-variant="inline"/);
    assert.match(html, /data-sc-dir="lr"/);
    assert.match(html, /class="state-chip"/);
  });
});

// ── Build-time HTML emission ──────────────────────────────────────────────
// Geometry now runs in the browser (installStateChartLayout). The build
// step emits HTML nodes the browser sizes + a transitions JSON attr + an
// empty SVG overlay. These tests pin that contract.

describe('buildStateChart (default)', () => {
  const html = buildStateChart(MODEL, ['state-chart']);

  test('emits state-chart-figure with state/transition counts', () => {
    assert.match(html, /class="state-chart-figure"/);
    assert.match(html, /data-variant="default"/);
    assert.match(html, /data-states="6"/);
    assert.match(html, /data-transitions="8"/);
  });

  test('emits one HTML li.state-node per state with data-kind', () => {
    const nodeCount = (html.match(/class="state-node"/g) || []).length;
    assert.equal(nodeCount, 6);
    assert.match(html, /data-kind="start"/);
    assert.match(html, /data-kind="terminal"/);
  });

  test('emits a geometry-free SVG overlay for the browser pass to fill', () => {
    // The overlay carries only its accessible content at build time — a title
    // and an enumerated <desc>. It is NOT empty any more: once the layout pass
    // paints the states into it and hides the measuring column, this <desc> is
    // the only place a screen reader can meet the machine (visibility:hidden
    // removes the <ol> from the accessibility tree).
    assert.match(html, /<svg class="state-chart-edges"[^>]*>/);
    assert.match(html, /<title>State chart<\/title>/);
    assert.match(html, /<desc>States — 1\. Draft \(start\)/);
    assert.match(html, /Transitions — on submit, Draft to Submitted/);
    // Still no build-time GEOMETRY — the kernel must not bake paths/arrows.
    assert.doesNotMatch(html, /class="state-edge"/);
    assert.doesNotMatch(html, /class="state-edge-arrow"/);
    assert.doesNotMatch(html, /class="state-node-shape"/);
  });

  test('status folds into the top-right index badge (no pill, no inline dot)', () => {
    assert.match(html, /class="state-index" data-s="on-track" aria-label="on-track">\d+</);
    assert.match(html, /class="state-index" data-s="done"/);
    assert.match(html, /class="state-index" data-s="live"/);
    assert.doesNotMatch(html, /class="chart-status"/);
    // The only .state-dot occurrences are the legend swatches (one per legend item).
    const dots = (html.match(/class="state-dot"/g) || []).length;
    const legendItems = (html.match(/class="state-legend-item"/g) || []).length;
    assert.equal(dots, legendItems, 'no inline node dot — dots live only in the legend');
  });

  test('distinct statuses are decoded by a legend band below the chart', () => {
    assert.match(html, /<ol class="state-legend">/);
    assert.match(html, /class="state-legend-item" data-s="on-track"><span class="state-dot" data-s="on-track"[^>]*><\/span><span class="state-legend-label">on-track<\/span>/);
    // One legend entry per DISTINCT status (no duplicates).
    const seen = [...html.matchAll(/class="state-legend-item" data-s="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(seen, [...new Set(seen)], 'legend lists each status once');
  });

  test('serialises the resolved transition list into data-sc-transitions', () => {
    const m = html.match(/data-sc-transitions="([^"]*)"/);
    assert.ok(m, 'data-sc-transitions present');
    // Attribute is HTML-escaped; decode the entities the kernel emits.
    const json = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    const transitions = JSON.parse(json);
    assert.equal(transitions.length, 8);
    // self resolved to its own index, flagged isSelf
    const selfLoops = transitions.filter(t => t.isSelf);
    assert.equal(selfLoops.length, 1);
    assert.deepEqual(selfLoops[0], { from: 3, to: 3, event: 'revise', isSelf: true });
    // a back-edge survives
    assert.ok(transitions.some(t => t.from === 3 && t.to === 1 && t.event === 'reject'));
  });
});

describe('buildStateChart (inline / horizontal fallback)', () => {
  test('inline variant emits HTML chips, no SVG overlay', () => {
    const html = buildStateChart(parseStateChart(OL_WORKED.replace(/^<ol>|<\/ol>$/g, '')), 'inline');
    assert.match(html, /data-variant="inline"/);
    assert.doesNotMatch(html, /state-chart-edges/);
    assert.match(html, /class="state-chip"/);
  });

  test('horizontal variant uses the same HTML fallback', () => {
    const html = buildStateChart(parseStateChart(OL_WORKED.replace(/^<ol>|<\/ol>$/g, '')), 'horizontal');
    assert.match(html, /class="state-chip"/);
    assert.doesNotMatch(html, /state-chart-edges/);
  });
});

// ── Browser layout module ─────────────────────────────────────────────────

describe('STATE_CHART_BROWSER_JS', () => {
  test('is a self-invoking string carrying the layout function', () => {
    assert.equal(typeof STATE_CHART_BROWSER_JS, 'string');
    assert.match(STATE_CHART_BROWSER_JS, /getBoundingClientRect/);
    assert.match(STATE_CHART_BROWSER_JS, /data-sc-transitions/);
    // self-invoked against document
    assert.match(STATE_CHART_BROWSER_JS, /\)\(document\);\s*$/);
  });

  test('installStateChartLayout no-ops without a document (Node safety)', () => {
    // Passing a null doc must not throw — it's required at build time in Node.
    assert.doesNotThrow(() => installStateChartLayout(null));
  });
});

// ── Eyebrow helper ──────────────────────────────────────────────────────

describe('matchEyebrowText', () => {
  test('lifts <p><code>…</code></p> ahead of the body', () => {
    const html = '<p><code>Submission lifecycle</code></p><h2>Title</h2>';
    assert.equal(matchEyebrowText(html), 'Submission lifecycle');
  });

  test('returns empty string when absent', () => {
    assert.equal(matchEyebrowText('<h2>Title</h2><ol><li>A</li></ol>'), '');
  });
});

// ── Status vocabulary ───────────────────────────────────────────────────

describe('STATUS_KEYWORDS', () => {
  test('matches the .chart-status[data-s=…] vocabulary in chart-family.css', () => {
    // Same set as lib/components/chart/_chart-family/chart-family.css. Drift here is a
    // canary that the kernel and the CSS have diverged.
    const expected = ['on-track', 'done', 'live', 'at-risk', 'warn', 'pilot', 'blocked', 'fail', 'decision', 'deferred'];
    for (const k of expected) assert.ok(STATUS_KEYWORDS.has(k), `missing: ${k}`);
    assert.equal(STATUS_KEYWORDS.size, expected.length);
  });
});

// ── Browser layout (behavioural, via a fake DOM) ──────────────────────────
// installStateChartLayout is a self-contained closure (it serialises to a
// string for the emulator bootstrap), so its inner helpers — gutter routing,
// the 5-slot port picker, crossing minimisation, single-exit convergence —
// can't be imported piecewise. We instead drive the REAL closure against a
// minimal synchronous DOM and inspect the SVG it actually emits.
//
// The only node property the routing logic depends on is index-ordered,
// monotonic node centres in a centred column (TB) / row (LR); we simulate
// exactly that. Then we flatten the emitted <path> geometry to polylines and
// count true segment crossings. These are the tests that would have caught
// the slot-ordering regression that shipped (a crossing the parser-level
// tests are blind to) — they assert the drawn picture, not the model.

describe('browser layout (fake DOM)', () => {
  const NODE_H = 40;
  const ROW_GAP = 48;
  const COL_CX = 400;   // TB column centre x
  const ROW_CY = 380;   // LR row centre y
  const GAP = 5;        // mirrors G.gap (arrow-tip → node boundary)

  const nodeWidth = (label) => 70 + String(label).length * 7;

  function layoutRects(spec) {
    const rects = {};
    if (spec.dir === 'lr') {
      let x = 90;
      for (const nd of spec.nodes) {
        const w = nodeWidth(nd.label);
        rects[nd.index] = { x, y: ROW_CY - NODE_H / 2, w, h: NODE_H };
        x += w + ROW_GAP + 70; // wider row stride so LR gutters don't collide
      }
    } else {
      spec.nodes.forEach((nd, k) => {
        const w = nodeWidth(nd.label);
        rects[nd.index] = { x: COL_CX - w / 2, y: 70 + k * (NODE_H + ROW_GAP), w, h: NODE_H };
      });
    }
    return rects;
  }

  function fakeNodeEl(nd, rect) {
    return {
      getAttribute(name) {
        if (name === 'data-index') return String(nd.index);
        if (name === 'data-kind') return nd.kind || null;
        return null;
      },
      getBoundingClientRect() {
        return { left: rect.x, top: rect.y, width: rect.w, height: rect.h };
      },
    };
  }

  function fakeFigure(spec) {
    const rects = layoutRects(spec);
    const nodeEls = spec.nodes.map((nd) => fakeNodeEl(nd, rects[nd.index]));
    const svg = {
      _attrs: {},
      innerHTML: '',
      setAttribute(k, v) { this._attrs[k] = v; },
    };
    const ol = { style: {} };
    const attrs = {
      'data-sc-transitions': JSON.stringify(spec.transitions),
      'data-sc-dir': spec.dir === 'lr' ? 'lr' : 'tb',
      'data-sc-style': spec.style === 'curved' ? 'curved' : null,
    };
    const fig = {
      getAttribute(k) { return Object.hasOwn(attrs, k) ? attrs[k] : null; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 2400, height: 1200 }; },
      // The layout reads the enclosing section's width to scale its px geometry
      // by the live cqi factor (S). 1280 = HD ⇒ S=1, so the geometry assertions
      // below exercise the original baseline constants. (Scaling at 4K is
      // covered by the rendered HD/4K gallery spot-checks.)
      closest(sel) { return sel === 'section' ? { getBoundingClientRect() { return { width: 1280 }; } } : null; },
      querySelector(sel) {
        if (sel === '.state-chart-edges') return svg;
        if (sel === '.state-nodes') return ol;
        return null;
      },
      querySelectorAll(sel) { return sel === '.state-node' ? nodeEls : []; },
    };
    return { fig, svg, rects };
  }

  function runLayout(spec) {
    const f = fakeFigure(spec);
    const doc = {
      readyState: 'complete',
      querySelectorAll(sel) {
        if (sel === '.state-chart-figure[data-sc-transitions]') return [f.fig];
        if (sel === '.state-chart-figure') return [f.fig];
        return [];
      },
      addEventListener() {},
    };
    // No getComputedStyle / ResizeObserver / doc.fonts in Node: makeLabelW's
    // try/catch falls back to a char-width estimate, and the resize/font
    // re-draw hooks are skipped — exactly the one-shot pass we want to inspect.
    installStateChartLayout(doc);
    return { svg: f.svg.innerHTML, rects: f.rects };
  }

  // ── Path extraction + geometry ──
  function extractPaths(svg) {
    const out = [];
    const re = /<path class="state-edge"([^>]*?)d="([^"]+)"/g;
    let m;
    while ((m = re.exec(svg)) !== null) {
      out.push({ d: m[2], isSelf: /data-self="true"/.test(m[1]) });
    }
    return out;
  }

  function flatten(d) {
    const toks = d.match(/[MLC]|-?\d+(?:\.\d+)?/g) || [];
    const pts = [];
    let i = 0, cx = 0, cy = 0;
    while (i < toks.length) {
      const c = toks[i++];
      if (c === 'M' || c === 'L') {
        cx = +toks[i++]; cy = +toks[i++]; pts.push([cx, cy]);
      } else if (c === 'C') {
        const x1 = +toks[i++], y1 = +toks[i++], x2 = +toks[i++], y2 = +toks[i++], x = +toks[i++], y = +toks[i++];
        const steps = 18;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps, mt = 1 - t;
          const bx = mt * mt * mt * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x;
          const by = mt * mt * mt * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y;
          pts.push([bx, by]);
        }
        cx = x; cy = y;
      }
    }
    return pts;
  }

  const ccw = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const near = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;

  // Proper (interior) crossing only — segments that merely share an endpoint
  // (edges meeting at a node face) or just touch at a vertex don't count.
  function properCross(p1, p2, p3, p4) {
    if (near(p1, p3) || near(p1, p4) || near(p2, p3) || near(p2, p4)) return false;
    const d1 = ccw(p3, p4, p1), d2 = ccw(p3, p4, p2), d3 = ccw(p1, p2, p3), d4 = ccw(p1, p2, p4);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }

  function polysCross(A, B) {
    for (let i = 0; i + 1 < A.length; i++) {
      for (let j = 0; j + 1 < B.length; j++) {
        if (properCross(A[i], A[i + 1], B[j], B[j + 1])) return true;
      }
    }
    return false;
  }

  // Count pairs of (non-self) edges whose drawn paths cross.
  function crossingPairs(svg) {
    const polys = extractPaths(svg).filter((p) => !p.isSelf).map((p) => flatten(p.d));
    let n = 0;
    const offenders = [];
    for (let a = 0; a < polys.length; a++) {
      for (let b = a + 1; b < polys.length; b++) {
        if (polysCross(polys[a], polys[b])) { n++; offenders.push([a, b]); }
      }
    }
    return { n, offenders };
  }

  // ── Fixtures: the charts we fought to make crossing-free (stress slides) ──
  const node = (index, label, kind) => ({ index, label, kind });
  const tr = (from, to, event) => ({ from, to, event: event || '', isSelf: from === to });

  // Slide 5 — router with many exits + self-loop. All branches sink → single
  // exit convergence. The fan-out and the convergence join must not cross.
  const ROUTER = {
    dir: 'tb',
    nodes: [
      node(1, 'Dispatch', 'start'), node(2, 'Handler A'), node(3, 'Handler B'),
      node(4, 'Handler C'), node(5, 'Dead Letter'),
    ],
    transitions: [
      tr(1, 2, 'a'), tr(1, 3, 'b'), tr(1, 4, 'c'), tr(1, 5, 'd'), tr(1, 1, 'retry'),
    ],
  };

  // Slide 11 — incident response: forward skips, three back-edges, a self
  // loop. The regression/need-more-info back-edges once crossed; must not.
  const INCIDENT = {
    dir: 'tb',
    nodes: [
      node(1, 'Detected', 'start'), node(2, 'Triaged'), node(3, 'Investigating'),
      node(4, 'Mitigated'), node(5, 'Escalated'), node(6, 'Monitoring'),
      node(7, 'Resolved'), node(8, 'Closed', 'terminal'),
    ],
    transitions: [
      tr(1, 2, 'triage'), tr(2, 3, 'assign'), tr(2, 7, 'false alarm'),
      tr(3, 4, 'mitigate'), tr(3, 5, 'escalate'), tr(3, 2, 'need more info'),
      tr(4, 6, 'verify'), tr(5, 4, 'hand off'), tr(5, 5, 're-page'),
      tr(6, 7, 'resolve'), tr(6, 3, 'regression'), tr(7, 8, 'postmortem'),
    ],
  };

  // Slide 6 — wizard: four back-edges all returning to state 1. They share
  // state 1's back face; the slot picker must fan them without crossing.
  const WIZARD = {
    dir: 'tb',
    nodes: [
      node(1, 'Welcome', 'start'), node(2, 'Account'), node(3, 'Profile'),
      node(4, 'Payment'), node(5, 'Confirm'),
    ],
    transitions: [
      tr(1, 2, 'next'), tr(2, 3, 'next'), tr(2, 1, 'cancel'),
      tr(3, 4, 'next'), tr(3, 1, 'cancel'), tr(4, 5, 'next'),
      tr(4, 1, 'cancel'), tr(5, 1, 'restart'),
    ],
  };

  describe('crossing minimisation', () => {
    test('router (fan-out + single-exit convergence) draws zero crossings', () => {
      const { svg } = runLayout(ROUTER);
      const { n, offenders } = crossingPairs(svg);
      assert.equal(n, 0, `router crossings: ${JSON.stringify(offenders)}`);
    });

    test('incident response (skips + back-edges + self-loop) draws zero crossings', () => {
      const { svg } = runLayout(INCIDENT);
      const { n, offenders } = crossingPairs(svg);
      assert.equal(n, 0, `incident crossings: ${JSON.stringify(offenders)}`);
    });

    test('wizard (four back-edges sharing one face) draws zero crossings', () => {
      const { svg } = runLayout(WIZARD);
      const { n, offenders } = crossingPairs(svg);
      assert.equal(n, 0, `wizard crossings: ${JSON.stringify(offenders)}`);
    });
  });

  describe('single-exit convergence', () => {
    test('exactly one terminal ring regardless of sink count', () => {
      const { svg } = runLayout(ROUTER);
      const rings = (svg.match(/data-kind="terminal"/g) || []).length;
      assert.equal(rings, 1);
    });

    test('every sink gains a converging edge into the single exit', () => {
      // Router has 4 sinks (handlers A–C + dead letter) + 5 authored
      // transitions (incl. self). Convergence adds one edge per sink.
      const { svg } = runLayout(ROUTER);
      const paths = extractPaths(svg);
      assert.equal(paths.length, ROUTER.transitions.length + 4);
    });

    test('a machine with no sinks (every state has an exit) draws no ring', () => {
      // Wizard: state 5 loops back to 1, so no state is a sink → no exit ring.
      const { svg } = runLayout(WIZARD);
      assert.equal((svg.match(/data-kind="terminal"/g) || []).length, 0);
      assert.equal(extractPaths(svg).length, WIZARD.transitions.length);
    });
  });

  describe('port assignment (5-slot picker)', () => {
    // A→B→C with a lone A→C skip: the skip is the only edge on each node's
    // gutter face, so it must attach at the node CENTRE (middle slot).
    const LONE = {
      dir: 'tb',
      nodes: [node(1, 'A', 'start'), node(2, 'B'), node(3, 'C')],
      transitions: [tr(1, 2, 'go'), tr(1, 3, 'skip'), tr(2, 3, 'go')],
    };

    test('a lone skip attaches at the node centre line', () => {
      const { svg, rects } = runLayout(LONE);
      const skips = extractPaths(svg).filter((p) => !p.isSelf && /C/.test(p.d));
      assert.equal(skips.length, 1, 'exactly one skip edge (1→3)');
      const pts = flatten(skips[0].d);
      const start = pts[0], end = pts[pts.length - 1];
      const cy1 = rects[1].y + rects[1].h / 2;
      const cy3 = rects[3].y + rects[3].h / 2;
      assert.ok(Math.abs(start[1] - cy1) < 0.6, `skip starts at state1 centre (${start[1]} vs ${cy1})`);
      assert.ok(Math.abs(end[1] - cy3) < 0.6, `skip ends at state3 centre (${end[1]} vs ${cy3})`);
    });

    test('multiple edges sharing a face take distinct slots', () => {
      // Router: 1→3, 1→4, 1→5 all leave state 1's right face (1→2 is the
      // adjacent spine). Their attachment y-coords must be distinct.
      const { svg, rects } = runLayout(ROUTER);
      const rightX = rects[1].x + rects[1].w + GAP;
      const starts = extractPaths(svg)
        .filter((p) => !p.isSelf)
        .map((p) => flatten(p.d)[0])
        .filter((s) => Math.abs(s[0] - rightX) < 0.6)
        .map((s) => +s[1].toFixed(1));
      assert.ok(starts.length >= 3, `at least the 3 skips leave state1 right face (got ${starts.length})`);
      assert.equal(new Set(starts).size, starts.length, `distinct slot y-coords: ${starts}`);
    });
  });

  describe('edge style: orthogonal vs curved', () => {
    const SKIP = {
      dir: 'tb',
      nodes: [node(1, 'A', 'start'), node(2, 'B'), node(3, 'C')],
      transitions: [tr(1, 2, 'go'), tr(1, 3, 'skip'), tr(2, 3, 'go')],
    };

    test('default style routes skips as racetracks (a straight L run)', () => {
      const { svg } = runLayout({ ...SKIP, style: 'orthogonal' });
      // Skip/back edges are the curved (`C`) paths; adjacent spines are M/L
      // only. A racetrack skip carries BOTH rounded corners (C) and a straight
      // run (L).
      const skips = extractPaths(svg).filter((p) => !p.isSelf && /C/.test(p.d));
      assert.ok(skips.length > 0, 'has a skip edge');
      assert.ok(skips.every((p) => /L/.test(p.d)), 'racetrack skips contain a straight L run');
    });

    test('curved style routes skips as a single Bézier (no L run)', () => {
      const { svg } = runLayout({ ...SKIP, style: 'curved' });
      const skips = extractPaths(svg).filter((p) => !p.isSelf && /C/.test(p.d));
      assert.ok(skips.length > 0, 'has a skip edge');
      assert.ok(skips.every((p) => !/L/.test(p.d)), 'curved skips are pure cubics, no L run');
    });
  });
});

// ── Tier-2 per-node detail reveal (chart-detail substrate) ───────────────
// A non-transition (prose) bullet under a state becomes that state's reveal
// detail: the node is tagged data-mark + data-label, the detail rides an inert
// <template class="chart-detail"> payload (a sibling of the figure so it isn't
// miscounted as a mark) and folds into a speaker-note comment. A deck that
// authors no prose bullet is unaffected (no payload, no note).
// See engineering/decisions/2026-06-20-chart-detail-reveal-family.md.
describe('Tier-2 per-node detail reveal', () => {
  const MODEL_DETAIL = parseStateChart(
    '<li>Draft <code>start</code><ul><li><code>submit =&gt; 2</code></li></ul></li>' +
    '<li>Review <code>at-risk</code><ul><li><code>approve =&gt; 3</code></li><li>Needs two approvers before sign-off.</li></ul></li>' +
    '<li>Done <code>end</code></li>'
  );
  const MODEL_PLAIN = parseStateChart(
    '<li>A <code>start</code><ul><li><code>go =&gt; 2</code></li></ul></li><li>B <code>end</code></li>'
  );

  test('nodes are index-tagged (data-mark 0-based + data-label) for the reveal layer', () => {
    const html = buildStateChart(MODEL_DETAIL, ['state-chart']);
    assert.match(html, /class="state-node" data-index="1" data-mark="0" data-label="Draft"/);
    assert.match(html, /data-mark="1" data-label="Review" data-value="[^"]*"/);
  });

  test('a prose bullet becomes an inert detail template keyed to the state mark index', () => {
    const html = buildStateChart(MODEL_DETAIL, ['state-chart']);
    assert.match(html, /<template class="chart-detail" data-mark="1">[\s\S]*Needs two approvers[\s\S]*<\/template>/);
    // …and folds into a Marp-faithful speaker-note comment (static-PDF fallback)
    assert.match(html, /<!--[\s\S]*Needs two approvers[\s\S]*-->/);
  });

  test('the detail payload is a sibling AFTER the figure, not a descendant of it', () => {
    const html = buildStateChart(MODEL_DETAIL, ['state-chart']);
    // The figure's last child is the edge <svg>; the payload must come after it
    // (so chartEl=figure.querySelectorAll([data-mark]) never matches a template).
    assert.ok(html.indexOf('chart-details') > html.indexOf('state-chart-edges'),
      'chart-details follows the figure');
  });

  test('inline variant also tags rows and emits the detail', () => {
    const html = buildStateChart(MODEL_DETAIL, ['state-chart', 'inline']);
    assert.match(html, /class="state-node-row" data-index="2" data-mark="1" data-label="Review"/);
    assert.match(html, /<template class="chart-detail" data-mark="1">/);
  });

  test('no prose bullet → no payload, no note (nodes still tagged)', () => {
    const html = buildStateChart(MODEL_PLAIN, ['state-chart']);
    assert.ok(!/chart-details/.test(html), 'no detail wrapper emitted');
    assert.ok(!/<!--/.test(html), 'no speaker-note comment emitted');
    assert.match(html, /data-mark="0"/, 'nodes are still index-tagged');
  });
});
