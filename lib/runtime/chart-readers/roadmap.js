/** The roadmap chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried } = require('./shared');
// The kernel's default word per state, from the same catalog row the kernel reads (roadmap.transform.js
// `STATE_LABEL`): a cell that prints any other word took it from the author's label set, which rides in a
// paragraph outside the table that the reader does not rebuild.
const { labelSetFor } = require('../../core/label-set');

// `esc` writes `'` as `&#39;`; markdown-it leaves it bare. A bare `'` in text or in a double-quoted
// attribute is inert, so matching markdown-it keeps a redraw byte-identical and stays HARD RULE #22-safe.
const escText = (s) => esc(s).replace(/&#39;/g, "'");

/** The marker an author types, per state class (roadmap.transform.js `STATE_MARKER`). */
const MARKER = {
  'state-shipped': '[x]', 'state-wip': '[-]', 'state-missed': '[!]',
  'state-unknown': '[?]', 'state-planned': '[ ]', 'state-skipped': '[/]',
};

/**
 * The attributes each table element may carry: the table reflow plugin's (lib/integrations/markdown-it/plugins.js: `data-lat-reflow`, `role`,
 * `data-lat-col`, `data-lat-align` for a `:---:` column, …), which ride into the kernel and back out unchanged. Anything else is not a table
 * this reader knows how to rebuild.
 */
const ATTRS = {
  TABLE: ['data-lat-reflow', 'class', 'role', 'data-lat-labels'],
  THEAD: [], TBODY: [],
  TR: ['role'],
  TH: ['role', 'data-lat-align', 'data-lat-col'],
  TD: ['role', 'data-lat-align', 'data-lat-col', 'class'],
};
/** The kernel's default word for a state class (roadmap's label set, keyed by the typed marker). */
function defaultWord(stateClass) {
  const member = (labelSetFor('roadmap')?.members || []).find((m) => m.key === MARKER[stateClass]);
  return member ? member.label : undefined;
}
const ALIGN = /^(left|center|right)$/;

class Refuse extends Error {}
const refuse = () => { throw new Refuse(); };

/** An element's opening tag, every attribute checked against the list and re-escaped. */
function openTag(el, skip = []) {
  const allowed = ATTRS[el.tagName] || refuse();
  let out = `<${el.tagName.toLowerCase()}`;
  for (const { name, value } of el.attributes) {
    if (!allowed.includes(name)) refuse();
    if (name === 'data-lat-align' && !ALIGN.test(value)) refuse();
    if (skip.includes(name)) continue;
    out += ` ${name}="${escText(value)}"`;
  }
  return `${out}>`;
}

/** Text only, or refuse: a cell with markup inside would need its markup re-serialized. */
function textOnly(el) {
  if (el.children.length) refuse();
  return escText(el.textContent);
}

/** A header cell: words, and optionally one pill the pills plugin drew (`Foundation {Q2 2026}`). */
function headerCell(th) {
  let inner = '';
  for (const n of th.childNodes) {
    if (n.nodeType === 3) { inner += escText(n.textContent); continue; }
    const shape = n.getAttribute?.('data-shape');
    const plain = n.tagName === 'SPAN' && n.getAttribute('class') === 'lat-pill' && n.attributes.length === 2 && shape;
    if (!plain) refuse();
    inner += `<span class="lat-pill" data-shape="${escText(shape)}">${textOnly(n)}</span>`;
  }
  return `${openTag(th)}${inner}</th>`;
}

/**
 * A body cell. The kernel turned `[x] Connector v1` into a `cell-state state-shipped` cell holding the
 * state's word and the text; this puts the marker back.
 */
function bodyCell(td) {
  const cls = td.getAttribute('class');
  if (cls == null) return `${openTag(td)}${textOnly(td)}</td>`;
  const m = /^cell-state (state-[a-z]+)$/.exec(cls);
  if (!m || !MARKER[m[1]]) refuse();
  const [label, text, ...rest] = td.children;
  if (rest.length || td.childNodes.length !== 2) refuse();
  if (label?.className !== 'cell-state-label' || text?.className !== 'cell-state-text') refuse();
  if (label.textContent !== defaultWord(m[1])) refuse(); // an authored state word
  return `${openTag(td, ['class'])}${MARKER[m[1]]} ${textOnly(text)}</td>`;
}

/** Any node of the table, rebuilt from text and checked attributes, whitespace kept as it was. */
function rebuild(node) {
  if (node.nodeType === 3) {
    if (node.textContent.trim()) refuse(); // only the newlines markdown-it puts between tags
    return node.textContent;
  }
  if (node.nodeType !== 1) refuse();
  if (node.tagName === 'TH') return headerCell(node);
  if (node.tagName === 'TD') return bodyCell(node);
  return `${openTag(node)}${[...node.childNodes].map(rebuild).join('')}</${node.tagName.toLowerCase()}>`;
}

/**
 * ROADMAP. Its source is a markdown table, and the table form keeps it nearly whole: the kernel only
 * tags each state cell (its marker becomes a class and a word). The reader rebuilds that table, refusing
 * any cell with markup in it, since the reader writes back only text it escaped.
 *
 * The `horizons` card form is refused: it drops the workstream column's header, and it draws the
 * same cards in every box, so there is nothing a redraw would change. On a portrait box the kernel
 * picks `horizons` itself and returns it as a CLASS (`out.cls`) as well as the cards.
 */
function readRoadmap(body) {
  if (uncarried(body)) return null;
  const figure = body.querySelector(':scope > .roadmap-figure');
  const table = figure?.querySelector(':scope > table');
  if (!table) return null;
  // The figure holds the table and the kernel's own key, nothing else.
  for (const el of figure.children) if (el !== table && !el.classList.contains('roadmap-legend')) return null;
  if (body.children.length !== 1) return null;
  try {
    return rebuild(table);
  } catch (e) {
    if (e instanceof Refuse) return null;
    throw e;
  }
}

module.exports = { kind: 'roadmap', read: readRoadmap };
