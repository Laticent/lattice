/** The hub-spoke chart's reader (lib/runtime/chart-redraw.js). */

const { esc, textOf, uncarried, shortened, noteFor } = require('./shared');
// The kernel's own reading of a slide and its own sentence for it: the reader proves its list by
// describing it the way the kernel does and comparing with the exported description.
const HS = require('../../core/hub-spoke-model');
const { describe } = HS; // the kernel's own <desc> words (lib/core/hub-spoke-model.js)

// `esc` writes `'` as `&#39;`; markdown-it leaves it bare. A bare `'` in element text is inert, so
// matching markdown-it keeps a redraw byte-identical and stays HARD RULE #22-safe.
const escText = (s) => esc(s).replace(/&#39;/g, "'");

const DIRS = ['', 'out', 'in', 'both'];

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
    group: '',
    dir: '',
    icon: icon ? icon.getAttribute('data-icon') || '' : '',
    iconOnly: !!icon && icon.hasAttribute('data-icon-only'),
    mark,
    children: [],
  };
}

/** The tree the kernel's model reads: plain labels and plain pills. */
const treeOf = (hub) => [{
  label: hub.label,
  pills: pillsOf(hub),
  children: hub.children.map((s) => ({
    label: s.label, pills: pillsOf(s), detail: '',
    children: s.children.map((l) => ({ label: l.label, pills: pillsOf(l), children: [], detail: '' })),
  })),
}];

const said = (hub, tokens) => {
  const model = HS.buildModel(treeOf(hub), tokens);
  return model ? describe(model) : '';
};

/** How many leading characters two strings share. */
function shared(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i;
}

/**
 * HUB-SPOKE. One hub disc (`path.hub-spoke-hub`) and a disc per satellite (`data-mark`), each with its
 * name, value and status (`data-s`) on it; an icon rides on `g.hub-spoke-icon`. Under `tiered`, marks
 * run in reading order: a branch, then its leaves. A flat satellite's group is its connector's hue,
 * named by the key.
 *
 * A spoke's direction is the one field no disc carries: the arrowheads have no mark. The exported
 * description says it ("Returns center, 400, flowing in"), so the reader picks, spoke by spoke, the
 * direction that lets the kernel's own `describe` say the same, and refuses the chart unless the whole
 * description matches. That check also catches what the marks drop: a group past the six-hue cap, a
 * group on a tiered item, anything else the kernel says but does not draw.
 */
function readHubSpoke(body) {
  if (uncarried(body)) return null;
  const hubNode = body.querySelector('path.hub-spoke-hub');
  const descEl = body.querySelector('svg.hub-spoke-svg > desc');
  if (!hubNode || !descEl) return null;
  const desc = descEl.textContent;
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
  if (all.some((it) => shortened(it.label))) return null;
  // A flat spoke's group: its connector (one per spoke, in order) wears the group's hue, and the key
  // names the hues in order. A status disc drops its hue, but its connector keeps it.
  if (!tiered) {
    const necks = [...body.querySelectorAll('path.hub-spoke-neck')];
    const names = [...body.querySelectorAll('.hub-spoke-key text.chart-key-label')].map(textOf);
    if (necks.length !== hub.children.length || names.some(shortened)) return null;
    for (const [i, s] of hub.children.entries()) {
      const hue = Number(necks[i].dataset.hue || 0);
      if (hue && !names[hue - 1]) return null;
      s.group = hue ? names[hue - 1] : '';
    }
  }
  // The slide-wide classes the description speaks for. The redraw passes the section's real classes
  // to the kernel; these only let `describe` be asked the same question.
  const tokens = ['hub-spoke'];
  if (tiered) tokens.push('tiered');
  const flow = / Flow runs (both ways|out from the hub|in to the hub)\./.exec(desc);
  if (flow) tokens.push(flow[1] === 'both ways' ? 'flow-both' : flow[1].startsWith('out') ? 'flow-out' : 'flow-in');
  if (/ Disc area shows each value\./.test(desc)) tokens.push('sized');
  // Each spoke's direction, in reading order: the one that lets the description match furthest.
  for (const it of all.slice(1)) {
    let best = '';
    let reach = -1;
    for (const d of DIRS) {
      it.dir = d;
      const n = shared(said(hub, tokens), desc);
      if (n > reach) { reach = n; best = d; }
    }
    it.dir = best;
  }
  if (said(hub, tokens) !== desc) return null;
  const pills = (it) => pillsOf(it).map((p) => ` <code>${escText(p)}</code>`).join('');
  const li = (it, inner) => `<li>${escText(it.label)}${pills(it)}${inner}</li>`;
  const spokes = hub.children.map((s) => (tiered
    ? li(s, s.children.length ? `<ul>${s.children.map((l) => li(l, noteFor(body, l.mark))).join('')}</ul>` : '')
    : li(s, noteFor(body, s.mark))));
  return `<ul>${li(hub, `<ul>${spokes.join('')}</ul>`)}</ul>`;
}

module.exports = { kind: 'hub-spoke', read: readHubSpoke };
