/** The hub-spoke chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, noteFor } = require('./shared');

// `esc` writes `'` as `&#39;`; markdown-it leaves it bare. A bare `'` in element text is inert, so
// matching markdown-it keeps a redraw byte-identical and stays HARD RULE #22-safe.
const escText = (s) => esc(s).replace(/&#39;/g, "'");

const DIRS = new Set(['', 'out', 'in', 'both']);

/** An item's pills as plain text, in the order the grammar reads them (any order works). */
function pillsOf(it) {
  const pills = [];
  if (it.value) pills.push(it.value);
  if (it.status) pills.push(it.status);
  if (it.group) pills.push(it.group);
  if (it.dir) pills.push(`flow:${it.dir}`);
  if (it.icon) pills.push(`{icon=${it.icon}${it.iconOnly ? ', icon-only' : ''}}`);
  return pills;
}

/** One mark's item: name, value, status and icon, all as the kernel wrote them. */
function itemOf(body, node, mark) {
  const icon = mark == null
    ? body.querySelector('g.hub-spoke-icon[data-hub]')
    : body.querySelector(`g.hub-spoke-icon[data-mark-for="${mark}"]`);
  return {
    label: node.dataset.label || '',
    value: node.dataset.value || '',
    status: node.dataset.s || '',
    group: node.dataset.group || '',
    dir: node.dataset.dir || '',
    icon: icon ? icon.getAttribute('data-icon') || '' : '',
    iconOnly: !!icon && icon.hasAttribute('data-icon-only'),
    mark,
    children: [],
  };
}

/**
 * HUB-SPOKE. One hub disc (`path.hub-spoke-hub`) and a disc per satellite (`data-mark`), each with its
 * name, value, status (`data-s`), group (`data-group`) and direction (`data-dir`) as written; an icon rides
 * on `g.hub-spoke-icon`. Under `tiered`, marks run in reading order: a branch, then its leaves. The
 * slide-wide classes (`tiered`, `sized`, `flow-*`) ride on the section, which the redraw passes on.
 */
function readHubSpoke(body) {
  if (uncarried(body)) return null;
  const hubNode = body.querySelector('path.hub-spoke-hub');
  if (!hubNode) return null;
  const nodes = [...body.querySelectorAll('path.hub-spoke-node[data-mark], path.hub-spoke-leaf[data-mark]')];
  if (!nodes.length) return null;
  // Marks run 0..n-1 in reading order. A gap is an item the drawing does not carry.
  nodes.sort((a, b) => Number(a.dataset.mark) - Number(b.dataset.mark));
  if (nodes.some((n, k) => Number(n.dataset.mark) !== k)) return null;
  const tiered = nodes.some((n) => n.classList.contains('hub-spoke-branch'));
  const hub = itemOf(body, hubNode, null);
  for (const n of nodes) {
    const it = itemOf(body, n, Number(n.dataset.mark));
    if (n.classList.contains('hub-spoke-leaf')) {
      const branch = hub.children[hub.children.length - 1];
      if (!tiered || !branch) return null; // a leaf before any branch is not this kernel's order
      branch.children.push(it);
    } else {
      hub.children.push(it);
    }
  }
  const all = [hub, ...hub.children, ...hub.children.flatMap((s) => s.children)];
  // A direction the grammar does not know is not this kernel's drawing.
  if (all.some((it) => !DIRS.has(it.dir))) return null;
  const pills = (it) => pillsOf(it).map((p) => ` <code>${escText(p)}</code>`).join('');
  const li = (it, inner) => `<li>${escText(it.label)}${pills(it)}${inner}</li>`;
  const spokes = hub.children.map((s) => (tiered
    ? li(s, s.children.length ? `<ul>${s.children.map((l) => li(l, noteFor(body, l.mark))).join('')}</ul>` : '')
    : li(s, noteFor(body, s.mark))));
  return `<ul>${li(hub, `<ul>${spokes.join('')}</ul>`)}</ul>`;
}

module.exports = { kind: 'hub-spoke', read: readHubSpoke };
