/**
 * Does this deck actually need a layout engine?
 *
 * WHY THIS EXISTS. The state-chart's browser pass reaches dagre through
 * `globalThis.__latticeDagre`, and the CLI export path installs that global by
 * prepending a 62.2 KiB IIFE to the serialised pass (lattice-emulator.js). That
 * was gated on the COMPONENT being present — `state-chart-figure` appearing in
 * any slide — so every deck carrying a state chart shipped the engine, while
 * dagre's answer is only ever USED on a machine that BRANCHES. Zero of the 9 drawn
 * machines in the shipped galleries branch, so every one of them paid 62.2 KiB
 * raw / 21.8 KiB gzipped for a layout that was discarded.
 *
 * WHAT MAKES AN EXACT ANSWER POSSIBLE IN NODE. The adoption test is "do two
 * wired, non-final nodes land in one rank", and dagre's RANK ASSIGNMENT is
 * topology-only: node width/height feed the WITHIN-rank positions and the gaps,
 * never which rank a node gets, and `positionY` gives every node in a layer the
 * same coordinate regardless of its own height. So this module runs the real
 * dagre — not a re-implementation of its ranker — over the real topology with
 * unit node boxes, and gets the same partition the browser will get with
 * measured ones. Nothing here estimates or approximates a text metric, because
 * nothing here needs one.
 *
 * TWO PRODUCERS, AND THE ARM THAT BINDS THEM. The predicate below is a second
 * statement of the one inside `dagrePositions` — the pass is serialised through
 * `.toString()`, so it carries no imports and cannot call this module, and this
 * module cannot call into the closure. The bind is behavioral rather than
 * structural: `test/unit/components/state-chart.test.js` drives the REAL pass
 * and this gate over one shared corpus of machines and asserts they agree
 * figure for figure. A divergence in either direction fails there.
 *
 * WHICH DIRECTION IS SAFE. A false POSITIVE ships an engine that goes unused —
 * 21.8 KiB gzipped, invisible. A false NEGATIVE silently drops a branching
 * machine back to the numbered column, with no error anywhere. So every
 * unrecognised shape, parse failure and missing dagre answers TRUE.
 *
 * NODE ONLY. `dagre-d3-es` is required lazily inside the call. This module must
 * never be reachable from `lib/runtime` or the docs bundles: a top-level import
 * there re-inlines dagre into every browser bundle, which is the cost this file
 * exists to remove.
 */

/**
 * The adoption predicate, on a topology — the same question `dagrePositions`
 * asks after it has measured the boxes.
 *
 * @param {object} spec
 * @param {Array<{index:number,isTerminal?:boolean}>} spec.nodes  authored states, in index order
 * @param {Array<{from:number,to:number,isSelf?:boolean}>} spec.transitions  authored transitions
 * @param {'lr'|'tb'} spec.dir  rank direction
 * @returns {boolean} true when dagre would re-rank this machine
 */
function machineBranches({ nodes, transitions, dir }) {
  let dagre, Graph;
  try {
    // eslint-disable-next-line global-require
    dagre = require('dagre-d3-es/src/dagre/index.js');
    ({ Graph } = require('dagre-d3-es/src/graphlib/index.js'));
  } catch (_e) {
    return true;   // unresolvable engine — ship it and let the pass decide
  }

  // Work on copies: the synthetic exit below appends to both lists, and the
  // caller's model is read again by the figure that follows.
  const ns = nodes.map((n) => ({ index: n.index, isTerminal: !!n.isTerminal }));
  const ts = transitions.map((t) => ({ from: t.from, to: t.to, isSelf: !!t.isSelf }));

  // The SINGLE EXIT, built exactly as draw() builds it: one final pseudo-state
  // after the highest index, with every terminal or sink converging into it.
  // It is handed to dagre like any other node — leaving it out changes the
  // ranking of everything that converges on it.
  const hasOut = new Set(ts.map((t) => t.from));
  const terminals = ns.filter((n) => n.isTerminal || !hasOut.has(n.index));
  if (terminals.length) {
    const fi = ns.reduce((a, b) => (b.index > a.index ? b : a)).index + 1;
    ns.push({ index: fi, isFinal: true });
    for (const t of terminals) ts.push({ from: t.index, to: fi, isSelf: false });
  }
  if (ns.length < 3) return false;   // `dagrePositions` returns null below this

  try {
    const g = new Graph({ multigraph: true, compound: true });
    // The gaps are deliberately NOT the pass's measured ones. They cannot change
    // the rank partition, and generous round numbers keep `Math.round` below from
    // ever collapsing two adjacent ranks onto one integer.
    g.setGraph({
      rankdir: dir === 'lr' ? 'LR' : 'TB', nodesep: 50, ranksep: 50, marginx: 0, marginy: 0,
    });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of ns) g.setNode(String(n.index), { width: 10, height: 10 });
    let e = 0;
    for (const t of ts) {
      // Self-loops are not handed to dagre (it does not route them, and a
      // self-edge perturbs the ranking), matching the pass.
      if (t.isSelf || t.from === t.to) continue;
      if (!g.hasNode(String(t.from)) || !g.hasNode(String(t.to))) continue;
      g.setEdge(String(t.from), String(t.to), { width: 0, height: 0 }, 'e' + (e++));
    }
    dagre.layout(g);

    // Two exclusions, both of which were bugs in the pass first: the SYNTHETIC
    // EXIT (a sink every terminal converges on, so counting it makes any machine
    // with two endings look like a join) and DISCONNECTED nodes (dagre parks
    // every one of them in rank 0). Edges INTO the exit do not count as wiring
    // either — by this point every terminal has one, so on a states-only chart
    // every node would look wired.
    const byIndex = new Map(ns.map((n) => [n.index, n]));
    const wired = new Set();
    for (const t of ts) {
      if (t.isSelf || t.from === t.to) continue;
      if (byIndex.get(t.to)?.isFinal) continue;
      wired.add(t.from); wired.add(t.to);
    }
    const along = (v) => (dir === 'lr' ? v.x : v.y);
    const ranks = Object.create(null);
    for (const n of ns) {
      if (n.isFinal || !wired.has(n.index)) continue;
      const v = g.node(String(n.index));
      if (!v) return true;
      const key = Math.round(along(v));
      if (ranks[key]) return true;
      ranks[key] = 1;
    }
    return false;
  } catch (_e) {
    return true;   // any internal failure answers the safe way
  }
}

/**
 * Split rendered HTML into one chunk per `.state-chart-figure`.
 *
 * Figures do not nest, so the span from one opening tag to the next is exactly
 * that figure's body — which is all the node `<li>`s live in. Reading our OWN
 * emitted markup is what makes this regex acceptable where a general HTML regex
 * would not be; `buildDefault` in state-chart.transform.js is the one producer
 * of the tag this matches, and the agreement arm renders real decks through it.
 */
function figureChunks(html) {
  const out = [];
  const re = /<div class="state-chart-figure"([^>]*)>/g;
  let m, prev = null;
  while ((m = re.exec(html))) {
    if (prev) out.push({ attrs: prev.attrs, body: html.slice(prev.end, m.index) });
    prev = { attrs: m[1], end: re.lastIndex };
  }
  if (prev) out.push({ attrs: prev.attrs, body: html.slice(prev.end) });
  return out;
}

const readAttr = (s, name) => (s.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];

// `escAttr` in the transform escapes exactly these five, so this reverses it.
// `&amp;` goes LAST or it would re-expand the entities the others just produced.
const unescAttr = (s) => String(s)
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

/** One figure, read back off its own rendered markup. */
function figureNeedsDagre({ attrs, body }) {
  const raw = readAttr(attrs, 'data-sc-transitions');
  // The `inline` variant renders chips, has no SVG overlay and is never drawn by
  // the pass at all — `draw()` returns immediately without this attribute.
  if (raw == null) return false;
  let transitions;
  try { transitions = JSON.parse(unescAttr(raw)); } catch (_e) { return true; }
  if (!Array.isArray(transitions)) return true;

  const states = Number(readAttr(attrs, 'data-states') || 0);
  const dir = readAttr(attrs, 'data-sc-dir') === 'lr' ? 'lr' : 'tb';
  const nodes = [];
  const li = /<li class="state-node" data-index="(\d+)"([^>]*)>/g;
  let m;
  while ((m = li.exec(body))) {
    nodes.push({ index: Number(m[1]), isTerminal: /data-kind="terminal"/.test(m[2]) });
  }
  // The figure declares its own state count; a mismatch means this reader did
  // not understand the markup, so it does not get to say "no engine needed".
  if (!nodes.length || nodes.length !== states) return true;

  return machineBranches({ nodes, transitions, dir });
}

/**
 * True when any state chart in this rendered HTML would be re-ranked by dagre —
 * i.e. when the export owes the engine.
 *
 * @param {string|string[]} html  a rendered slide, or the slide array
 */
function htmlNeedsDagre(html) {
  const src = Array.isArray(html) ? html.join('\n') : String(html || '');
  if (!src.includes('state-chart-figure')) return false;
  return figureChunks(src).some(figureNeedsDagre);
}

module.exports = { htmlNeedsDagre, figureNeedsDagre, figureChunks, machineBranches };
