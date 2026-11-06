/**
 * lib/plugins/mermaid/shared/diagram-scope.js
 *
 * How Mermaid's preview pass groups and caches its diagrams by slide. The SCOPE KEY these are built on is the
 * host's (lib/plugins/figure-scope.mjs `figureScopeKey`), which the pass receives as `ctx.scopeKey`: it moved there
 * when the flicker protections became the host's (engineering/decisions/2026-11-06-plugin-patterns.md §5), so a
 * second deferred figure (function-plot) is matched on the same key.
 */

/**
 * NUL joins the scope key and the source, as the host's scope key joins its own parts: a separator that can occur in
 * either part would let two pairs alias, and an aliased key hands a slide another slide's baked ink.
 */
const SEP = '\u0000';

/**
 * The key a rendered SVG is cached under: the scope AND the source.
 *
 * The source alone is only a sound key while every diagram in the deck bakes from
 * one palette. The moment ink is per slide, the same source on a light slide and on
 * a `_class: dark` slide is two different SVGs — and a source-only key hands the
 * second slide the first one's baked ink, reintroducing the #1326 mismatch through
 * the cache instead of through the config.
 */
function diagramCacheKey(scopeKey, source) {
  return `${scopeKey}${SEP}${source}`;
}

/**
 * Group a document-order list of diagram fences into the kernel's `deck` shape: one
 * entry per SLIDE, `scope` being that slide's section.
 *
 * WHY THIS IS A FUNCTION AND NOT A LOOP INSIDE THE RUNTIME. This is the decision the
 * whole per-slide bake rests on — *which slide does this diagram belong to* — and while
 * it lived inline in `initAndRun` the only thing gating it was a source-text
 * `assert.match`. An independent check confirmed the hole: collapsing the grouping to a
 * single entry (the slide-1 bake, restored) passes every regex those tests had. Pure
 * and requireable, it is asserted as BEHAVIOR instead — the same reason
 * `resolveDiagramBand` lives in lib/core and the scope key in the host rather than in a CLI.
 *
 * CONSECUTIVE, on section IDENTITY. `querySelectorAll` returns document order, so two
 * fences on one slide are adjacent and become one entry — which is what lets the
 * kernel's runs coalesce. Two DIFFERENT sections are always two entries even when they
 * carry identical classes: they are two slides, and collapsing them is the bug.
 *
 * @param {Array<{sectionEl?: any}>} fences  in document order.
 * @returns {Array<{scope: any, diagrams: any[]}>}
 */
function groupDiagramsBySlide(fences) {
  const deck = [];
  let current;
  let started = false;
  for (const fence of Array.isArray(fences) ? fences : []) {
    const sectionEl = fence?.sectionEl ?? null;
    if (!started || sectionEl !== current) {
      started = true;
      current = sectionEl;
      deck.push({ scope: sectionEl, diagrams: [] });
    }
    deck[deck.length - 1].diagrams.push(fence);
  }
  return deck;
}

module.exports = {
  diagramCacheKey,
  groupDiagramsBySlide,
};
