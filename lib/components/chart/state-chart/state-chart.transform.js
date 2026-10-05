/**
 * state-chart — the server half of a state machine (state chart v2).
 *
 * THE GRAMMAR IS THE FLOWCHART'S (lib/core/flowchart-grammar.js; the plan is
 * engineering/decisions/2026-09-27-trama-graph-chart-library.md §5 and
 * 2026-09-25-flowchart-authoring.md §14). Every list item is a state, named by its text;
 * a sub-item that starts with an arrow is a transition (`- -submit-> Submitted`); a
 * sub-list of states makes a composite state (a group); a trailing code span styles what
 * it follows. Two words are the state chart's own, in a state's span: `start` and `end`.
 * A `>` blockquote under a state is its hidden detail. This file reads the slide's
 * RENDERED list with the grammar's HTML reader, so the chart parses exactly what
 * `lint:deck` parsed from the Markdown.
 *
 * WHAT IT EMITS. A MEASURING HARNESS (each state as an HTML tile, with its ordinal badge,
 * and each transition label and composite title as a box the browser sizes in the deck's
 * own fonts), an empty `<svg>` with the chart's accessible name and description, and the
 * parsed model as `data-sc-model`. The browser half (`state-chart.layout.js`, a Trama
 * adapter) measures the harness, lays the machine out with Trama's kernel and paints it.
 * Until that pass runs, or where it never can, the harness shows: every state as a tile
 * in authored order.
 *
 * The `inline` variant is not a graph: it stays an HTML list of rows, each with its
 * transitions as chips, and no pass draws it.
 *
 * UNTRUSTED TEXT. Every name, label and detail is escaped here, and the model payload is
 * JSON in an escaped attribute; the browser half sanitizes the model again (HARD RULE #22).
 */
const { outlineFromHtml } = require('../../../core/flowchart-html');
const { parseStateMachine } = require('../../../core/state-graph-facts');
const { shapeNotes } = require('../../../core/flowchart-grammar');
const { escAttr, escHtml } = require('../_chart-family/transform-utils');
const { buildKey } = require('../_chart-family/graph-key');
const markDetail = require('../_chart-family/mark-detail');

// Direction pins (`lr`, `tb`), presentation (`inline`), paint (`curved`) and the badge
// switch (`unnumbered`). `horizontal` is kept as an alias for `lr inline`.
const STATE_CHART_VARIANTS = ['lr', 'tb', 'inline', 'curved', 'unnumbered'];

/** Parse an outline into the state chart's model: `parseStateMachine` in state-graph-facts.js. */
function parseStateChart(outline) {
  return parseStateMachine(outline);
}

// The data attributes a state carries, on its harness tile and (through the model) its
// painted tile, so the two read one set of facts.
function stateAttrs(s) {
  let a = ` data-id="${escAttr(s.id)}" data-index="${s.index}"`;
  if (s.shape && s.shape !== 'box') a += ` data-shape="${escAttr(s.shape)}"`;
  if (s.isStart) a += ' data-kind="start"';
  else if (s.isTerminal) a += ' data-kind="terminal"';
  if (s.status) a += ` data-s="${escAttr(s.status)}"`;
  if (s.slot) a += ` data-slot="${s.slot}"`;
  for (const ch of ['fill', 'border', 'text']) if (s[ch]) a += ` data-${ch}="${s[ch]}"`;
  return a;
}

// The mark attributes the chart family's reveal layer reads: `data-mark` (0-based, the
// detail template's index) and the popover's title source.
function markAttrs(s) {
  return ` data-mark="${s.index - 1}" data-label="${escAttr(s.name)}"${s.status ? ` data-value="${escAttr(s.status)}"` : ''}`;
}

/**
 * The ordinal badge: the state's place in the list. It carries the status for ASSISTIVE
 * TECHNOLOGY only (the tile paints it for everyone else), so the label names both; a bare
 * span's label is ignored by ARIA, hence `role="img"`.
 */
function badge(s) {
  const name = s.status ? `State ${s.index}, ${s.status}` : `State ${s.index}`;
  return `<span class="state-index"${s.status ? ` data-s="${escAttr(s.status)}"` : ''} role="img" aria-label="${escAttr(name)}">${s.index}</span>`;
}

/** The model the browser pass needs: the states, composites and transitions, no diagnostics. */
function payload(model, opts) {
  return {
    states: model.states.map((s) => {
      const o = { id: s.id, name: s.name, parent: s.parent || null, index: s.index, shape: s.shape || 'box' };
      if (s.isStart) o.start = true;
      if (s.isTerminal) o.end = true;
      for (const k of ['status', 'slot', 'fill', 'border', 'text']) if (s[k]) o[k] = s[k];
      return o;
    }),
    groups: model.groups.map((g) => ({ id: g.id, name: g.name, parent: g.parent || null, ...(g.slot ? { slot: g.slot } : {}) })),
    edges: model.edges.map((e) => {
      const o = { from: e.from, to: e.to, dir: e.dir || 'out' };
      if (e.label) o.label = e.label;
      if (e.heavy) o.heavy = true;
      if (e.back) o.back = true;
      const st = {};
      for (const k of ['slot', 'pattern', 'head', 'loose']) if (e.style?.[k]) st[k] = e.style[k];
      o.style = st;
      return o;
    }),
    badges: opts.badges !== false,
  };
}

/**
 * The drawing's accessible description: what a screen reader hears in place of the
 * picture, since the painted tiles are hidden from assistive tech. Every state in order
 * with its role and status, then every transition by name.
 */
function describe(model) {
  const name = (id) => (model.states.find((s) => s.id === id) || model.groups.find((g) => g.id === id) || { name: id }).name;
  const states = model.states.map((s) => {
    const kind = s.isStart ? ' (start)' : s.isTerminal ? ' (end)' : '';
    return `${s.index}. ${s.name}${kind}${s.status ? `, ${s.status}` : ''}`;
  }).join('; ');
  const moves = model.edges.map((e) => `${e.label ? `on ${e.label}, ` : ''}${name(e.from)} to ${name(e.to)}`).join('; ');
  const groups = model.groups.map((g) => {
    const members = model.states.filter((s) => s.parent === g.id).map((s) => s.name);
    return `${g.name}: ${members.join(', ') || 'empty'}`;
  }).join('; ');
  const parts = [];
  if (states) parts.push(`States — ${states}`);
  if (groups) parts.push(`Composite states — ${groups}`);
  if (moves) parts.push(`Transitions — ${moves}`);
  return parts.join('. ');
}

// Per-state reveal detail (the chart family's substrate, mark-detail.js): a blockquote
// under a state is hidden detail, shown when the state is hovered or tapped and folded
// into the speaker notes.
function stateMarks(model) {
  const notes = shapeNotes(model);
  return model.states.map((s) => ({
    label: s.name,
    valueRaw: s.status || '',
    detail: (notes.get(s.id) || []).map((t) => `<li>${escHtml(t)}</li>`).join(''),
  }));
}
function buildDetail(model) {
  const marks = stateMarks(model);
  return markDetail.detailPayload(marks) + markDetail.detailNote(marks);
}

function buildDefault(model, o) {
  const tiles = model.states.map((s) =>
    `<li class="state-node"${stateAttrs(s)}${markAttrs(s)}>${o.badges ? badge(s) : ''}<span class="state-label">${escHtml(s.name)}</span></li>`).join('');
  const labels = model.edges.map((e, i) => (e.label ? `<li class="sc-elabel" data-edge="${i}">${escHtml(e.label)}</li>` : '')).join('');
  const titles = model.groups.map((g) => `<li class="sc-gtitle" data-group="${escAttr(g.id)}"${g.slot ? ` data-slot="${g.slot}"` : ''}>${escHtml(g.name)}</li>`).join('');
  const data = escAttr(JSON.stringify(payload(model, o)));
  const attrs = ` data-sc-dir="${o.dir}"${o.curved ? ' data-sc-style="curved"' : ''}${o.badges ? '' : ' data-sc-badges="off"'}`;
  const desc = describe(model);
  // The figure root holds the drawing's VIEWPORT and the key under it; the detail payload
  // rides after the figure, never inside it (a template inside would count as a mark).
  return `<div class="state-chart-figure" data-variant="default"${attrs} data-states="${model.states.length}" data-transitions="${model.edges.length}" data-sc-model="${data}">` +
    `<div class="sc-canvas">` +
    `<div class="state-chart-scale">` +
    `<div class="sc-harness">` +
    `<ol class="state-nodes">${tiles}</ol>` +
    (labels ? `<ul class="sc-elabels">${labels}</ul>` : '') +
    (titles ? `<ul class="sc-gtitles">${titles}</ul>` : '') +
    `</div>` +
    `<svg class="state-chart-edges" role="img" xmlns="http://www.w3.org/2000/svg">` +
    `<title>State chart</title>${desc ? `<desc>${escHtml(desc)}</desc>` : ''}</svg>` +
    `</div>` +
    `</div>` + buildKey(model, 'state-chart') +
    `</div>` + buildDetail(model);
}

/**
 * The `inline` variant: the machine as rows, each state with its transitions as chips
 * (the event, an arrow, the target's ordinal). Not a graph, so no pass draws it; `.state-chart-scale`
 * gives the fit something to letterbox.
 */
function renderInline(model, o) {
  // The machine's transitions as the facts read them: a line into a composite enters its
  // first state, and a line out of one leaves from each state inside it.
  const byParent = new Map(model.groups.map((g) => [g.id, g]));
  let lastGroup = null;
  const rows = model.states.map((s) => {
    const out = model.transitions.filter((t) => t.from === s.index);
    const chips = out.map((t) => {
      const self = t.to === s.index && t.isSelf;
      const dir = self ? 'self' : t.to > s.index ? 'forward' : 'back';
      const evt = t.event ? `<span class="state-chip-event">${escHtml(t.event)}</span>` : '';
      // The arrow is a drawn shape (HARD RULE #29), never a typed glyph.
      const dest = `<span class="state-chip-mark" aria-hidden="true"></span>${self ? '' : `<span class="state-chip-to">${t.to}</span>`}`;
      const said = self ? 'to itself' : `to state ${t.to}`;
      return `<span class="state-chip" data-dir="${dir}">${evt}<span class="state-chip-arrow" role="img" aria-label="${said}">${dest}</span></span>`;
    }).join('');
    // A composite's title heads the first of its states, once.
    const group = s.parent ? byParent.get(s.parent) : null;
    const head = group && group !== lastGroup ? `<li class="state-group-row" role="presentation"><span class="state-group-name">${escHtml(group.name)}</span></li>` : '';
    lastGroup = group;
    return head + `<li class="state-node-row"${stateAttrs(s)}${markAttrs(s)}>` +
      `<span class="state-label">${escHtml(s.name)}</span>${badge(s)}` +
      (chips ? `<span class="state-transitions">${chips}</span>` : '') + '</li>';
  }).join('');
  return `<div class="state-chart-figure" data-variant="inline" data-sc-dir="${o.dir}" data-states="${model.states.length}" data-transitions="${model.transitions.length}">` +
    `<div class="state-chart-scale"><ol class="state-rows">${rows}</ol></div></div>` +
    // The key follows the figure here: the rows are letterboxed into the figure's whole box.
    buildKey(model, 'state-chart') + buildDetail(model);
}

/**
 * Build the figure. `tokens` is the slide's class list. A portrait deck turns an `lr` pin
 * to `tb`: a row of states cannot fit a tall box, and a static PDF cannot scroll.
 */
function buildStateChart(model, tokens, orientation) {
  const t = Array.isArray(tokens) ? tokens : typeof tokens === 'string' ? [tokens] : [];
  const inline = t.includes('inline') || t.includes('horizontal');
  let dir = t.includes('lr') || t.includes('horizontal') ? 'lr' : t.includes('tb') ? 'tb' : 'auto';
  if (orientation === 'portrait' && dir === 'lr') dir = 'tb';
  const o = { dir, curved: t.includes('curved'), badges: !t.includes('unnumbered') };
  return inline ? renderInline(model, { ...o, dir: dir === 'lr' ? 'lr' : 'tb' }) : buildDefault(model, o);
}

/**
 * The chart-family entrypoint (the `kernel` block in state-chart.manifest.json). Reads the
 * first list after the heading, and the bracketed key paragraph right after it, which the
 * figure's key replaces. The caption paragraph is left for the family's caption lift.
 */
function transformSection(html, ctx) {
  const h2 = /<h2[^>]*>[\s\S]*?<\/h2>/.exec(html);
  const from = h2 ? h2.index + h2[0].length : 0;
  const tail = html.slice(from);
  const o = outlineFromHtml(tail);
  if (!o.items.length || o.start < 0) return html;
  const model = parseStateChart(o);
  if (!model.states.length) return html;
  const figure = buildStateChart(model, ctx?.classTokens, ctx?.orientation);
  return html.slice(0, from) + tail.slice(0, o.start) + figure + tail.slice(o.keyEnd);
}

module.exports = { transformSection, parseStateChart, buildStateChart, payload, describe, STATE_CHART_VARIANTS };
