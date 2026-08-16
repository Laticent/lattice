/**
 * chart-family transformer — registry-shaped adapter around the engine
 * kernel at lib/components/chart/_chart-family/chart-family.js plus its delegated
 * radar/quadrant kernels at lib/components/{radar,quadrant}/*.transform.js.
 *
 * The engine module owns the HTML-string rewrite for all seven chart
 * layouts (progress, timeline-list, piechart, gantt, kanban, radar,
 * quadrant). Each layout's transform pulls the first <ul>/<ol> out of
 * the section, builds the layout-specific markup, then wraps the whole
 * thing in the chart-frame skeleton and tags the section with
 * `chart-frame`.
 *
 * Consumers:
 *   - lattice-emulator.js (via lib/engine) —
 *                            registry.applyAllToHtml
 *   - lib/runtime/index.js → lattice-runtime.js bundle —
 *                            registry.applyAllToDom(document)
 *
 * Class mutation: transformChartSection appends `chart-frame` to the
 * section's class list; applyToHtml writes it onto the <section> tag and
 * applyToDom propagates it to section.classList.
 *
 * DOM-walk strategy: delegates to engine.transformChartSection rather
 * than maintaining a parallel runtime mirror. Before this commit the
 * runtime carried ~1815 lines of duplicated chart-family + radar +
 * quadrant logic; bundling the engine into lattice-runtime.js lets
 * the runtime route through the same kernel the emulator uses. Same
 * trade-off as the journey / word-cloud adapters: innerHTML
 * replacement destroys existing child nodes, but no other transformer
 * mutates chart sections before this one runs.
 */

const engine = require('../components/chart/_chart-family/chart-family');

/**
 * Sections this adapter has already built, mapped to the SOURCE list it built
 * from and the class list it built for.
 *
 * WHY IT EXISTS. `transformChartSection` early-returns on a section that already
 * carries `chart-frame`, and `applyToDom` replaced `innerHTML` on the first pass
 * — so the authored `<ul>` the builder needs is gone and a chart can never be
 * rebuilt, whatever changed. That was invisible while a chart's output depended
 * only on its own list. It stopped being invisible when a chart's GEOMETRY
 * started keying on a deck-wide token: on the fetch-fallback path the deck's
 * `mode: sketch` lands after the first transform pass, so the gantt axis was
 * built with mono advances and then painted in the hand face (#1673, and the
 * class of desync #1663 exists to prevent).
 *
 * Keeping the source HERE rather than in a `data-` attribute is deliberate: an
 * attribute would ride into every exported bundle, inflating the artifact and
 * changing its bytes, to serve a re-run that only ever happens live in a page
 * session. A WeakMap is exactly that scope, and it lets the section be collected
 * normally when a previewer replaces it wholesale on an edit.
 */
const built = new WeakMap();

/** Order-independent identity for a class list, so `a b` and `b a` compare equal. */
function classKey(className) {
  return String(className).trim().split(/\s+/).filter(Boolean).sort().join(' ');
}

module.exports = {
  name: 'chart-family',
  layouts: engine.CHART_LAYOUTS,
  selector: engine.CHART_LAYOUTS.map(l => `section.${l}`).join(', '),
  applyToHtml(html) {
    return engine.applyToRenderedHtml(html);
  },
  applyToDom(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    for (const layout of engine.CHART_LAYOUTS) {
      for (const section of root.querySelectorAll('section.' + layout)) {
        try {
          const orientation = section.getAttribute ? section.getAttribute('data-orientation') : undefined;
          const prior = built.get(section);
          let source = section.innerHTML;
          let buildCls = section.className;
          if (prior) {
            // Nothing that can change the build has moved — the common case, and
            // the one that must stay free: every later pass over an unchanged
            // chart costs one string compare and stops here.
            if (prior.classKey === classKey(section.className)) continue;
            // Something did move (the deck's registers landed late, or a live
            // `_class:` edit). Rebuild from the SOURCE list, with `chart-frame`
            // dropped so the idempotency guard doesn't reject the rebuild it is
            // being asked for.
            source = prior.source;
            buildCls = section.className.split(/\s+/)
              .filter((t) => t && t !== 'chart-frame').join(' ');
          }
          const r = engine.transformChartSection(source, buildCls, orientation);
          if (!r.transformed) continue;
          // Record BEFORE the write, keyed on the class list the rebuild will
          // leave behind (`r.cls` is the incoming list plus `chart-frame`), so
          // the next pass compares against what it will actually read.
          built.set(section, { source, classKey: classKey(r.cls) });
          section.innerHTML = r.html;
          // chart-family appends 'chart-frame' to cls; propagate to the
          // live section's class list. classList.add is idempotent.
          for (const tok of r.cls.split(/\s+/).filter(Boolean)) {
            if (!section.classList.contains(tok)) section.classList.add(tok);
          }
        } catch (e) {
          if (typeof console !== 'undefined') {
            console.warn('[lattice-runtime] chart-family transform failed', layout, e);
          }
        }
      }
    }
  },
};
