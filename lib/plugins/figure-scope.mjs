/**
 * lib/plugins/figure-scope.mjs — the HOST's answer to "which cascade context is this slide's figure drawn in?",
 * the key every preview cache and every held drawing is matched on (engineering/decisions/
 * 2026-11-06-plugin-patterns.md §5: the flicker protections belong to the host).
 *
 * Moved unchanged from lib/plugins/mermaid/shared/diagram-scope.js, where it was Mermaid's own (#1332 step 3). It
 * knows the runtime's own stamps (the section geometry, the logo tint, the fit agent, the marker classes), which is
 * host knowledge, not a plugin's: a plugin receives it as a host capability (`ctx.scopeKey`, lib/runtime/index.js),
 * never by import (2026-11-01-plugin-contract-hollywood.md). Pure and DOM-shaped only (it reads `className` and
 * `style.cssText`), so Node tests require it as they did before.
 *
 * WHY THERE IS A KEY AT ALL. A Mermaid SVG bakes its colors at render time, and
 * `mermaid.initialize` is GLOBAL while `mermaid.render` takes no config. So a deck
 * whose slides resolve different palettes has to configure, render, reconfigure,
 * render. Doing that per DIAGRAM would rebuild 166 theme variables for every fence
 * on every keystroke (the preview re-renders on a 150 ms debounce). Figures are
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
 * declares a figure token selects on `section.<token>` — so two sections agreeing
 * on both resolve the same palette.
 *
 * THE LIMIT, stated rather than implied: a theme that declared figure tokens from
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

/** The key for a figure that belongs to no section (one outside the deck). */
export const SCOPE_KEY_NONE = '\u0000none';

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
export function figureScopeKey(sectionEl) {
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
  const classes = cls
    .trim()
    .split(/\s+/)
    .filter((c) => c && !RUNTIME_MARKER_CLASSES.has(c))
    .sort();
  return `${classes.join(' ')}${SEP}${inline}`;
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
 * when a new stamp appears. Today it is three families:
 *   · `--_`-prefixed internals (the repo's convention for a derived token) — today
 *     `--_sec-1cqi` / `--_sec-1cqh`, the slide's own 1% emitted by patchSectionGeometry;
 *   · `--deck-logo-filter` / `--deck-logo-opacity`, the tint a tinted-logo slide carries inline
 *     (deckLogoTintVars, plugins.js);
 *   · the FIT agent's `transform` / `transform-origin` / `margin-bottom`, written onto
 *     every section of a buildSrcdoc document and REWRITTEN ON EVERY RESIZE.
 *
 * The CLASS half of the key has the same exposure and its own list — see
 * RUNTIME_MARKER_CLASSES. Saying "this list" without saying that was how the class
 * half went unfiltered while the style half was being carefully fixed.
 */
function isRuntimeStampedProperty(prop) {
  return prop.startsWith('--_') || LOGO_PLACEMENT_PROPS.has(prop) || FIT_AGENT_PROPS.has(prop);
}

/**
 * The two properties the deck-logo injectors stamp inline on a section whose slide carries a
 * `logo-<color>` tint class (`deckLogoTintVars`, lib/integrations/markdown-it/plugins.js; the runtime
 * mirrors it). The filter id differs per slide, so the key must not see it — dropping it costs
 * nothing, because the diagram's own look does not depend on the logo.
 */
const LOGO_PLACEMENT_PROPS = new Set([
  '--deck-logo-filter',
  '--deck-logo-opacity',
]);

/**
 * The three properties the FIT agent writes onto every `.lattice > section` of a
 * `buildSrcdoc` document (docs/src/playground/deck-preview.js) — the Playground
 * filmstrip, the print preview, the export capture frame. Plain properties, not
 * `--_`-prefixed, so nothing else here would have caught them.
 *
 * `transform` carries the fit SCALE, which is rewritten on every pane or window
 * resize — so without this the key moved on every resize and invalidated the whole
 * document's diagram cache, re-rendering every diagram once per resize. Dropping them
 * cannot alias two slides that must render differently: a cached diagram is SVG
 * markup, and scaling the section it sits in does not change that markup.
 *
 * Found by the third independent checker, driven in real Chromium: the geometry and
 * logo stamps left the key byte-identical across six engine-emitted styles; these
 * three moved it in all six.
 */
const FIT_AGENT_PROPS = new Set(['transform', 'transform-origin', 'margin-bottom']);

/**
 * Classes the RUNTIME toggles on a section as its watchers MEASURE the slide — the
 * class half of exactly the drift `isRuntimeStampedProperty` fixes for the style half,
 * and it had no filter at all until the third checker drove it.
 *
 * `overflow` / `clip-marked` / `fit-marked` / `illegible` are watcher OUTPUT, written
 * and cleared as content settles (lib/runtime/index.js — `classList.toggle` on `s`).
 * A reader that runs while a diagram slide is transiently marked keys the render one
 * way; the reader after the marks clear looks the other way and misses. Reproduced:
 * where slow theme CSS let the overflow watcher win its race with `themeSettled`, one
 * slide rendered twice and the replay presented a blank slot.
 *
 * NOT `finish`, which the runtime also adds (injectBackdrops, when `finish-<name>`
 * implies the bare compositor class). It is one-way and derived — but an author can
 * write `_class: finish` on its own, so dropping it could alias a finish slide with a
 * plain one, and a finish is palette. The four above cannot be a stable author signal:
 * the watcher that owns each one sweeps it.
 */
const RUNTIME_MARKER_CLASSES = new Set(['overflow', 'clip-marked', 'fit-marked', 'illegible']);

/**
 * The palette-relevant half of an inline style attribute, in a form two readers at
 * different points in the runtime's pass both compute identically: each declaration's
 * property and value trimmed (whitespace INSIDE a value is left alone — `rgb(1, 2, 3)`
 * survives as written, and both readers see it identically because the CSSOM emits it),
 * runtime-stamped properties dropped — and DECLARATION ORDER PRESERVED.
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
export function normalizeScopeStyle(style) {
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
