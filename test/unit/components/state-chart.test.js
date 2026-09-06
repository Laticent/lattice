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
    assert.match(html, /class="state-index" data-s="on-track" role="img" aria-label="State \d+, on-track">\d+</);
    assert.match(html, /class="state-index" data-s="done"/);
    assert.match(html, /class="state-index" data-s="live"/);
    assert.doesNotMatch(html, /class="chart-status"/);
    // The only .state-dot occurrences are the legend swatches (one per legend item).
    const dots = (html.match(/class="state-dot"/g) || []).length;
    const legendItems = (html.match(/class="state-legend-item"/g) || []).length;
    assert.equal(dots, legendItems, 'no inline node dot — dots live only in the legend');
  });

  test('the index badge is announceable, and carries BOTH the id and the status', () => {
    // Two ARIA defects this locks the fix for (both silent, both caught by an
    // aria-rules audit rather than by any test):
    //   · the label used to sit on a BARE <span>, whose implicit role is `generic` —
    //     and ARIA says a label on a generic role is IGNORED. The status reached no
    //     assistive technology at all, while sighted users got it from hue alone
    //     (WCAG 1.4.1). `role="img"` is what makes the label apply.
    //   · a status-LESS badge was `aria-hidden="true"`, hiding the state's IDENTIFIER
    //     — the number every transition routes by (`byFrom.get(s.index)`), not decoration.
    assert.doesNotMatch(html, /class="state-index"[^>]*aria-hidden/, 'a state id is never hidden');
    // Both facts in one name: a bare aria-label="on-track" would REPLACE the visible
    // numeral rather than add to it, trading the id away for the status.
    assert.match(html, /class="state-index"[^>]*role="img"[^>]*aria-label="State 1"/, 'status-less badge still names its id');
    for (const [n, st] of [[2, 'on-track'], [4, 'done'], [5, 'live']]) {
      assert.match(html, new RegExp(`aria-label="State ${n}, ${st}"`), `state ${n} names id + status`);
    }
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

// ── Browser layout (behavioral, via a fake DOM) ──────────────────────────
// installStateChartLayout is a self-contained closure (it serialises to a
// string for the emulator bootstrap), so its inner helpers — gutter routing,
// the 5-slot port picker, crossing minimization, single-exit convergence —
// can't be imported piecewise. We instead drive the REAL closure against a
// minimal synchronous DOM and inspect the SVG it actually emits.
//
// The only node property the routing logic depends on is index-ordered,
// monotonic node centers in a centered column (TB) / row (LR); we simulate
// exactly that. Then we flatten the emitted <path> geometry to polylines and
// count true segment crossings. These are the tests that would have caught
// the slot-ordering regression that shipped (a crossing the parser-level
// tests are blind to) — they assert the drawn picture, not the model.

describe('browser layout (fake DOM)', () => {
  const NODE_H = 40;
  const ROW_GAP = 48;
  const COL_CX = 400;   // TB column center x
  const ROW_CY = 380;   // LR row center y
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
      // The REAL <svg> is not empty when the layout pass runs — the build step
      // emits <title> and <desc> into it, and the pass replaces innerHTML. A
      // stub that starts empty cannot model children being destroyed, which is
      // exactly how a wiped accessible name shipped with all 68 tests green.
      innerHTML: '<title>State chart</title><desc>States — 1. Draft (start).</desc>',
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

  describe('crossing minimization', () => {
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
    // gutter face, so it must attach at the node CENTER (middle slot).
    const LONE = {
      dir: 'tb',
      nodes: [node(1, 'A', 'start'), node(2, 'B'), node(3, 'C')],
      transitions: [tr(1, 2, 'go'), tr(1, 3, 'skip'), tr(2, 3, 'go')],
    };

    test('a lone skip attaches at the node center line', () => {
      const { svg, rects } = runLayout(LONE);
      const skips = extractPaths(svg).filter((p) => !p.isSelf && /C/.test(p.d));
      assert.equal(skips.length, 1, 'exactly one skip edge (1→3)');
      const pts = flatten(skips[0].d);
      const start = pts[0], end = pts[pts.length - 1];
      const cy1 = rects[1].y + rects[1].h / 2;
      const cy3 = rects[3].y + rects[3].h / 2;
      assert.ok(Math.abs(start[1] - cy1) < 0.6, `skip starts at state1 center (${start[1]} vs ${cy1})`);
      assert.ok(Math.abs(end[1] - cy3) < 0.6, `skip ends at state3 center (${end[1]} vs ${cy3})`);
    });

    test('multiple edges sharing a face take distinct slots', () => {
      // A CHAIN WITH SKIPS, deliberately not ROUTER's four-way fan-out: ROUTER
      // puts four nodes in one rank, so it is now re-ranked by dagre and routed
      // by dagre's polylines — the 5-slot picker is never reached on it, and
      // asserting the picker's output there would test nothing. A chain ranks
      // linearly and keeps the column, and its three skips still stack on state
      // 1's right face, which is the case this picker exists for.
      const SKIPS = {
        dir: 'tb',
        nodes: [
          node(1, 'Dispatch', 'start'), node(2, 'Handler A'), node(3, 'Handler B'),
          node(4, 'Handler C'), node(5, 'Dead Letter', 'terminal'),
        ],
        transitions: [
          tr(1, 2, 'a'), tr(2, 3, 'b'), tr(3, 4, 'c'), tr(4, 5, 'd'),
          tr(1, 3, 'skip3'), tr(1, 4, 'skip4'), tr(1, 5, 'skip5'),
        ],
      };
      const { svg, rects } = runLayout(SKIPS);
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

  // The pass that paints the states also HIDES the <ol> they used to be readable
  // from, so the <svg role="img">'s own <title>/<desc> is the whole of the
  // accessible content from that moment on. A bare `innerHTML =` destroyed both,
  // and the build-time test asserting they exist in the emitted STRING passed
  // anyway — the string is not what the reader gets.
  describe('accessible name + description survive the paint', () => {
    const SPEC = {
      dir: 'tb',
      nodes: [node(1, 'A', 'start'), node(2, 'B'), node(3, 'C')],
      transitions: [tr(1, 2, 'go'), tr(2, 3, 'go')],
    };

    // `runLayout` hands back the svg's innerHTML AFTER the pass — the string a
    // reader's AT would walk.
    test('<title> and <desc> are still there after draw()', () => {
      const { svg } = runLayout(SPEC);
      assert.match(svg, /<title>State chart<\/title>/,
        'the accessible NAME was wiped by the paint');
      assert.match(svg, /<desc>[\s\S]*Draft[\s\S]*<\/desc>/,
        'the accessible DESCRIPTION was wiped by the paint');
    });

    test('they come FIRST, and the geometry still painted', () => {
      const { svg } = runLayout(SPEC);
      assert.ok(svg.indexOf('<title>') < svg.indexOf('<path'),
        'title/desc must precede the geometry, as they do at build time');
      assert.ok(/state-node-shape/.test(svg), 'the states are painted');
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

/**
 * `:::token` — the author-facing tint channel.
 *
 * An author names a THEME TOKEN, never a color, so a tinted deck still
 * re-themes with the palette (HARD RULE #3). The grammar is the security
 * boundary as much as the ergonomics: the value is interpolated into a
 * `var(--…)` reference inside markup the browser pass assigns through
 * `svg.innerHTML` — the sink HARD RULE #22 polices — so a name able to carry a
 * quote, a paren or a `)` could close the function and inject.
 *
 * Three properties are pinned here, and the third is the one most likely to rot:
 * the channel must be PURELY ADDITIVE, so a deck that authors no `:::` produces
 * a byte-identical model. That is what keeps the six shipped galleries and their
 * committed PDFs from churning.
 */
describe('state-chart `:::token` tint channel', () => {
  const li = (spec = '', tspec = '') =>
    `<li>Draft <code>start</code>${spec}\n<ul><li><code>go =&gt; 2</code>${tspec}</li></ul></li>` +
    `<li>Next <code>end</code></li>`;

  test('a well-formed token reaches both the state and the transition', () => {
    const m = parseStateChart(li(':::state-info-hue', ':::state-pass-hue'));
    assert.equal(m.states[0].tint, 'state-info-hue');
    assert.equal(m.transitions[0].tint, 'state-pass-hue');
  });

  test('the second slot is the edge-label background', () => {
    const m = parseStateChart(li('', ':::state-fail-hue/surface-raised'));
    assert.equal(m.transitions[0].tint, 'state-fail-hue');
    assert.equal(m.transitions[0].labelBg, 'surface-raised');
  });

  test('a tint does not eat the status pill or the start/end keywords', () => {
    const m = parseStateChart(
      `<li>Draft <code>start</code> <code>at-risk</code>:::state-warn-hue</li><li>B <code>end</code></li>`
    );
    assert.equal(m.states[0].label, 'Draft', 'label keeps its text');
    assert.equal(m.states[0].status, 'at-risk', 'status pill still parses');
    assert.equal(m.states[0].isStart, true, 'start keyword still parses');
    assert.equal(m.states[0].tint, 'state-warn-hue');
  });

  test('a prose bullet is still detail, not a transition, when a tint is present', () => {
    const m = parseStateChart(
      `<li>Draft <code>start</code>:::state-info-hue\n<ul><li>Entry action runs here.</li></ul></li>` +
      `<li>B <code>end</code></li>`
    );
    assert.deepEqual(m.states[0].detail, ['Entry action runs here.']);
    assert.equal(m.transitions.length, 0);
  });

  // The security arm. Each of these can close a `var(--x` or break an attribute
  // if the grammar ever loosens to something like /:::(\S+)/.
  for (const bad of [
    'red); fill:url(#evil',            // close the var() and inject a paint
    'a" onload="alert(1)',             // break out of the style attribute
    'a);}</style><script>x</script>',  // RAWTEXT escape (HARD RULE #22)
    '--state-edge',                    // author-supplied `--`; the engine adds it
    'UPPER', '1abc', 'a b', '../../etc', 'a/b/c', '',
  ]) {
    test(`rejects \`:::${bad}\``, () => {
      const m = parseStateChart(li(':::' + bad, ':::' + bad));
      assert.equal(m.states[0].tint, undefined, 'state tint refused');
      // A malformed spec is refused one of two equally correct ways: the tint is
      // dropped and the transition survives, or the bullet no longer matches the
      // transition shape at all and falls through to detail prose. Both leave
      // NO tint anywhere, which is the property under test — asserting the
      // transition still exists would pin the accident rather than the rule.
      for (const t of m.transitions) {
        assert.equal(t.tint, undefined, 'transition tint refused');
        assert.equal(t.labelBg, undefined, 'label-bg refused');
      }
    });
  }

  // THE GRAMMAR IS NOT THE ONLY WAY IN, and the arm above cannot see the other
  // one. Every test up there drives `parseStateChart` — the BUILD-time path,
  // where `stripTint` has already refused anything but a bare token. The browser
  // pass reads its tints back OUT of the DOM (`data-tint` on the measured node,
  // and `tint`/`labelBg` from the `data-sc-transitions` JSON), and the DOM is not
  // the parser: a deck author's raw inline HTML lands in the same document, and
  // `fig.querySelectorAll('.state-node')` is a descendant search, so the pass can
  // be handed a node the parser never saw.
  //
  // It was reachable. `data-tint` of `x"><image href="1" onerror="…"><rect a="`
  // closed the `style="--fill-hue:var(--…)"` attribute and put a live `onerror`
  // into `svg.innerHTML` — the post-sanitize injection of HARD RULE #22, on a
  // same-origin preview frame; in a distributed `.html` export it bakes into
  // every copy the recipient opens. The same value reached a `<stop>`'s style
  // through the gradient defs. The comment on `renderHtmlNode`'s escAttr call
  // ("TINT_TOKEN_RE has already refused anything with a quote") was true of the
  // path it was written on and was used to justify not escaping on this one.
  //
  // So this arm drives the PASS with a hostile DOM, which is the only shape that
  // can fail on it. Verified red against the pre-fix build.
  describe('the browser pass refuses a hostile DOM-supplied tint', () => {
    const HOSTILE = [
      'x"><image href="1" onerror="top.__pwned=1"><rect a="',  // attribute breakout
      'red); fill:url(#evil',                                  // close the var()
      'a);}</style><script>x</script>',                        // RAWTEXT escape
      'a b', 'UPPER', '1abc', '../../etc',
    ];
    const drive = ({ nodeTint = null, edgeTint = null, edgeBg = null } = {}) => {
      const mk = (index, tint) => {
        const a = { 'data-index': String(index), 'data-kind': null, 'data-tint': tint };
        return {
          getAttribute: (k) => (Object.hasOwn(a, k) ? a[k] : null),
          querySelector: () => null,
          getBoundingClientRect: () => ({ left: 100, top: 60 + index * 90, width: 120, height: 40 }),
        };
      };
      const els = [mk(1, null), mk(2, nodeTint), mk(3, null)];
      const trs = [
        { from: 1, to: 2, event: 'a', isSelf: false,
          ...(edgeTint ? { tint: edgeTint } : null), ...(edgeBg ? { labelBg: edgeBg } : null) },
        { from: 2, to: 3, event: 'b', isSelf: false },
      ];
      const svg = { _attrs: {}, innerHTML: '', setAttribute(k, v) { this._attrs[k] = v; } };
      const at = { 'data-sc-transitions': JSON.stringify(trs), 'data-sc-dir': 'tb', 'data-sc-style': null };
      const fig = {
        getAttribute: (k) => (Object.hasOwn(at, k) ? at[k] : null),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
        closest: () => ({ getBoundingClientRect: () => ({ width: 1280 }) }),
        querySelector: (s2) => (s2 === '.state-chart-edges' ? svg
          : s2 === '.state-nodes' ? { style: {} } : null),
        querySelectorAll: (s2) => (s2 === '.state-node' ? els : []),
      };
      installStateChartLayout({ readyState: 'complete', addEventListener() {},
        querySelectorAll: (s2) => (
          s2 === '.state-chart-figure[data-sc-transitions]' || s2 === '.state-chart-figure'
            ? [fig] : []) });
      return svg.innerHTML;
    };

    for (const bad of HOSTILE) {
      test(`node \`data-tint\` — ${JSON.stringify(bad).slice(0, 34)}`, () => {
        const html = drive({ nodeTint: bad });
        assert.ok(html.length > 0, 'the pass drew something to assert about');
        assert.equal(html.includes(bad), false, 'the raw value reached the markup');
        assert.doesNotMatch(html, /<(image|script|iframe|svg)\b/i, 'an element was injected');
        assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'an event-handler attribute was injected');
      });

      test(`transition tint + label-bg — ${JSON.stringify(bad).slice(0, 26)}`, () => {
        const html = drive({ edgeTint: bad, edgeBg: bad });
        assert.ok(html.length > 0, 'the pass drew something to assert about');
        assert.equal(html.includes(bad), false, 'the raw value reached the markup');
        assert.doesNotMatch(html, /<(image|script|iframe|svg)\b/i, 'an element was injected');
        assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'an event-handler attribute was injected');
      });
    }

    // The other half of the rule: refusing must not break the legitimate channel.
    test('a well-formed token still paints', () => {
      const html = drive({ nodeTint: 'state-pass-hue', edgeTint: 'state-fail-hue',
        edgeBg: 'surface-raised' });
      // Each carries its own fallback — see the degradation arm below for why.
      assert.match(html, /--fill-hue:var\(--state-pass-hue,var\(--muted-mark\)\)/, 'node tint painted');
      assert.match(html, /--edge-tint:var\(--state-fail-hue,var\(--state-edge\)\)/, 'edge tint painted');
      assert.match(html, /--edge-label-bg:var\(--surface-raised,var\(--state-label-bg\)\)/,
        'label background painted');
    });
  });

  // A `:::token` NAMING A TOKEN THAT DOES NOT EXIST MUST DEGRADE, and five
  // surfaces promise it in those words — the transform's own docblock, the docs
  // table, the manifest, the changelog fragment and the design record: "a
  // well-formed name for a token that does not exist resolves to nothing and the
  // element keeps its inherited paint — the deck degrades, it does not break."
  //
  // It broke, three ways, all measured in real Chromium against the shipped
  // export with one letter dropped from `:::state-pass-hue`:
  //
  //   · the transition's `stroke` went to `none` — the edge VANISHED from the
  //     diagram — and its arrowhead painted rgb(0,0,0);
  //   · the state's border went to `stroke: none`;
  //   · the state's gradient stops fell to their initial and painted it SOLID
  //     BLACK.
  //
  // The cause is one CSS rule in all three: an INLINE declaration beats the
  // stylesheet, so `--edge-tint: var(--typo)` does not fall back to the
  // section's default — it makes the property invalid at computed-value time and
  // everything reading it drops to its own initial. The fix is that the inline
  // value carries its own fallback, so these assertions are on the FALLBACK
  // being present. Remove it and each one goes red.
  // NOT EVERY ARROWHEAD IS INSIDE AN EDGE GROUP. `startMarker` emits a
  // `<polygon class="state-edge-arrow">` into `<g class="state-marker">`, and the
  // CSS paints every `.state-edge-arrow` with `fill: var(--edge-tint)`. Declared
  // on `.state-edge-group`, that property simply does not exist at the marker, so
  // `fill` fell to the SVG initial and EVERY start arrowhead painted rgb(0,0,0)
  // instead of rgb(26,26,26) — on every machine including the chains this branch
  // promises are untouched, and invisible against a dark canvas.
  //
  // The commit that introduced it reported "all 52 edges across the gallery paint
  // identical stroke, dash and arrow fill". That census enumerated
  // `.state-edge-group` descendants — precisely the set that could not fail.
  //
  // So this asserts the SCOPE, which is the thing that was wrong: the default has
  // to be declared somewhere every `.state-edge-arrow` inherits from, and the only
  // such place is the section.
  test('the --edge-tint default is declared where a start marker can inherit it', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname,
      '../../../lib/components/chart/state-chart/state-chart.styles.css'), 'utf8');
    // Every selector that assigns the default (not the [data-dir="back"] override).
    const decls = [...css.matchAll(/^([^{}\n]*?)\{\s*--edge-tint:\s*var\(--state-edge\)/gm)]
      .map((m) => m[1].trim());
    assert.ok(decls.length > 0, '--edge-tint has no default declaration at all');
    assert.ok(decls.some((sel) => sel === 'section.state-chart'),
      'the --edge-tint default must be declared on `section.state-chart`, not only on ' +
      `an edge group — a start marker is outside every group. Found: ${decls.join(' | ')}`);
  });

  describe('an unknown token degrades rather than erasing the mark', () => {
    // The `inline` variant is the HTML paint path — it sets `--fill-hue` on the
    // chip directly. The default variant stamps `data-tint` on the measuring
    // <li> and lets the browser pass paint the rect, which the next test drives.
    test('the inline variant falls back to the untinted default', () => {
      const html = buildStateChart(parseStateChart(li(':::state-pass-hue')), 'inline');
      assert.match(html, /--fill-hue:var\(--state-pass-hue,var\(--muted-mark\)\)/,
        'the inline --fill-hue must carry a fallback, or an unknown token drops the border');
    });

    // The SVG paint path is the one the browser pass emits, so it is driven
    // rather than string-matched: the rect's style AND the gradient stops both
    // read the token, and the gradient one is what painted the state black.
    test('the painted rect and its gradient both fall back', () => {
      const mk = (index, tint) => {
        const a = { 'data-index': String(index), 'data-kind': null, 'data-tint': tint };
        return {
          getAttribute: (k) => (Object.hasOwn(a, k) ? a[k] : null),
          querySelector: () => null,
          getBoundingClientRect: () => ({ left: 100, top: 60 + index * 90, width: 120, height: 40 }),
        };
      };
      const els = [mk(1, null), mk(2, 'state-pass-hue'), mk(3, null)];
      const svg = { _attrs: {}, innerHTML: '', setAttribute(k, v) { this._attrs[k] = v; } };
      const at = { 'data-sc-transitions': JSON.stringify([
        { from: 1, to: 2, event: 'a', isSelf: false, tint: 'state-fail-hue' },
        { from: 2, to: 3, event: 'b', isSelf: false },
      ]), 'data-sc-dir': 'tb', 'data-sc-style': null };
      const fig = {
        getAttribute: (k) => (Object.hasOwn(at, k) ? at[k] : null),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
        closest: () => ({ getBoundingClientRect: () => ({ width: 1280 }) }),
        querySelector: (s2) => (s2 === '.state-chart-edges' ? svg
          : s2 === '.state-nodes' ? { style: {} } : null),
        querySelectorAll: (s2) => (s2 === '.state-node' ? els : []),
      };
      installStateChartLayout({ readyState: 'complete', addEventListener() {},
        querySelectorAll: (s2) => (
          s2 === '.state-chart-figure[data-sc-transitions]' || s2 === '.state-chart-figure'
            ? [fig] : []) });
      const out = svg.innerHTML;
      assert.match(out, /--fill-hue:var\(--state-pass-hue,var\(--muted-mark\)\)/,
        'the painted rect must carry a fallback');
      assert.match(out, /var\(--state-pass-hue, var\(--muted-mark\)\)/,
        'the gradient stop must carry a fallback, or an unknown token paints the state black');
      assert.match(out, /--edge-tint:var\(--state-fail-hue,var\(--state-edge\)\)/,
        'the edge tint must carry a fallback, or an unknown token erases the transition');
    });
  });

  test('an untinted machine is byte-identical — the channel is purely additive', () => {
    const plain = li();
    const model = parseStateChart(plain);
    // No `tint`/`labelBg` KEY at all, not merely a null one: the transition
    // record is JSON-serialised into `data-sc-transitions`, and an added key
    // would change every shipped gallery's markup.
    assert.equal('tint' in model.states[0], false);
    assert.equal('tint' in model.transitions[0], false);
    assert.equal('labelBg' in model.transitions[0], false);
  });

  test('the tint reaches the emitted markup on both channels', () => {
    const html = buildStateChart(
      parseStateChart(li(':::state-info-hue', ':::state-pass-hue/surface-raised')),
      {}, 'landscape'
    );
    assert.match(html, /data-tint="state-info-hue"/, 'state tint rides the measuring <li>');
    // The transition JSON lives in an ATTRIBUTE, so escAttr has entity-escaped
    // every quote — asserting the raw `"tint":"…"` form would fail against
    // correct output, and asserting an unescaped quote reached the attribute
    // would be asserting the HARD RULE #22 bug this escaping exists to prevent.
    assert.match(html, /&quot;tint&quot;:&quot;state-pass-hue&quot;/, 'transition tint rides the serialised JSON');
    assert.match(html, /&quot;labelBg&quot;:&quot;surface-raised&quot;/);
  });
});

// ── dagre re-ranking (behavioral, via a fake DOM) ────────────────────────
// These replace an earlier set that regex-matched the pass's own SOURCE TEXT.
// An independent checker showed that set could not fail on ANY of the four real
// defects it was meant to guard — the start marker clipped off-canvas, `curved`
// becoming a no-op, duplicate transitions collapsing onto one route, and chains
// being re-ranked — because all four leave the source strings intact. Asserting
// that a string is present is not asserting that a coordinate is right.
describe('dagre re-ranking (fake DOM)', () => {
  // The pass reaches a layout engine only through this global (it is serialised
  // by .toString() and carries no imports); requiring the module installs it.
  require('../../../lib/core/dagre-layout.js');
  const hasDagre = Boolean(globalThis.__latticeDagre);
  // The Node-side export gate — the other statement of the adoption predicate.
  const { machineBranches } = require('../../../lib/components/chart/state-chart/state-chart.adoption.js');
  const NODE_H = 40, ROW_GAP = 48, CX = 400;

  function run(spec) {
    const rects = {};
    let y = 60;
    for (const nd of spec.nodes) {
      const w = 70 + String(nd.label).length * 7;
      rects[nd.index] = { x: CX - w / 2, y, w, h: NODE_H };
      y += NODE_H + ROW_GAP;
    }
    const els = spec.nodes.map((nd) => {
      const a = { 'data-index': String(nd.index), 'data-kind': nd.kind || null };
      const r = rects[nd.index];
      return {
        getAttribute: (k) => (Object.hasOwn(a, k) ? a[k] : null),
        querySelector: () => null,
        getBoundingClientRect: () => ({ left: r.x, top: r.y, width: r.w, height: r.h }),
      };
    });
    const svg = { _attrs: {}, innerHTML: '<title>t</title><desc>d</desc>',
      setAttribute(k, v) { this._attrs[k] = v; } };
    const at = {
      'data-sc-transitions': JSON.stringify(spec.transitions),
      'data-sc-dir': spec.dir === 'lr' ? 'lr' : 'tb',
      'data-sc-style': spec.style === 'curved' ? 'curved' : null,
    };
    const fig = {
      getAttribute: (k) => (Object.hasOwn(at, k) ? at[k] : null),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 2400, height: 1200 }),
      closest: (s2) => (s2 === 'section'
        ? { getBoundingClientRect: () => ({ width: 1280 }) } : null),
      querySelector: (s2) => (s2 === '.state-chart-edges' ? svg
        : s2 === '.state-nodes' ? { style: {} } : null),
      querySelectorAll: (s2) => (s2 === '.state-node' ? els : []),
    };
    installStateChartLayout({
      readyState: 'complete',
      addEventListener() {},
      // BOTH selectors: the pass narrows to `[data-sc-transitions]`, and a stub
      // answering only the bare class returns no figures — the draw never runs
      // and every assertion below reads an untouched <svg>, green and vacuous.
      querySelectorAll: (s2) => (
        s2 === '.state-chart-figure[data-sc-transitions]' || s2 === '.state-chart-figure'
          ? [fig] : []),
    });
    return { svg: svg.innerHTML, viewBox: svg._attrs.viewBox, rects };
  }

  const shapes = (svg) => [...svg.matchAll(
    /<rect class="state-node-shape"[^>]*\bx="([-\d.]+)" y="([-\d.]+)"/g)]
    .map((m) => ({ x: +m[1], y: +m[2] }));

  const n = (index, label, kind) => ({ index, label, kind });
  const e = (from, to, event) => ({ from, to, event, isSelf: from === to });

  const FAN = {
    dir: 'tb',
    nodes: [n(1, 'Intake', 'start'), n(2, 'Triage'), n(3, 'Fast'), n(4, 'Deep'), n(5, 'Hold')],
    transitions: [e(1, 2, 'triage'), e(2, 3, 'fast'), e(2, 4, 'deep'), e(2, 5, 'hold')],
  };

  test('a fan-out is re-ranked — two nodes share a rank', { skip: !hasDagre }, () => {
    const ys = shapes(run(FAN).svg).map((v) => Math.round(v.y));
    assert.ok(ys.filter((v, i) => ys.indexOf(v) !== i).length >= 2,
      `expected a shared rank, got ys ${ys.join(',')}`);
  });

  // F1. The start marker is painted `markerGap + startR` BEYOND the first node —
  // geometry dagre knows nothing about. A pad of `G.gap` put it at cy = -35 on
  // every re-ranked figure, and the engine's own CONTENT CLIPPED gate fired on a
  // shipped PDF.
  test('every painted mark sits inside the viewBox', { skip: !hasDagre }, () => {
    const { svg, viewBox } = run(FAN);
    const [, , vw, vh] = viewBox.split(/\s+/).map(Number);
    for (const m of svg.matchAll(/<circle[^>]*cx="([-\d.]+)"[^>]*cy="([-\d.]+)"[^>]*r="([-\d.]+)"/g)) {
      const [cx, cy, r] = [+m[1], +m[2], +m[3]];
      assert.ok(cy - r >= -0.5, `a disc's top is at ${(cy - r).toFixed(1)} — above the canvas`);
      assert.ok(cx - r >= -0.5 && cx + r <= vw + 0.5 && cy + r <= vh + 0.5, 'disc within canvas');
    }
    for (const m of svg.matchAll(/\b[ML] (-?[\d.]+) (-?[\d.]+)/g)) {
      assert.ok(+m[2] >= -0.5, `a path vertex is at y=${m[2]} — above the canvas`);
    }
  });

  // F4. dagre parks every DISCONNECTED node in rank 0, so "two nodes share a
  // rank" fired on machines with no branch anywhere.
  for (const [name, spec] of [
    ['a states-only chart with no transitions', {
      dir: 'tb', nodes: [1, 2, 3, 4].map((i) => n(i, 'S' + i)), transitions: [],
    }],
    ['a chain with one orphan state', {
      dir: 'tb', nodes: [1, 2, 3, 4].map((i) => n(i, 'S' + i)),
      transitions: [e(1, 2, ''), e(2, 3, '')],
    }],
    ['a chain with a skip edge', {
      // The case that decided the rule's SHAPE: state 1 has two successors, so a
      // grammar-level "does it branch" test says yes — but dagre still ranks this
      // linearly, and adopting here re-laid out every shipped gallery for nothing.
      dir: 'tb', nodes: [1, 2, 3, 4].map((i) => n(i, 'S' + i)),
      transitions: [e(1, 2, ''), e(2, 3, ''), e(3, 4, ''), e(1, 4, 'skip')],
    }],
  ]) {
    test(`${name} keeps the column`, { skip: !hasDagre }, () => {
      const { svg, rects } = run(spec);
      for (const v of shapes(svg)) {
        assert.ok(Object.values(rects).some(
          (r) => Math.abs(r.x - v.x) < 0.6 && Math.abs(r.y - v.y) < 0.6),
        `node moved to ${v.x},${v.y} — it should keep its CSS position`);
      }
    });
  }

  // F2. `curved` reached only edgeTB/edgeLR, so a fan-out silently rendered as
  // the default variant with no signal the modifier had been dropped.
  test('`curved` survives a re-rank', { skip: !hasDagre }, () => {
    assert.match(run({ ...FAN, style: 'curved' }).svg, / C /, 'must emit cubics');
    assert.equal(/ C /.test(run(FAN).svg), false, 'and the default stays orthogonal');
  });

  // F3. The graph is a multigraph with a distinct name per edge, so dagre routes
  // two `1 -> 2` transitions separately; keying by endpoint PAIR threw one away.
  test('duplicate transitions between one pair get distinct routes', { skip: !hasDagre }, () => {
    const { svg } = run({
      dir: 'tb', nodes: [1, 2, 3].map((i) => n(i, 'S' + i)),
      transitions: [e(1, 2, 'fast'), e(1, 2, 'slow'), e(1, 3, 'defer')],
    });
    const ds = [...svg.matchAll(/<path class="state-edge"[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ds).size, ds.length, `two edges share a route: ${ds.join(' | ')}`);
  });

  // A label drawn BESIDE the line spends the axis it sits on, not the axis the
  // edge runs along. On TB it sits to the RIGHT, so a one-line label must not be
  // stacked into the RANK GAP as well — the gap already clears the arrowhead,
  // which is taller than one line of label text.
  //
  // That is the whole point of putting it there: vertical space is the scarce
  // axis on a 16:9 stage, and the previous rule added `labelH` on top of the
  // arrow clearance, spending height on something no longer occupying any.
  //
  // The assertion is the gap MEASURED FROM THE PAINTED RECTS, normalized by the
  // node height read from the same output, so it survives the fit scale. Old
  // rule: rankClear = 13 + 7 + 5*2 = 30. New rule: max(17, 13) = 17. Two earlier
  // versions of this test compared canvas heights across two different specs and
  // passed under BOTH rules — removing or widening a label also moves `maxW`,
  // `nodesep` and the responsive stretch, so the height difference was not
  // attributable. Pinning the gap itself is what discriminates.
  test('on TB, a one-line label is not stacked into the rank gap', { skip: !hasDagre }, () => {
    const { svg } = run({
      dir: 'tb',
      nodes: [n(1, 'A', 'start'), n(2, 'B'), n(3, 'C'), n(4, 'D')],
      transitions: [e(1, 2, 'go'), e(2, 3, 'go'), e(2, 4, 'go')],
    });
    const boxes = [...svg.matchAll(
      /<rect class="state-node-shape"[^>]*\by="([-\d.]+)" width="[-\d.]+" height="([-\d.]+)"/g)]
      .map((m) => ({ y: +m[1], h: +m[2] }));
    assert.ok(boxes.length >= 4, `expected four painted states, got ${boxes.length}`);
    const rows = [...new Set(boxes.map((b) => Math.round(b.y * 10) / 10))].sort((a, b) => a - b);
    assert.ok(rows.length >= 3, `expected three ranks, got ys ${rows.join(',')}`);
    const nodeH = boxes[0].h;
    const gap = (rows[1] - rows[0] - nodeH) / nodeH;
    // Measured: 1.01x under the old rule, 0.57x under this one. The threshold
    // sits between them and nearer the new value, so a partial revert fails too.
    // Verified red by reverting `rankClear` alone and re-running.
    assert.ok(gap < 0.8,
      `the TB rank gap is ${gap.toFixed(2)}x the node height — a one-line label ` +
      'is being stacked into the vertical gap it does not occupy');
  });

  // THE LAYOUT MUST CONVERGE. draw() re-runs on every resize, on `fonts.ready`,
  // and on every tick of a live preview's ResizeObserver — so a layout whose
  // output feeds back into its own input does not merely compute once and stop.
  //
  // It did. On a re-ranked machine the tail of draw() pins the scale box to the
  // drawing (`geo.style.width/height`), and the hidden measuring column lays out
  // INSIDE that box — so the pin left over from the previous draw constrained the
  // node boxes the next draw measured. Driven in a real browser against the real
  // `.html` export, the `lr` incident machine of `examples/state-chart-branching.md`
  // alternated between `viewBox 1167.4 x 168.1` and `1073.5 x 154.7` forever,
  // period two: the chart visibly jumped between two sizes on every redraw. The
  // measured metrics were identical each round; it was the node rects that moved.
  //
  // This harness models exactly that coupling — a `.state-chart-scale` box whose
  // pinned width squeezes the node rects — because that is the only part of the
  // mechanism a fake DOM can carry. A structural assertion that draw() calls
  // `removeProperty` would pass on a build that removed the pin at the WRONG time,
  // which is the failure mode this whole suite exists to stop seeing.
  //
  // What it proves is the COUPLING, not the period-two cycle: the squeeze here is
  // a step function, so an unfixed build settles on a second value after one draw
  // rather than alternating. Either way it produces more than one viewBox, which
  // is the assertion. Verified red by reverting the two `removeProperty` calls:
  // `683.2 x 197.5` on the first draw, `647.2 x 197.5` on every one after.
  test('the layout converges — a stale size pin cannot feed the next draw',
    { skip: !hasDagre }, () => {
    const spec = {
      dir: 'lr',
      // A GENUINE fan-out: three targets that land on one rank. `3 => 4` instead
      // would make this a chain with a skip edge, dagre would rank it linearly,
      // and the adoption test would decline to re-rank at all — no dagre layout,
      // no size pin, and this test would certify nothing.
      nodes: [n(1, 'Detected', 'start'), n(2, 'Triaged'), n(3, 'Mitigated'),
        n(4, 'Closed'), n(5, 'Escalated')],
      transitions: [e(1, 2, 'page'), e(2, 3, 'act'), e(2, 4, 'drop'), e(2, 5, 'verify')],
    };
    const NODE_H = 40, CX = 400;
    // A minimal CSSStyleDeclaration: the pass sets `width`/`height` on the pin and
    // clears them with removeProperty, which a bare object literal does not carry.
    const scale = {
      style: { removeProperty(k) { delete this[k]; } },
      // The scale box reports the PIN when one is set — that is the coupling under
      // test — and the natural column extent when it is not.
      getBoundingClientRect: () => ({
        left: 0, top: 0,
        width: Number.parseFloat(scale.style.width) || 600,
        height: Number.parseFloat(scale.style.height) || 400,
      }),
      _attrs: {},
      setAttribute(k, v) { this._attrs[k] = v; },
      getAttribute(k) { return Object.hasOwn(this._attrs, k) ? this._attrs[k] : null; },
    };
    // The reflow the pin causes, modelled: while the box is pinned, the column is
    // narrower and every node measures 12px narrower with it. Unpinned, natural.
    const squeeze = () => (scale.style.width ? 12 : 0);
    const els = spec.nodes.map((nd, i) => {
      const a = { 'data-index': String(nd.index), 'data-kind': nd.kind || null };
      return {
        getAttribute: (k) => (Object.hasOwn(a, k) ? a[k] : null),
        querySelector: () => null,
        getBoundingClientRect: () => {
          const w = 70 + String(nd.label).length * 7 - squeeze();
          return { left: CX - w / 2, top: 60 + i * (NODE_H + 48), width: w, height: NODE_H };
        },
      };
    });
    const svg = { _attrs: {}, innerHTML: '<title>t</title><desc>d</desc>',
      setAttribute(k, v) { this._attrs[k] = v; } };
    const at = {
      'data-sc-transitions': JSON.stringify(spec.transitions),
      'data-sc-dir': 'lr',
      'data-sc-style': null,
    };
    const fig = {
      getAttribute: (k) => (Object.hasOwn(at, k) ? at[k] : null),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 2400, height: 1200 }),
      closest: () => ({ getBoundingClientRect: () => ({ width: 1280 }) }),
      querySelector: (s2) => (s2 === '.state-chart-edges' ? svg
        : s2 === '.state-chart-scale' ? scale
        : s2 === '.state-nodes' ? { style: {} } : null),
      querySelectorAll: (s2) => (s2 === '.state-node' ? els : []),
    };
    const doc = {
      readyState: 'complete',
      addEventListener() {},
      querySelectorAll: (s2) => (
        s2 === '.state-chart-figure[data-sc-transitions]' || s2 === '.state-chart-figure'
          ? [fig] : []),
    };
    const boxes = [];
    for (let i = 0; i < 4; i++) {
      // A fresh document object each pass: the real install guard
      // (`doc.__scLayoutInstalled`) is per-document and would skip the observer
      // wiring, but drawAll() runs first either way. What must NOT be reset is
      // `scale`, which is the DOM node carrying the stale pin between draws.
      installStateChartLayout({ ...doc });
      boxes.push(svg._attrs.viewBox);
    }
    const distinct = [...new Set(boxes)];
    assert.equal(distinct.length, 1,
      `the layout does not converge — ${boxes.length} draws produced ` +
      `${distinct.length} distinct viewBoxes: ${boxes.join(' | ')}`);
  });

  // WRAPPING IS THE RE-RANKED PATH'S, AND A CHAIN IS NOT IT. Only `edgeDagre`
  // draws the label beside the line; a column draws it ON the line under a
  // `paint-order: stroke` halo, where a second line cuts a taller gap out of the
  // connector — the failure moving the label off the line exists to avoid.
  //
  // The wrap was applied to `t.event` before the adoption test, so it re-rendered
  // every chain too — which is every machine in the six shipped galleries. It went
  // unseen because the longest event any shipped deck carries (`return for
  // changes`, ~119px) clears the 134.4px `lr` budget by 15px, so no gallery moved
  // and the byte-identity check saw nothing. This test uses a label that does not
  // clear it.
  test('a chain does not wrap — the label is still drawn on the line', () => {
    const long = 'submit for editorial review';
    const mk = (index) => {
      const a = { 'data-index': String(index), 'data-kind': index === 1 ? 'start' : null };
      return {
        getAttribute: (k) => (Object.hasOwn(a, k) ? a[k] : null),
        querySelector: () => null,
        getBoundingClientRect: () => ({ left: 100 + (index - 1) * 260, top: 100, width: 120, height: 40 }),
      };
    };
    const els = [mk(1), mk(2), mk(3)];
    const svg = { _attrs: {}, innerHTML: '', setAttribute(k, v) { this._attrs[k] = v; } };
    const at = {
      'data-sc-transitions': JSON.stringify([
        { from: 1, to: 2, event: long, isSelf: false },
        { from: 2, to: 3, event: 'ok', isSelf: false },
      ]),
      'data-sc-dir': 'lr', 'data-sc-style': null,
    };
    const fig = {
      getAttribute: (k) => (Object.hasOwn(at, k) ? at[k] : null),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 600 }),
      closest: () => ({ getBoundingClientRect: () => ({ width: 1280 }) }),
      querySelector: (s2) => (s2 === '.state-chart-edges' ? svg
        : s2 === '.state-nodes' ? { style: {} } : null),
      querySelectorAll: (s2) => (s2 === '.state-node' ? els : []),
    };
    installStateChartLayout({ readyState: 'complete', addEventListener() {},
      querySelectorAll: (s2) => (
        s2 === '.state-chart-figure[data-sc-transitions]' || s2 === '.state-chart-figure'
          ? [fig] : []) });
    const html = svg.innerHTML;
    // Not re-ranked: three states in a row is a column, so the adoption test
    // declines and the canvas stays the measured figure box rather than a dagre
    // drawing. Asserting this is not decoration — if the machine DID re-rank, the
    // wrap would be legitimate and the rest of this test would pin the wrong rule.
    assert.equal(svg._attrs.viewBox, '0 0 1200.0 600.0',
      'this machine must NOT be re-ranked — the canvas should still be the figure box');
    assert.match(html, new RegExp('>' + long + '</text>'),
      'the chain label must render as one unbroken line, as it does on main');
    assert.doesNotMatch(html, /<tspan/, 'a chain label must not be split into tspans');
  });

  // THE LABEL MUST CLEAR ITS OWN EDGE, which is the point of moving it off the
  // line and is what the branching deck's coda claims in so many words. It did
  // not: `ly` is the label BLOCK's centre, so `mid.y + labelOff` put the first
  // line's CENTRE 7px below the edge and its box TOP 0.5px below it — and
  // `.state-edge-label` carries a `paint-order: stroke` halo (0.46875cqi, ~3px
  // half-width at the HD baseline) that reached back across the line. On page 7
  // of `examples/state-chart-branching.md` the one-line `auto approve` notched
  // the green edge and the two-line `escalate to legal / counsel` broke its
  // connector into a dashed run — visible at a glance in the committed PDF.
  //
  // So the assertion is the CLEARANCE, measured off the emitted geometry: the top
  // of the first line's box must sit at least `labelOff` below the edge it
  // labels. Verified red against the block-centered offset.
  test('an lr label clears the edge it labels', { skip: !hasDagre }, () => {
    const LABEL_LINE = 13, LABEL_OFF = 7;   // G.labelLine, G.labelOff
    const { svg } = run({
      dir: 'lr',
      nodes: [n(1, 'Submitted', 'start'), n(2, 'Second'), n(3, 'Approved'), n(4, 'Escalated')],
      transitions: [e(1, 2, 'needs second review'), e(1, 3, 'auto approve'),
        e(2, 4, 'escalate to legal counsel')],
    });
    // Pair each edge path with the label that follows it — `edgeDagre` emits the
    // path, then the arrowhead, then the label, in that order.
    const chunks = svg.split('<path class="state-edge"').slice(1);
    let checked = 0;
    for (const c of chunks) {
      const d = /\bd="([^"]+)"/.exec(c);
      const lab = /<text class="state-edge-label"[^>]*?(?:\sy="([-\d.]+)")?[^>]*>([\s\S]*?)<\/text>/.exec(c);
      if (!d || !lab) continue;
      const ys = [...d[1].matchAll(/[ML]\s[-\d.]+\s([-\d.]+)/g)].map((m) => Number(m[1]));
      // Only a level run has a single unambiguous edge y to measure against.
      if (!ys.length || Math.max(...ys) - Math.min(...ys) > 0.5) continue;
      const edgeY = ys[0];
      const tspanYs = [...lab[0].matchAll(/<tspan[^>]*\by="([-\d.]+)"/g)].map((m) => Number(m[1]));
      const firstY = tspanYs.length ? Math.min(...tspanYs) : Number(lab[1]);
      if (!Number.isFinite(firstY)) continue;
      const boxTop = firstY - LABEL_LINE / 2;
      checked++;
      assert.ok(boxTop - edgeY >= LABEL_OFF - 0.01,
        `a label sits ${(boxTop - edgeY).toFixed(2)}px below its edge, under the ` +
        `${LABEL_OFF}px clearance — its halo will cut the connector`);
    }
    assert.ok(checked > 0, 'no level lr run with a label was found to measure');
  });

  // A DEGENERATE NODE BOX MUST NOT REACH THE CANVAS. Every dimension in this pass
  // comes from `getBoundingClientRect` on elements found in the document, and a
  // `.state-node` with a zero, negative or non-finite rect used to propagate
  // straight through: measured, a zero-size node emitted `viewBox="0 0 47.8 NaN"`
  // with path data reading `M 23.9 NaN`, which makes the browser discard the
  // viewBox and render the overlay as nothing. `origin/main` produced a valid
  // canvas on the same input, so it arrived with the dagre path.
  //
  // Not reachable from authored markdown, but reachable through the same raw
  // inline HTML that made the tint injection above reachable — and "not reachable
  // today" is not something to depend on when the fix is a guard.
  describe('a degenerate node box degrades instead of poisoning the canvas', () => {
    const drive = (rectFor) => {
      const els = [1, 2, 3, 4].map((i) => {
        const a = { 'data-index': String(i), 'data-kind': i === 1 ? 'start' : null };
        return { getAttribute: (k) => (Object.hasOwn(a, k) ? a[k] : null),
          querySelector: () => null, getBoundingClientRect: () => rectFor(i) };
      });
      const svg = { _attrs: {}, innerHTML: '', setAttribute(k, v) { this._attrs[k] = v; } };
      const at = { 'data-sc-transitions': JSON.stringify([
        { from: 1, to: 2, event: 'a', isSelf: false },
        { from: 2, to: 3, event: 'b', isSelf: false },
        { from: 2, to: 4, event: 'c', isSelf: false }]),
        'data-sc-dir': 'tb', 'data-sc-style': null };
      const fig = {
        getAttribute: (k) => (Object.hasOwn(at, k) ? at[k] : null),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
        closest: () => ({ getBoundingClientRect: () => ({ width: 1280 }) }),
        querySelector: (s2) => (s2 === '.state-chart-edges' ? svg
          : s2 === '.state-nodes' ? { style: {} } : null),
        querySelectorAll: (s2) => (s2 === '.state-node' ? els : []),
      };
      installStateChartLayout({ readyState: 'complete', addEventListener() {},
        querySelectorAll: (s2) => (
          s2 === '.state-chart-figure[data-sc-transitions]' || s2 === '.state-chart-figure'
            ? [fig] : []) });
      return { viewBox: svg._attrs.viewBox, markup: svg.innerHTML };
    };

    for (const [name, rectFor] of [
      ['zero-size', () => ({ left: 0, top: 0, width: 0, height: 0 })],
      ['negative width', (i) => ({ left: 100, top: 60 + i * 90, width: -50, height: 40 })],
      ['Infinity', (i) => ({ left: 100, top: 60 + i * 90, width: Infinity, height: 40 })],
      ['all NaN', () => ({ left: NaN, top: NaN, width: NaN, height: NaN })],
    ]) {
      test(name, { skip: !hasDagre }, () => {
        const { viewBox, markup } = drive(rectFor);
        // Two acceptable outcomes, and no third: either the pass bails and leaves
        // the CSS column standing (no viewBox), or it draws a finite canvas. What
        // must never happen is a canvas or a coordinate carrying NaN/Infinity.
        assert.doesNotMatch(markup, /NaN|Infinity/,
          'a degenerate node rect reached the emitted markup');
        if (viewBox !== undefined) {
          const [, , w, h] = viewBox.split(/\s+/).map(Number);
          assert.ok(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0,
            `the canvas is not a finite positive box: ${viewBox}`);
        }
      });
    }

    test('a well-formed machine is unaffected by the guard', { skip: !hasDagre }, () => {
      const { viewBox, markup } = drive((i) => ({ left: 100, top: 60 + i * 90, width: 120, height: 40 }));
      assert.match(viewBox, /^0 0 [\d.]+ [\d.]+$/);
      assert.match(markup, /state-node-shape/, 'the states are still painted');
    });
  });

  test('an authored line break renders as two tspans', { skip: !hasDagre }, () => {
    const { svg } = run({ ...FAN,
      transitions: FAN.transitions.map((t, i) => (i === 1 ? { ...t, event: 'needs\nreview' } : t)) });
    assert.match(svg, /<text class="state-edge-label"[^>]*>(<tspan[^>]*>[^<]*<\/tspan>){2,}/,
      'a two-line event label must emit one tspan per line');
  });

  // ── an edge label never lands on a node, or on another label ───────────────
  //
  // The clearance floor fed to dagre is an AXIS-ALIGNED guarantee: it reserves
  // room along the rank and cross axes, which bounds a label sitting beside a
  // straight run and bounds nothing beside a diagonal one. Measured on the
  // shipped decks before the collision walk: `accept` overlapped node 2 by
  // 3.28px, `block` overlapped node 9 by 1.63px, and `block` overlapped the
  // `reject` label by 1.9px — 3 collisions across 118 labels.
  //
  // THE FIX THE DEFECT'S OWN NOTE PROPOSED IS THE WRONG ONE, and the reason is
  // worth keeping: it said to anchor the label on "the longest AXIS-ALIGNED
  // segment of the route (dagre's orthogonal routes always have one)". Measured,
  // dagre-d3-es does not route orthogonally — it emits a point per rank boundary,
  // so a route is a short stub at each node border joined by long diagonals. On
  // the two figures that actually grazed, the longest axis-aligned segment was
  // 34px against a 277px diagonal, and one edge had none at all. Anchoring there
  // parks the label against a node border, which is worse than the graze.
  describe('edge labels clear the boxes around them', () => {
    const LH = 13;   // G.labelLine — the line box the renderer models against

    // Both boxes as the renderer computes them. The width uses `makeLabelW`'s
    // NO-CANVAS fallback (`len * 6.6 * S`), which is the branch a fake DOM takes,
    // so these are the same numbers the pass itself worked from.
    const geometry = (svg) => {
      const attr = (tag, k) => { const m = tag.match(new RegExp(`${k}="([^"]*)"`)); return m ? m[1] : null; };
      const nodes = [...svg.matchAll(
        /<rect class="state-node-shape"[^>]*\bx="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)]
        .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
      const labels = [...svg.matchAll(/<text class="state-edge-label"([^>]*)>([\s\S]*?)<\/text>/g)].map((m) => {
        const tag = m[1], body = m[2];
        const tsp = [...body.matchAll(/<tspan x="([-\d.]+)" y="([-\d.]+)">([^<]*)<\/tspan>/g)];
        const lines = tsp.length ? tsp.map((t) => t[3]) : [body];
        const cx = tsp.length ? +tsp[0][1] : +attr(tag, 'x');
        const cy = tsp.length ? +tsp[0][2] + ((tsp.length - 1) * LH) / 2 : +attr(tag, 'y');
        const w = Math.max(...lines.map((l) => l.length * 6.6));
        const h = lines.length * LH;
        const anc = attr(tag, 'text-anchor');
        return { x: anc === 'start' ? cx : anc === 'end' ? cx - w : cx - w / 2,
          y: cy - h / 2, w, h, cx, cy, anchor: anc, text: lines.join(' / ') };
      });
      return { nodes, labels };
    };
    const overlaps = (a, b) => (
      Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0
      && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0);

    // A branch that rejoins, with labels long enough that the naive midpoint of
    // the diagonal into `Blocked` puts `submit for review` over a node box. This
    // spec is the arm's whole point: it is RED without the collision walk (one
    // label-node overlap) and green with it. A spec that never collides would
    // certify nothing.
    const REJOIN = { dir: 'tb',
      nodes: [n(1, 'Open', 'start'), n(2, 'Work'), n(3, 'Review'), n(4, 'Blocked'), n(5, 'Done')],
      transitions: [e(1, 2, 'start'), e(2, 3, 'submit for review'), e(2, 4, 'block'),
        e(4, 2, 'unblock'), e(3, 5, 'ship')] };

    test('no label box overlaps a node box', { skip: !hasDagre }, () => {
      const { nodes, labels } = geometry(run(REJOIN).svg);
      assert.ok(labels.length >= 5, `expected the machine's labels, got ${labels.length}`);
      for (const l of labels) {
        for (const nd of nodes) {
          assert.equal(overlaps(l, nd), false,
            `"${l.text}" sits on the node at ${nd.x},${nd.y} — the label is unreadable and so is the state`);
        }
      }
    });

    test('no two label boxes overlap', { skip: !hasDagre }, () => {
      const { labels } = geometry(run(REJOIN).svg);
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          assert.equal(overlaps(labels[i], labels[j]), false,
            `"${labels[i].text}" and "${labels[j].text}" overlap — they read as one garbled token`);
        }
      }
    });

    // THE BLAST RADIUS, asserted rather than assumed. The walk tries the arc-length
    // midpoint FIRST and keeps it whenever it is clear, so a machine with no
    // collision must be laid out exactly as it was before the walk existed —
    // measured across the four shipped state-chart decks, 2 pages of 38 changed.
    // Recovering the home position from the DRAWN PATH rather than hardcoding
    // coordinates keeps this from breaking on unrelated spacing changes.
    test('a label that does not collide stays on its edge midpoint', { skip: !hasDagre }, () => {
      const svg = run(FAN).svg;
      const groups = [...svg.matchAll(/<g class="state-edge-group"[^>]*>([\s\S]*?)<\/g>/g)].map((m) => m[1]);
      let checked = 0;
      for (const g of groups) {
        const d = (g.match(/<path class="state-edge"[^>]*\bd="([^"]+)"/) || [])[1];
        const lab = g.match(/<text class="state-edge-label"[^>]*\bx="([-\d.]+)" y="([-\d.]+)"/);
        if (!d || !lab || d.includes('C')) continue;
        const pts = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }));
        let total = 0;
        for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        let seen = 0, mid = pts[0];
        for (let i = 1; i < pts.length; i++) {
          const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
          if (seen + seg >= total / 2) {
            const u = seg > 0 ? (total / 2 - seen) / seg : 0;
            mid = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u,
              y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u };
            break;
          }
          seen += seg;
        }
        // FAN is `tb`: the label sits to the RIGHT of the run, `labelOff` (7) across,
        // vertically centred on the midpoint.
        assert.ok(Math.abs(+lab[1] - (mid.x + 7)) < 0.2 && Math.abs(+lab[2] - mid.y) < 0.2,
          `an uncrowded label moved: drawn at ${lab[1]},${lab[2]}, midpoint puts it at ${(mid.x + 7).toFixed(1)},${mid.y.toFixed(1)}`);
        checked++;
      }
      assert.ok(checked >= 3, `expected several straight labelled edges to check, got ${checked}`);
    });
  });

  // ── the export gate READS REAL RENDERED MARKUP ────────────────────────────
  //
  // The agreement arm below drives `machineBranches` with a hand-built topology.
  // Everything BETWEEN the rendered deck and that call — the figure splitter, the
  // attribute regexes, the entity un-escaping, the `data-states` cross-check, the
  // `data-kind="terminal"` read — is what actually runs on every CLI export, and
  // it had no arm at all. A reader that silently stopped parsing would answer
  // TRUE for everything (the safe direction), so nothing would break and the
  // saving would just quietly disappear; a reader that mis-parsed the other way
  // ships a branching machine as a numbered column.
  describe('the export gate on real rendered decks', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const ROOT = path.join(__dirname, '..', '..', '..');
    const engine = require('../../../lib/engine/index.js');
    const { htmlNeedsDagre, figureChunks, figureNeedsDagre } =
      require('../../../lib/components/chart/state-chart/state-chart.adoption.js');
    const render = (rel) => engine.render(fs.readFileSync(path.join(ROOT, rel), 'utf8')).html;

    // THE CLAIM THE WHOLE OPTIMIZATION RESTS ON. Every machine in the shipped
    // gallery is a chain, so no gallery export owes the 63.7 KB engine. If a
    // gallery ever gains a branching machine this goes red, which is the right
    // outcome: the number in the decision record stops being true that day.
    test('the shipped state-chart gallery needs no layout engine', { skip: !hasDagre }, () => {
      const html = render('lib/components/chart/state-chart/state-chart.gallery.md');
      const figs = figureChunks(html);
      assert.ok(figs.length >= 8, `expected the gallery's figures, found ${figs.length}`);
      const adopting = figs.filter(figureNeedsDagre);
      assert.equal(adopting.length, 0,
        `${adopting.length} gallery machine(s) branch — every one of them is supposed to be a chain`);
      assert.equal(htmlNeedsDagre(html), false);
    });

    // …AND THE READER CAN STILL SAY YES. Without this the arm above is satisfied
    // by a reader that answers `false` unconditionally — which is the dangerous
    // direction, and the one no other arm here would notice.
    test('a shipped branching deck does need it', { skip: !hasDagre }, () => {
      const html = render('examples/state-chart-branching.md');
      const figs = figureChunks(html);
      const adopting = figs.filter(figureNeedsDagre).length;
      assert.ok(adopting >= 1 && adopting < figs.length,
        `expected SOME of the ${figs.length} figures to branch, got ${adopting} — all or none means the reader is not discriminating`);
      assert.equal(htmlNeedsDagre(html), true);
    });

    test('a deck with no state chart needs nothing, without parsing anything', { skip: !hasDagre }, () => {
      assert.equal(htmlNeedsDagre('<section><h2>Just prose</h2></section>'), false);
      assert.equal(htmlNeedsDagre(''), false);
      assert.equal(htmlNeedsDagre(null), false);
    });

    // The `inline` variant renders chips, carries no `data-sc-transitions`, and is
    // never drawn by the browser pass — so it can never need a layout engine.
    test('an inline-variant figure never asks for the engine', { skip: !hasDagre }, () => {
      const inline = '<div class="state-chart-figure" data-variant="inline" data-sc-dir="tb" '
        + 'data-states="3" data-transitions="2"><ol class="state-rows"></ol></div>';
      assert.equal(htmlNeedsDagre(inline), false);
      assert.equal(figureNeedsDagre(figureChunks(inline)[0]), false);
    });

    // EVERY UNREADABLE SHAPE ANSWERS TRUE. A false positive ships an unused
    // engine; a false negative silently returns a branching machine to the
    // numbered column. These are the shapes a hostile or hand-edited deck can
    // present to a regex reading its own output.
    for (const [name, html] of [
      ['unparseable transitions JSON',
        '<div class="state-chart-figure" data-sc-dir="tb" data-states="2" data-sc-transitions="{{{"><ol></ol></div>'],
      ['transitions that are not an array',
        '<div class="state-chart-figure" data-sc-dir="tb" data-states="2" data-sc-transitions="7"><ol></ol></div>'],
      ['a node count that disagrees with data-states',
        '<div class="state-chart-figure" data-sc-dir="tb" data-states="9" data-sc-transitions="[]">'
        + '<li class="state-node" data-index="1">A</li></div>'],
      ['no recognisable nodes at all',
        '<div class="state-chart-figure" data-sc-dir="tb" data-states="2" data-sc-transitions="[]"><ol></ol></div>'],
    ]) {
      test(`${name} ships the engine rather than guessing`, { skip: !hasDagre }, () => {
        assert.equal(htmlNeedsDagre(html), true,
          'an unreadable figure must err toward shipping the engine — the other direction is silent and wrong');
      });
    }
  });

  // ── the export gate agrees with the pass, machine for machine ──────────────
  //
  // `state-chart.adoption.js` decides in NODE whether an export owes the 63.7 KB
  // dagre IIFE, and the pass decides in the BROWSER whether to use it. They are
  // two statements of one predicate — the pass is serialised through
  // `.toString()`, so it carries no imports and cannot call the module, and the
  // module cannot reach into the closure. Nothing structural binds them, so this
  // does: one corpus, both answers, asserted equal.
  //
  // The pass's answer is read off its OUTPUT, not off a flag it sets — a node
  // painted anywhere other than its CSS rect means dagre re-ranked. That is the
  // §9.1 lesson: a test that asks the code what it did rather than what it drew
  // passes with the defect present.
  //
  // The asymmetry is deliberate and is asserted directionally too: a gate that
  // over-ships costs 22.4 KB of unused engine, a gate that under-ships silently
  // returns a branching machine to the numbered column.
  describe('the Node export gate agrees with the pass', () => {
    const CORPUS = [
      ['a fan-out', FAN],
      ['a fan-out, lr', { ...FAN, dir: 'lr' }],
      ['a plain chain', { dir: 'tb', nodes: [1, 2, 3, 4].map((i) => n(i, 'S' + i)),
        transitions: [e(1, 2, 'a'), e(2, 3, 'b'), e(3, 4, 'c')] }],
      ['a chain with a self-loop', { dir: 'tb', nodes: [1, 2, 3, 4].map((i) => n(i, 'S' + i)),
        transitions: [e(1, 2, 'a'), e(2, 2, 'retry'), e(2, 3, 'b'), e(3, 4, 'c')] }],
      // The case a degree-counting gate gets wrong: the back edge gives state 1 a
      // second in-edge, but dagre reverses it and the ranks stay strictly
      // increasing. Every shipped gallery chain has one of these.
      ['a chain with a back edge', { dir: 'tb', nodes: [1, 2, 3, 4].map((i) => n(i, 'S' + i)),
        transitions: [e(1, 2, 'a'), e(2, 3, 'b'), e(3, 4, 'c'), e(4, 1, 'reopen')] }],
      ['a chain with a skip edge', { dir: 'tb', nodes: [1, 2, 3, 4].map((i) => n(i, 'S' + i)),
        transitions: [e(1, 2, ''), e(2, 3, ''), e(3, 4, ''), e(1, 4, 'skip')] }],
      ['a states-only chart', { dir: 'tb', nodes: [1, 2, 3, 4].map((i) => n(i, 'S' + i)),
        transitions: [] }],
      ['a chain with one orphan state', { dir: 'tb', nodes: [1, 2, 3, 4].map((i) => n(i, 'S' + i)),
        transitions: [e(1, 2, ''), e(2, 3, '')] }],
      // A JOIN, not a fan-out: no state has two successors, so an out-degree test
      // says chain — and dagre puts 1 and 2 in one rank.
      ['a join', { dir: 'tb', nodes: [1, 2, 3].map((i) => n(i, 'S' + i)),
        transitions: [e(1, 3, 'a'), e(2, 3, 'b')] }],
      ['two disconnected chains', { dir: 'tb', nodes: [1, 2, 3, 4].map((i) => n(i, 'S' + i)),
        transitions: [e(1, 2, 'a'), e(3, 4, 'b')] }],
      ['duplicate transitions between one pair', { dir: 'tb', nodes: [1, 2, 3].map((i) => n(i, 'S' + i)),
        transitions: [e(1, 2, 'fast'), e(1, 2, 'slow'), e(1, 3, 'defer')] }],
      ['a terminal-marked state that still has an exit', { dir: 'tb',
        nodes: [n(1, 'A', 'start'), n(2, 'B', 'terminal'), n(3, 'C')],
        transitions: [e(1, 2, 'a'), e(2, 3, 'b')] }],
      ['a two-state machine', { dir: 'tb', nodes: [1, 2].map((i) => n(i, 'S' + i)),
        transitions: [e(1, 2, 'a')] }],
    ];

    // The pass re-ranked iff some painted node left its CSS rect.
    const passReRanked = (spec) => {
      const { svg, rects } = run(spec);
      return shapes(svg).some((v) => !Object.values(rects).some(
        (r) => Math.abs(r.x - v.x) < 0.6 && Math.abs(r.y - v.y) < 0.6));
    };

    for (const [name, spec] of CORPUS) {
      test(name, { skip: !hasDagre }, () => {
        const gate = machineBranches({
          nodes: spec.nodes.map((nd) => ({ index: nd.index, isTerminal: nd.kind === 'terminal' })),
          transitions: spec.transitions,
          dir: spec.dir,
        });
        assert.equal(gate, passReRanked(spec),
          gate
            ? 'the gate ships dagre for a machine the pass lays out as a column'
            : 'THE GATE WITHHOLDS DAGRE FROM A MACHINE THE PASS RE-RANKS — the export '
              + 'would silently fall back to the numbered column');
      });
    }

    // At least one of each, or the loop above could pass by agreeing on nothing.
    test('the corpus exercises both answers', { skip: !hasDagre }, () => {
      const answers = CORPUS.map(([, spec]) => passReRanked(spec));
      assert.ok(answers.some(Boolean), 'no machine in the corpus is re-ranked');
      assert.ok(answers.some((a) => !a), 'no machine in the corpus keeps the column');
    });
  });
});

/**
 * Polynomial ReDoS on author text — the class CodeQL flagged high on PR #2084.
 *
 * A state's lead text and a transition's event label are whatever the deck says,
 * so a pattern that backtracks quadratically here is reachable by any author (and
 * by any deck a Studio user pastes in). Three patterns on this path had it, and
 * the third is the instructive one: it was introduced BY the fix for the first
 * two. `/\s+$/` retries `\s+` from every position in a trailing whitespace run,
 * each attempt failing at `$` — 732ms on 32k spaces, worse than the regex it
 * replaced. `trimEnd()` is native and linear.
 *
 * Pinned by SHAPE, not by a wall-clock threshold: a timing assertion would be
 * flaky on a loaded runner. Quadratic growth shows up as a ratio — 4x the input
 * costs ~16x the time — so the test compares two sizes and allows a wide band.
 */
describe('state-chart parsing stays linear on adversarial author text', () => {
  const timeOf = (fn) => {
    fn(); // warm, so JIT compilation is not counted as growth
    const t0 = process.hrtime.bigint();
    fn();
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };

  for (const [name, build, lo, hi] of [
    ['a state lead with a long whitespace run', (pad) =>
      () => parseStateLi(`Draft <code>start</code>a${pad}b`, 1)],
    ['an event label with a long whitespace run', (pad) =>
      () => parseTransitionToken(`${pad}go => 2`)],
    // A MATCHING input never backtracks, so the arm above cannot see the defect
    // it looks like it covers. `TRANSITION_RE` was
    // `/^\s*([^=]*?)\s*=>\s*(\d+|self)\s*$/` — three quantifiers dividing one
    // whitespace run — which is CUBIC, but only when the match FAILS. Measured
    // before the fix: 4 000 spaces cost 8 272ms failing and 0.06ms matching. A
    // nested bullet whose inline code is nothing but spaces reaches it from
    // ordinary authoring, and blocks whatever thread is parsing.
    // These two run at 500/2 000 rather than 8 000/32 000, and the smaller sizes
    // are load-bearing: under the old cubic regex a 32 000-space NON-match takes
    // roughly an hour, so the arm would HANG rather than fail, and a hanging test
    // is worse than a red one. At 500 -> 2 000 the old form measures 19.93ms ->
    // 1 030ms (a 51x ratio, caught immediately) and the fixed form stays flat.
    ['an event label that does NOT match — the failing path is the slow one', (pad) =>
      () => parseTransitionToken(pad), 500, 2000],
    ['a token with an arrow but no target — matches the prefix, fails at the end', (pad) =>
      () => parseTransitionToken(`${pad}go =>${pad}`), 500, 2000],
    ['a lead whose whitespace run is TRAILING', (pad) =>
      () => parseStateLi(`Draft <code>start</code>${pad}`, 1)],
  ]) {
    test(name, () => {
      const small = timeOf(build(' '.repeat(lo || 8000)));
      const large = timeOf(build(' '.repeat(hi || 32000)));
      // 4x the input. Linear ~4x; quadratic ~16x. 9x is a wide band that still
      // separates the two, and both sides are milliseconds on a quiet machine.
      const ratio = large / Math.max(small, 0.05);
      assert.ok(ratio < 9,
        `4x the input cost ${ratio.toFixed(1)}x the time (${small.toFixed(1)}ms -> ` +
        `${large.toFixed(1)}ms) — that is polynomial backtracking, not linear scanning`);
    });
  }
});
