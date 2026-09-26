/**
 * flowchart — the server half of a free-form flowchart (shapes, groups, lines).
 *
 * The grammar is `lib/core/flowchart-grammar.js` (decision note
 * engineering/decisions/2026-09-25-flowchart-authoring.md §2): this file reads the
 * slide's RENDERED list with that kernel's HTML reader, so the chart parses exactly
 * what `lint:deck` parsed from the Markdown.
 *
 * WHAT IT EMITS. A layout needs every shape's measured box, and a string transform
 * cannot measure text, so this half writes a MEASURING HARNESS (each shape, line
 * label, group title and note as an HTML box the browser sizes in the deck's own
 * fonts), an empty `<svg>` with the chart's accessible name, and the parsed model
 * as `data-fc-model`. The browser half (`flowchart.layout.js`) measures the
 * harness, lays the chart out with the shared router
 * (`_chart-family/graph-layout.js`) and paints it into the SVG — the state chart's
 * delivery model, and for the same reason. Until that pass runs, or where it never
 * can, the harness is what shows: every shape as a tile, grouped, in authored order.
 *
 * UNTRUSTED TEXT. Every name, label, note and key word is escaped here; the model
 * payload is JSON in an escaped attribute. Nothing an author types becomes markup
 * (§8 of the note).
 */
const { parseFlowchart, outlineFromHtml } = require('../../../core/flowchart-grammar');
const { escAttr, escHtml } = require('../_chart-family/transform-utils');

// The status word -> tone table, for the key. The browser pass does not need it (the
// stylesheet's status table paints the tile), so this is the only copy in JS.
const STATUS_TONE = {
  'on-track': 'pass', done: 'pass',
  live: 'info', pilot: 'info', decision: 'info',
  'at-risk': 'warn', warn: 'warn',
  blocked: 'fail', fail: 'fail',
  deferred: 'mute',
};

// Data attributes a shape carries, from its parsed style. Shared by the harness tile
// and (through the model) the painted shape, so the two read one set of facts.
function shapeAttrs(s) {
  let a = ` data-id="${escAttr(s.id)}" data-shape="${escAttr(s.shape || 'box')}"`;
  if (s.status) a += ` data-s="${escAttr(s.status)}"`;
  if (s.slot) a += ` data-slot="${s.slot}"`;
  for (const ch of ['fill', 'border', 'text']) if (s[ch]) a += ` data-${ch}="${s[ch]}"`;
  return a;
}

/** One key entry's swatch: the mark it decodes, drawn in CSS from data attributes. */
function keySwatch(entry, model) {
  const k = entry.key;
  // A line swatch is a short run of the line itself, so its weight and dash are the
  // chart's own rather than a CSS border's approximation of them.
  const line = (attrs) => `<svg class="fc-key-swatch" data-kind="line" viewBox="0 0 20 10" aria-hidden="true"><path class="fc-key-line"${attrs} d="M1 5H19"/></svg>`;
  if (k === '=>' || k === '->') return line(k === '=>' ? ' data-heavy="1"' : '');
  if (k === ':dashed' || k === ':dotted') return line(` data-pattern="${k.slice(1)}"`);
  // A head swatch is a short line ending in that head, drawn (HARD RULE #29), never typed.
  if (k === ':open' || k === ':dot' || k === ':cross') {
    const heads = {
      open: '<path class="fc-key-head" d="M8 1.5L12 5L8 8.5"/>',
      dot: '<circle class="fc-key-head" data-fill="1" cx="11" cy="5" r="2.4"/>',
      cross: '<path class="fc-key-head" d="M8.5 2L13 8M13 2L8.5 8"/>',
    };
    return `<svg class="fc-key-swatch" data-kind="head" viewBox="0 0 14 10" aria-hidden="true"><path class="fc-key-head" d="M0.5 5H${k === ':dot' ? 9 : 11}"/>${heads[k.slice(1)]}</svg>`;
  }
  const slot = /^:c([1-8])$/.exec(k);
  if (slot) {
    const onGroup = model.groups.some((g) => g.slot === +slot[1]);
    return `<span class="fc-key-swatch" data-kind="${onGroup ? 'group' : 'tile'}" data-slot="${slot[1]}" aria-hidden="true"></span>`;
  }
  if (Object.hasOwn(STATUS_TONE, k)) return `<span class="fc-key-swatch" data-kind="tile" data-s="${escAttr(k)}" aria-hidden="true"></span>`;
  return '';
}

function buildKey(model) {
  if (!model.key?.length) return '';
  const items = model.key.map((e) =>
    `<li class="fc-key-item">${keySwatch(e, model)}<span class="fc-key-label">${escHtml(e.label)}</span></li>`).join('');
  return `<ol class="fc-key">${items}</ol>`;
}

/**
 * The chart's accessible description: what a screen reader hears in place of the
 * drawing. Groups with their members, then every connection with its label. Plain
 * words; the narrator (slice 4) will say it better.
 */
function describe(model) {
  const name = (id) => (model.shapes.find((s) => s.id === id) || model.groups.find((g) => g.id === id) || { name: id }).name;
  const parts = [];
  for (const g of model.groups) {
    const members = model.shapes.filter((s) => s.parent === g.id).map((s) => s.name);
    parts.push(`${g.name}: ${members.join(', ') || 'empty'}.`);
  }
  for (const e of model.edges) {
    const verb = e.dir === 'both' ? 'and' : e.dir === 'none' ? 'with' : 'to';
    const [a, b] = e.dir === 'in' ? [e.to, e.from] : [e.from, e.to];
    parts.push(`${name(a)} ${verb} ${name(b)}${e.label ? `, ${e.label}` : ''}.`);
  }
  const lone = model.shapes.filter((s) => !s.parent && !model.edges.some((e) => e.from === s.id || e.to === s.id));
  if (lone.length) parts.push(`Also: ${lone.map((s) => s.name).join(', ')}.`);
  return parts.join(' ');
}

/** The model the browser pass needs: the grammar's output, minus diagnostics. */
function payload(model) {
  return {
    shapes: model.shapes.map((s) => {
      const o = { id: s.id, name: s.name, parent: s.parent || null, shape: s.shape || 'box' };
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
    notes: (model.notes || []).map((n) => ({ on: n.on, text: n.text })),
  };
}

/**
 * Build the figure. `tokens` is the slide's class list: `lr` / `tb` pin the
 * direction (otherwise the pass picks whichever sets the type largest), `compact`
 * tightens the spacing.
 */
function buildFlowchart(model, tokens, orientation) {
  const t = Array.isArray(tokens) ? tokens : [];
  const portrait = orientation === 'portrait';
  let dir = t.includes('lr') ? 'lr' : t.includes('tb') ? 'tb' : 'auto';
  // A left-to-right chart cannot fit a tall box; the state chart flips for the same reason.
  if (portrait && dir === 'lr') dir = 'tb';
  const nodes = model.shapes.map((s, i) =>
    `<li class="fc-node"${shapeAttrs(s)} data-mark="${i}" data-label="${escAttr(s.name)}"><span class="fc-name">${escHtml(s.name)}</span></li>`).join('');
  const labels = model.edges.map((e, i) => (e.label ? `<li class="fc-elabel" data-edge="${i}">${escHtml(e.label)}</li>` : '')).join('');
  const titles = model.groups.map((g) => `<li class="fc-gtitle" data-group="${escAttr(g.id)}"${g.slot ? ` data-slot="${g.slot}"` : ''}>${escHtml(g.name)}</li>`).join('');
  const notes = (model.notes || []).map((n, i) => `<li class="fc-note" data-note="${i}">${escHtml(n.text)}</li>`).join('');
  const data = escAttr(JSON.stringify(payload(model)));
  const compact = t.includes('compact') ? ' data-fc-spacing="compact"' : '';
  // The figure root holds the drawing's VIEWPORT and the key under it, so the key stays
  // inside the chart body and the family's caption follows both.
  return `<div class="flowchart-figure" data-fc-dir="${dir}"${compact} data-shapes="${model.shapes.length}" data-edges="${model.edges.length}" data-fc-model="${data}">` +
    `<div class="fc-canvas">` +
    `<div class="flowchart-scale">` +
    `<div class="fc-harness">` +
    `<ol class="fc-nodes">${nodes}</ol>` +
    (labels ? `<ul class="fc-elabels">${labels}</ul>` : '') +
    (titles ? `<ul class="fc-gtitles">${titles}</ul>` : '') +
    (notes ? `<ul class="fc-notes">${notes}</ul>` : '') +
    `</div>` +
    `<svg class="flowchart-svg" role="img" xmlns="http://www.w3.org/2000/svg">` +
    `<title>Flowchart</title><desc>${escHtml(describe(model))}</desc></svg>` +
    `</div>` +
    `</div>` + buildKey(model) +
    `</div>`;
}

/**
 * The chart-family entrypoint (the `kernel` block in flowchart.manifest.json). Reads
 * the first list after the heading, and the bracketed key paragraph right after it,
 * which the figure's key replaces. The caption paragraph is left for the family's
 * caption lift.
 */
function transformSection(html, ctx) {
  const h2 = /<h2[^>]*>[\s\S]*?<\/h2>/.exec(html);
  const from = h2 ? h2.index + h2[0].length : 0;
  const tail = html.slice(from);
  const o = outlineFromHtml(tail);
  if (!o.items.length || o.start < 0) return html;
  const model = parseFlowchart(o.items, { key: o.key });
  if (!model.shapes.length) return html;
  const figure = buildFlowchart(model, ctx?.classTokens, ctx?.orientation);
  return html.slice(0, from) + tail.slice(0, o.start) + figure + tail.slice(o.keyEnd);
}

module.exports = { transformSection, buildFlowchart, payload, describe, STATUS_TONE };
