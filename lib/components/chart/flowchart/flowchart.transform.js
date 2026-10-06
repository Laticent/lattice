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
 * label and group title as an HTML box the browser sizes in the deck's own
 * fonts), an empty `<svg>` with the chart's accessible name, and the parsed model
 * as `data-fc-model`. The browser half (`flowchart.layout.js`) measures the
 * harness, lays the chart out with Trama's kernel
 * (`@laticent/trama`, docs/src/lib/trama) and paints it into the SVG — the state chart's
 * delivery model, and for the same reason. Until that pass runs, or where it never
 * can, the harness is what shows: every shape as a tile, grouped, in authored order.
 *
 * UNTRUSTED TEXT. Every name, label, note and key word is escaped here; the model
 * payload is JSON in an escaped attribute. Nothing an author types becomes markup
 * (§8 of the note).
 */
const { parseFlowchart, shapeNotes } = require('../../../core/flowchart-grammar');
const { outlineFromHtml } = require('../../../core/flowchart-html');
const { escAttr, escHtml } = require('../_chart-family/transform-utils');
const { STATUS_TONE, buildKey } = require('../_chart-family/graph-key');
const markDetail = require('../_chart-family/mark-detail');
const { nodeIcons } = require('../_chart-family/graph-icons');

// Data attributes a shape carries, from its parsed style. Shared by the harness tile
// and (through the model) the painted shape, so the two read one set of facts.
function shapeAttrs(s) {
  let a = ` data-id="${escAttr(s.id)}" data-shape="${escAttr(s.shape || 'box')}"`;
  if (s.status) a += ` data-s="${escAttr(s.status)}"`;
  if (s.slot) a += ` data-slot="${s.slot}"`;
  for (const ch of ['fill', 'border', 'text']) if (s[ch]) a += ` data-${ch}="${s[ch]}"`;
  return a;
}

/**
 * The mark-contract attributes (slot-contract.md) for a node painted from its author CATEGORY:
 * `data-hue` is the same 1-based slot `data-slot` names. A node whose paint comes from a STATUS
 * or an explicit `fill` is not one of the eight categorical hues, so it carries none — absence
 * is the honest signal (chart-family.styles.css, "THE MARK CONTRACT"). `paint` is `fill` for the SVG
 * shape and `bg` for the HTML node.
 */
function hueContract(s, paint) {
  if (!s.slot || s.status || s.fill) return '';
  return ` data-hue="${s.slot}" data-encodes="hue" data-paint="${paint}"`;
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

/** The model the browser pass needs: the grammar's output, minus diagnostics. `icons` is the
 * drawn icon per shape id (graph-icons.js): a shape whose icon nobody could draw carries none. */
function payload(model, icons = new Map()) {
  return {
    shapes: model.shapes.map((s) => {
      const o = { id: s.id, name: s.name, parent: s.parent || null, shape: s.shape || 'box' };
      for (const k of ['status', 'slot', 'fill', 'border', 'text']) if (s[k]) o[k] = s[k];
      const ic = icons.get(s.id);
      if (ic) { o.icon = ic.name; if (ic.only) o.iconOnly = true; }
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
  };
}

/**
 * A blockquote under a shape is its HIDDEN DETAIL, the house style both graph charts share
 * (engineering/decisions/2026-09-27-trama-graph-chart-library.md §5): the slide never shows
 * it; the reveal layer shows it when the shape is hovered or tapped in Present, Practice and
 * Preview, and it is folded into the speaker notes. It rides the chart family's detail
 * substrate (mark-detail.js): one `<template class="chart-detail" data-mark="i">` per shape
 * with detail, `i` being the shape's `data-mark`. Author text, so escaped.
 */
function shapeMarks(model) {
  const byShape = shapeNotes(model);
  return model.shapes.map((s) => {
    const notes = (byShape.get(s.id) || []).map((t) => `<li>${escHtml(t)}</li>`).join('');
    return { label: s.name, valueRaw: s.status || '', detail: notes };
  });
}

/**
 * Build the figure. `tokens` is the slide's class list: `lr` / `tb` pin the
 * direction (otherwise the pass picks whichever sets the type largest), `compact`
 * tightens the spacing, `curved` rounds the lines' corners generously.
 */
function buildFlowchart(model, tokens, orientation, off = null) {
  const t = Array.isArray(tokens) ? tokens : [];
  const portrait = orientation === 'portrait';
  let dir = t.includes('lr') ? 'lr' : t.includes('tb') ? 'tb' : 'auto';
  // A left-to-right chart cannot fit a tall box; the state chart flips for the same reason.
  if (portrait && dir === 'lr') dir = 'tb';
  const icons = nodeIcons(model.shapes, 'fc-icon-svg', off);
  const nodes = model.shapes.map((s, i) => {
    const ic = icons.get(s.id);
    return `<li class="fc-node"${shapeAttrs(s)}${hueContract(s, 'bg')}${ic ? ic.attrs : ''} data-mark="${i}" data-label="${escAttr(s.name)}">${ic ? ic.html : ''}<span class="fc-name">${escHtml(s.name)}</span></li>`;
  }).join('');
  const labels = model.edges.map((e, i) => (e.label ? `<li class="fc-elabel" data-edge="${i}">${escHtml(e.label)}</li>` : '')).join('');
  const titles = model.groups.map((g) => `<li class="fc-gtitle" data-group="${escAttr(g.id)}"${g.slot ? ` data-slot="${g.slot}"` : ''}>${escHtml(g.name)}</li>`).join('');
  const data = escAttr(JSON.stringify(payload(model, icons)));
  // `rearrange`: the layout may move a shape out of its written order when that crosses fewer
  // lines (Trama's `order: 'graph'`).
  const compact = (t.includes('compact') ? ' data-fc-spacing="compact"' : '') + (t.includes('curved') ? ' data-fc-style="curved"' : '') +
    (t.includes('rearrange') ? ' data-fc-order="graph"' : '');
  // The figure root holds the drawing's VIEWPORT and the key under it, so the key stays
  // inside the chart body and the family's caption follows both.
  return `<div class="flowchart-figure" data-fc-dir="${dir}"${compact} data-shapes="${model.shapes.length}" data-edges="${model.edges.length}" data-fc-model="${data}">` +
    `<div class="fc-canvas">` +
    `<div class="flowchart-scale">` +
    `<div class="fc-harness">` +
    `<ol class="fc-nodes">${nodes}</ol>` +
    (labels ? `<ul class="fc-elabels">${labels}</ul>` : '') +
    (titles ? `<ul class="fc-gtitles">${titles}</ul>` : '') +
    `</div>` +
    `<svg class="flowchart-svg" role="img" xmlns="http://www.w3.org/2000/svg">` +
    `<title>Flowchart</title><desc>${escHtml(describe(model))}</desc></svg>` +
    `</div>` +
    `</div>` + buildKey(model) +
    `</div>`;
}

/** The detail payload and its speaker-note fold, after the figure (never inside it: the
 * reveal layer's chart root is the figure, and a template inside would count as a mark). */
function buildDetail(model) {
  const marks = shapeMarks(model);
  return markDetail.detailPayload(marks) + markDetail.detailNote(marks);
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
  const off = ctx?.pluginsOff || null;
  const model = parseFlowchart(o.items, { key: o.key, off });
  if (!model.shapes.length) return html;
  const figure = buildFlowchart(model, ctx?.classTokens, ctx?.orientation, off) + buildDetail(model);
  return html.slice(0, from) + tail.slice(0, o.start) + figure + tail.slice(o.keyEnd);
}

module.exports = {
  hueContract, transformSection, buildFlowchart, buildDetail, payload, describe, STATUS_TONE };
