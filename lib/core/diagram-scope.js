/**
 * lib/core/diagram-scope.js
 *
 * The preview path's answer to "which cascade context is this slide's diagram
 * baked in?" — and the cache key that follows from it (#1332 step 3).
 *
 * WHY THERE IS A KEY AT ALL. A Mermaid SVG bakes its colors at render time, and
 * `mermaid.initialize` is GLOBAL while `mermaid.render` takes no config. So a deck
 * whose slides resolve different palettes has to configure, render, reconfigure,
 * render. Doing that per DIAGRAM would rebuild 166 theme variables for every fence
 * on every keystroke (the preview re-renders on a 150 ms debounce). Diagrams are
 * therefore GROUPED, and this is the grouping key.
 *
 * WHY IT IS NOT A BAND. Nothing here decides light / dark / print, and nothing
 * should: on this path `getComputedStyle(section)` already returns what that
 * slide's cascade produced, including its own `_class: dark`, so CSS has answered
 * the question `resolveDiagramBand` has to answer offline (lib/core/diagram-band.js
 * — that module is the PDF path's, and the asymmetry is the whole point of the
 * port). Resolving a band in the browser would be a second, parallel decision:
 * exactly the duplication #1332 exists to remove.
 *
 * WHAT THE KEY IS: the section's own class list, order-normalized, plus its inline
 * style. Under Marp every per-slide difference arrives as a `<!-- _class: … -->`
 * token or a per-slide directive's inline style, and every theme rule that
 * declares a diagram token selects on `section.<token>` — so two sections agreeing
 * on both resolve the same palette.
 *
 * THE LIMIT, stated rather than implied: a theme that declared diagram tokens from
 * a POSITIONAL selector (`section:nth-of-type(3)`) would collide two sections onto
 * one key. No theme does. And the failure mode is bounded by what shipped before:
 * such a slide would reuse a same-classed slide's ink, which is what EVERY slide
 * did when the palette was read once from `document.querySelector('section')`.
 *
 * Pure, and DOM-shape-agnostic on purpose — it reads `className` and one attribute,
 * so it is unit-testable as BEHAVIOR against a plain object rather than only as a
 * source-text assertion on the runtime bundle. That distinction is what let three
 * of the four #1326 fixes pass a green suite while broken.
 */

/** The key for a diagram that belongs to no section (a fence outside the deck). */
const SCOPE_KEY_NONE = '\u0000none';

/**
 * NUL joins the parts. A separator that CAN occur in either part (a space) would
 * let one (class, style) or (scope, source) pair alias another — and an aliased
 * key hands a slide another slide's baked ink, which is the bug, not a near-miss.
 */
const SEP = '\u0000';

/**
 * The cascade-context key for one slide.
 *
 * @param {{ className?: unknown, getAttribute?: (name: string) => (string|null) }|null|undefined} sectionEl
 * @returns {string}
 */
function diagramScopeKey(sectionEl) {
  if (!sectionEl) return SCOPE_KEY_NONE;
  // `className` is an SVGAnimatedString on SVG-namespaced elements. Sections are
  // always HTML, but read defensively: a non-string would stringify to
  // "[object SVGAnimatedString]" for every slide and silently collapse the whole
  // deck back into one group — the pre-#1332-step-3 behavior, restored by accident.
  const cls = typeof sectionEl.className === 'string' ? sectionEl.className : '';
  // `style.cssText`, NOT `getAttribute('style')`. Both name the same declarations, but
  // the attribute is the AUTHOR'S TEXT until something calls `setProperty`, at which
  // point the browser replaces it with the CSSOM's serialization — and that rewrites
  // values, not only whitespace: `background-position:center` comes back
  // `center center`, and `url(x)` comes back `url("x")`. A reader before the runtime's
  // geometry stamp and a reader after it therefore saw two different strings for one
  // section, on every slide carrying a `![bg](…)`. Reading the CSSOM on BOTH sides
  // removes the difference at the source; `normalizeScopeStyle` then handles what is
  // genuinely different (the declarations the stamp adds).
  const inline = normalizeScopeStyle(
    typeof sectionEl.style?.cssText === 'string' ? sectionEl.style.cssText : sectionEl.getAttribute?.('style') || '',
  );
  return `${cls.trim().split(/\s+/).filter(Boolean).sort().join(' ')}${SEP}${inline}`;
}

/**
 * Properties the RUNTIME writes onto a section's inline style. They are measurements
 * and placements, never palette, so they are dropped from the scope key.
 *
 * WHY THIS EXISTS AT ALL. The key used to be the raw `style` attribute, which is
 * stable only while every reader looks at it at the same point in the runtime's
 * pass — and that held right up until something needed the key EARLIER. The
 * whitespace half of that drift is gone now that the key reads `style.cssText`
 * (above); what is left for this list is the runtime's ADDED declarations, measured
 * in the Studio:
 *
 *   authored by the engine   `--theme:"cuoio";--class:"diagram";`
 *   after patchSectionGeometry stamps
 *                            `--theme: "cuoio"; --class: "diagram"; --_sec-1cqi: 12.800px; --_sec-1cqh: 7.200px;`
 *
 * The stamp adds two declarations AND makes the browser re-serialize the rest with a
 * space after every colon — so the same slide produced two different keys, and a
 * lookup on one side of the stamp could never hit a cache filled on the other. That
 * is what made the same-task replay (2026-09-05-diagram-fence-flash.md §4E) miss
 * every time on its first implementation.
 *
 * THE FAILURE DIRECTION IS THE POINT. A runtime-stamped property that is NOT listed
 * here costs a cache MISS — a re-render, which is slow — and can never hand a slide
 * another slide's baked ink, because everything that survives normalization is compared
 * exactly, IN ORDER. Both halves matter: dropping too little is a miss, and preserving
 * order is what stops two different last-wins resolutions sharing one key (see
 * `normalizeScopeStyle`). So the list may be incomplete without being unsafe; add to it
 * when a new stamp appears. Today it is two families:
 *   · `--_`-prefixed internals (the repo's convention for a derived token) — today
 *     `--_sec-1cqi` / `--_sec-1cqh`, the slide's own 1% emitted by patchSectionGeometry;
 *   · `--logo-*`, the deck-logo placement applyLogoPlacement stamps on every section
 *     of a deck carrying `logo:` front matter (deckLogoPlacement, plugins.js).
 */
function isRuntimeStampedProperty(prop) {
  return prop.startsWith('--_') || LOGO_PLACEMENT_PROPS.has(prop);
}

/**
 * The five properties `applyLogoPlacement` stamps on every section of a deck carrying
 * `logo:` front matter — the exact list `deckLogoPlacement` emits
 * (lib/integrations/markdown-it/plugins.js). Named individually rather than matched as
 * `--logo-*`, because that prefix also covers `--logo-ink`, a COLOR token
 * (lib/components/inventory/logo-wall/logo-wall.styles.css). Nothing puts that on a
 * section's inline style today, so the broad match dropped nothing real — but a color is
 * the one kind of declaration this key must never discard, and a predicate that would
 * discard one as soon as somebody set it is a trap with no gate on it.
 */
const LOGO_PLACEMENT_PROPS = new Set([
  '--logo-scale',
  '--logo-x',
  '--logo-y',
  '--logo-anchor-right',
  '--logo-nudge',
]);

/**
 * The palette-relevant half of an inline style attribute, in a form two readers at
 * different points in the runtime's pass both compute identically: declarations trimmed,
 * whitespace collapsed, runtime-stamped properties dropped — and DECLARATION ORDER
 * PRESERVED.
 *
 * The order is preserved rather than sorted, and that is a correction. Sorting looked
 * like harmless canonicalization and was not: it discards the last-one-wins rule, so
 * `background:red;background-color:blue` and `background-color:blue;background:red` —
 * which resolve to DIFFERENT colors — normalized to one key. Unreachable through the
 * production caller, because `style.cssText` de-duplicates before this sees it, but this
 * module advertises itself as usable against a plain object and a second caller would
 * have walked into it. Order-independence was never needed: the CSSOM hands both readers
 * the same order, and two sections whose authored order differs now MISS the cache
 * instead of sharing an entry — a re-render, which is the safe direction.
 *
 * A declaration this cannot parse is kept verbatim rather than dropped — an unparseable
 * chunk is a difference between two sections, and losing it would alias them.
 */
function normalizeScopeStyle(style) {
  const out = [];
  for (const raw of String(style).split(';')) {
    const decl = raw.trim();
    if (!decl) continue;
    const colon = decl.indexOf(':');
    if (colon < 1) {
      out.push(decl);
      continue;
    }
    const prop = decl.slice(0, colon).trim();
    if (isRuntimeStampedProperty(prop)) continue;
    out.push(`${prop}:${decl.slice(colon + 1).trim()}`);
  }
  return out.join(';');
}

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
 * `resolveDiagramBand` and `diagramScopeKey` live here rather than in a CLI.
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

module.exports = { SCOPE_KEY_NONE, diagramScopeKey, diagramCacheKey, groupDiagramsBySlide, normalizeScopeStyle };
