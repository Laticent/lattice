/**
 * chart-family transformer — registry-shaped adapter around the engine
 * kernel at lib/components/chart/_chart-family/chart-family.js.
 *
 * That module owns the dispatch and the chart-frame wrap; each chart's own
 * kernel (lib/components/chart/<name>/<name>.transform.js, reached through the
 * manifest's `kernel` block) pulls the first <ul>/<ol> — or the table — out of
 * the section and builds the layout-specific markup. The family then wraps it in
 * the chart-frame skeleton and tags the section with `chart-frame`. Neither this
 * file nor the family names a chart: `engine.CHART_LAYOUTS` comes from the
 * generated registry.
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

/**
 * Classes the ENGINE toggles on a section as live diagnostic state, which no
 * chart builder reads — so a flip must not be mistaken for "the author changed
 * this slide" and buy a destructive rebuild.
 *
 * These are stamped and cleared by the overflow / fit / legibility watchers
 * (`lib/runtime/index.js`, cleared by `sweepOverflowMarkers` in
 * `lib/runtime/fluid-view-policy.js`), and they land on chart sections for real:
 * the type-floor alarm's own note records it firing on 7 of 11 slides of the
 * state-chart gallery, and `state-chart` is a chart layout. Without this filter
 * every such flip re-minted the chart — identical output, thrown-away popover
 * and motion targets, on a signal that has nothing to do with geometry.
 *
 * A denylist can rot, so it is deliberately not the only defense: the backdrop
 * re-injection in `runAllContentTransforms` means a MISSING entry here costs
 * wasted work rather than a visibly broken slide. If a new watcher class shows
 * up, the symptom is a chart rebuilding every pass — add it here.
 */
const ENGINE_STATE_CLASSES = new Set([
  'overflow', 'clip-marked', 'illegible', 'fit-marked',
]);

/**
 * Order-independent identity for a class list, so `a b` and `b a` compare equal,
 * with engine diagnostic state excluded (see above).
 */
function classKey(className) {
  return String(className).trim().split(/\s+/)
    .filter((t) => t && !ENGINE_STATE_CLASSES.has(t))
    .sort().join(' ');
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
    // ONE query over the whole selector, so sections are visited in DOCUMENT
    // order. This used to loop the layouts and query each in turn, which visited
    // in LAYOUT order — so a deck mixing chart types minted its render-scoped
    // `chart-spine-N` ids in a different sequence here than on the engine path,
    // which walks the document (`mapSections`). Both are internally consistent
    // (every reference is intra-section, no id collides), so nothing was visibly
    // broken; it was a latent disagreement between two of the three render paths
    // about a shared counter, invisible while the layout list was hand-ordered
    // and surfaced the moment it started being generated. Document order is the
    // one both paths can agree on, and it makes the runtime independent of the
    // dispatch order entirely.
    for (const section of root.querySelectorAll(this.selector)) {
      const layout = engine.CHART_LAYOUTS.find((l) => section.classList.contains(l));
      try {
        const orientation = section.getAttribute ? section.getAttribute('data-orientation') : undefined;
        const prior = built.get(section);
        let source;
        let buildCls = section.className;
        // DOES THE SECTION STILL HOLD BUILT OUTPUT? `chart-frame` is the marker
        // that says so — it is what `transformChartSection`'s own idempotency
        // guard keys on. A previewer that reuses the same <section> across an
        // edit rewrites the content AND re-stamps the class list from the
        // slide's `_class:` directive, which drops `chart-frame`; without this
        // test the rebuild would run from the stored source and resurrect the
        // OLD chart over the new authoring — a regression against the
        // pre-change code, which had no memory and so could not be stale.
        //
        // Deliberately NOT `section.innerHTML !== prior.html`: transforms that
        // run after this one in the same pass restructure these children
        // (masthead-lift hoists the chrome into cells), so the served HTML
        // differs from what we wrote on every later pass and that test would
        // read every section as stale and disable rebuilding altogether.
        const holdsBuilt = section.className.split(/\s+/).includes('chart-frame');
        if (prior && holdsBuilt) {
          // Nothing that can change the build has moved — the common case, and
          // the one that must stay free: two string compares, and no read of
          // `section.innerHTML`, which on a built chart is a full serialization
          // of the SVG.
          if (prior.classKey === classKey(section.className)
            && prior.orientation === orientation) continue;
          // Something did move (the deck's registers landed late, or a live
          // `_class:` edit). Rebuild from the SOURCE list, with `chart-frame`
          // dropped so the idempotency guard doesn't reject the rebuild it is
          // being asked for.
          source = prior.source;
          buildCls = section.className.split(/\s+/)
            .filter((t) => t && t !== 'chart-frame').join(' ');
        } else {
          // First build: the section still holds the authored list.
          source = section.innerHTML;
        }
        const r = engine.transformChartSection(source, buildCls, orientation);
        if (!r.transformed) continue;
        // Record BEFORE the write, keyed on the class list the rebuild will
        // leave behind (`r.cls` is the incoming list plus `chart-frame`), so
        // the next pass compares against what it will actually read.
        // ORIENTATION IS A BUILD INPUT TOO. `transformChartSection` takes three
        // arguments and the class list is only one of them — `data-orientation`
        // is re-stamped at runtime from the measured aspect (patchSectionGeometry),
        // and builders genuinely key on it (the funnel's portrait viewBox, gantt's
        // GANTT_GEOM_TALL). Keying the rebuild on the class list alone would have
        // left a chart built for landscape sitting on a section that had since
        // become portrait — the same measure-vs-paint disagreement in a different
        // channel. Caught by the inversion lens on this diff.
        built.set(section, { source, classKey: classKey(r.cls), orientation });
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
  },
};
