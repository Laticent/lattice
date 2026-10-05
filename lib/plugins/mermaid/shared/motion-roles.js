/* Mermaid motion roles — tag a rendered Mermaid SVG so the chart motion layer can animate it.
 *
 * The chart motion layer (`chartToScene`, docs/src/lib/chart-anima.ts) builds an animation from
 * any SVG whose parts declare `data-anima-role`. Every Lattice chart kernel emits that attribute
 * natively. Mermaid does not, and we cannot make it: Mermaid draws the SVG. So this module reads
 * the parts Mermaid already names with classes (`g.node`, `g.cluster`, `path.pieCircle`, …) and
 * writes the two attributes the motion layer reads:
 *
 *   data-anima-role   what the part is — `bar` (a shape that builds in), `region` (a container
 *                     such as a subgraph box), `sector` (a pie slice; the disc reveals as one),
 *                     `point` (a dot), `label` (words; they arrive after the build).
 *   data-anima-order  a sort key: lower builds first, and equal keys keep document order.
 *                     Mermaid paints edges BEFORE nodes (edges sit under the boxes), so document
 *                     order would draw the arrows first and then drop the boxes onto them. The
 *                     key puts containers first, then the boxes, then the arrows between them,
 *                     without moving anything in the DOM (moving `g.edgePaths` after `g.nodes`
 *                     would paint arrows over the boxes).
 *
 * WHICH DIAGRAMS. Every family that lays out with Mermaid's shared graph renderer — flowchart,
 * state, class, ER, mindmap, requirement — is found by STRUCTURE (a `g.nodes` group), not by
 * name, so a new family on the same renderer animates with no change here. Seven more carry their
 * own renderer and are named: sequence, pie, gantt, xychart, quadrantChart, gitGraph, timeline.
 * Anything else gets no roles and stays a still picture, which is the correct fallback: the motion
 * layer only animates an SVG that declares at least one role.
 *
 * WHERE IT RUNS. Three callers, one function:
 *   - the live runtime (lib/runtime/index.js), right after it writes a rendered SVG, so the
 *     Playground, Studio and Present see a diagram with roles;
 *   - the Studio's HTML-player bake, which reads the runtime's DOM, so it inherits the roles;
 *   - the CLI's player capture (lattice-emulator.js), which serializes this function with
 *     `toString()` into a puppeteer page. That is why the function is CLOSURE-FREE: every helper
 *     lives inside it, and it references nothing from module scope.
 *
 * It only sets attributes. It writes no markup, so it is not an injection point (HARD RULE #22).
 * It is idempotent: a part that already carries a role is left alone.
 */

/**
 * Tag the parts of a rendered Mermaid SVG with `data-anima-role` (+ `data-anima-order`).
 *
 * @param {SVGSVGElement|Element} svg a Mermaid-rendered `<svg>`
 * @returns {number} how many parts were tagged (0 = a family we do not animate)
 */
function tagMermaidMotion(svg) {
  if (!svg || typeof svg.querySelectorAll !== 'function') return 0;
  let tagged = 0;

  // Tag every match of `sel` that is not already tagged and is not INSIDE a tagged part — a
  // nested part would be faded twice (its own opacity times its parent's).
  function tag(sel, role, order) {
    const els = svg.querySelectorAll(sel);
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.hasAttribute('data-anima-role')) continue;
      const parent = el.parentElement;
      if (parent && typeof parent.closest === 'function' && parent.closest('[data-anima-role]')) continue;
      el.setAttribute('data-anima-role', role);
      if (order) el.setAttribute('data-anima-order', String(order));
      tagged++;
    }
  }

  // A diagram with interactive nodes (`click A "url" "tooltip"`) stays still. The live host shows
  // a sanitized COPY while it animates and hides the original, and Mermaid's tooltip and callback
  // listeners live on the original, so animating would silently switch the interactions off.
  if (svg.querySelector('.clickable')) return 0;

  const kind = String(svg.getAttribute('aria-roledescription') || '').toLowerCase();

  if (svg.querySelector('g.nodes')) {
    // The shared graph renderer: containers, then boxes, then the arrows between them, then
    // the words on the arrows.
    tag('g.clusters > g.cluster', 'region', 0);
    tag('g.nodes g.node', 'bar', 1);
    tag('g.edgePaths > path', 'bar', 2);
    tag('g.edgeLabels > g.edgeLabel', 'label', 0);
  } else if (kind === 'sequence') {
    // Participants first, LEFT TO RIGHT — Mermaid writes them right to left, so document order would
    // sweep the wrong way. Each participant's column keys on its x: the top box (its left edge),
    // then the lifeline (the column's center), then the bottom box (just past the center). Then
    // the messages and notes, all after the last participant, in the order Mermaid drew them.
    const num = (el, name) => {
      const v = parseFloat(el.getAttribute(name));
      return Number.isFinite(v) ? v : 0;
    };
    // A stick-figure participant (`actor Bob`) is a `g.actor-man` group with no x of its own; its
    // head circle's `cx` is the column's center.
    const stickCenter = (el) => {
      const head = el.querySelector('circle');
      return head ? num(head, 'cx') : 0;
    };
    let last = 0;
    const cols = svg.querySelectorAll('rect.actor-top, g.actor-man.actor-top, line.actor-line, rect.actor-bottom, g.actor-man.actor-bottom');
    for (let i = 0; i < cols.length; i++) {
      const el = cols[i];
      if (el.hasAttribute('data-anima-role')) continue;
      const cls = String(el.getAttribute('class') || '');
      const top = cls.indexOf('actor-top') !== -1;
      const stick = el.tagName.toLowerCase() === 'g';
      const center = stick ? stickCenter(el) : num(el, 'x') + num(el, 'width') / 2;
      const key = el.tagName.toLowerCase() === 'line' ? num(el, 'x1') : top ? (stick ? center - 0.5 : num(el, 'x')) : center + 0.5;
      el.setAttribute('data-anima-role', 'bar');
      el.setAttribute('data-anima-order', String(key));
      if (key > last) last = key;
      tagged++;
    }
    tag('line[class^="messageLine"], path[class^="messageLine"], rect.note, rect[class^="activation"]', 'bar', Math.ceil(last) + 1);
  } else if (kind === 'pie') {
    tag('path.pieCircle', 'sector', 0);
    // A legend row is a swatch and its name: it arrives with the words, not before the disc.
    tag('g.legend', 'label', 0);
  } else if (kind === 'gantt') {
    tag('rect.task', 'bar', 0);
  } else if (kind === 'xychart') {
    tag('g[class^="bar-plot"] > rect', 'bar', 0);
    tag('g[class^="line-plot"] > path', 'bar', 1);
  } else if (kind === 'quadrantchart') {
    tag('g.data-point', 'point', 0);
  } else if (kind === 'gitgraph') {
    tag('g.commit-bullets > *', 'point', 0);
    tag('g.commit-arrows > path', 'bar', 1);
  } else if (kind === 'timeline') {
    tag('g.timeline-node', 'bar', 0);
  }
  return tagged;
}

module.exports = { tagMermaidMotion };
