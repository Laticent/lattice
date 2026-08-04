/**
 * lib/core/render-diagrams.js
 *
 * THE diagram render kernel — it walks the deck, resolves each slide's palette,
 * and calls the render paths back (#1332 step 4, HARD RULE #1).
 *
 * WHY INVERT, rather than extract another helper. `deckPrintBand()` was already
 * shared before this, and it still took three rounds to get both callers reading
 * it: a helper the paths must remember to call is a convention, not an invariant.
 * #1326 shipped four defects in a row, each introduced by the fix for the previous
 * one, each green through CI, and every one of them was the same shape — two
 * renderers independently deciding the same thing and answering differently. The
 * cure is to stop letting them decide. The kernel drives; the paths supply
 * capabilities.
 *
 * THE WHOLE DIFFERENCE IS ONE PORT. Strip away the accidents and the two
 * renderers differ in exactly one respect: HOW YOU READ A TOKEN FOR A SLIDE.
 *
 *   preview   `getComputedStyle(sectionEl)` — CSS inheritance, so the section's
 *             own classes (a per-slide `_class: dark`) are already applied
 *   PDF path  resolve token expressions offline against the palette text with
 *             that slide's band collapsed (mmdc is a separate process, so there
 *             is no live DOM to ask)
 *
 * Everything else — which slides exist, which palette each one resolves, the
 * 166-entry map, when to rebuild it — is identical logic that used to be written
 * twice. It lives here now.
 *
 *   renderDiagrams(deck, { readToken, renderOne, scopeKey, beginRun })
 *
 * WHAT A `scope` IS, and why it is not a band. A scope is whatever a path needs
 * in order to read a token for one slide, and the two paths hand in genuinely
 * different things:
 *
 *   PDF path  the resolved band — `'light' | 'dark' | 'print'` from
 *             `resolveDiagramBand` (lib/core/diagram-band.js)
 *   preview   the `<section>` element itself; CSS has already resolved the band,
 *             so asking again in the browser would be a second parallel decision
 *
 * `scopeKey(scope)` names the palette a scope resolves, so the kernel can build
 * the theme ONCE per distinct palette instead of once per slide. For the PDF path
 * that key IS the band string (the default `String`); for the preview it is the
 * section's class signature (lib/core/diagram-scope.js). Two ways of spelling
 * "these slides paint the same", which is all the kernel needs to know.
 *
 * WHAT THE DELETION PROVED. #1332 set the test for this design explicitly: a
 * correct fix should let us DELETE the reconciliation devices, not accumulate
 * more. `data-lattice-slide-bake` — a runtime signal that announced which
 * granularity a render had used — is gone in the same change, because once both
 * paths resolve per slide there is no granularity left to announce.
 *
 * KISS BOUNDARY. Two pure modules and a small port. No DI container, no registry,
 * no plugin system, no base class. If this grows a framework it has gone wrong.
 *
 * Pure and dependency-free apart from the theme map, so it bundles into the
 * browser runtime alongside it.
 */

const { buildDiagramTheme } = require('./mermaid-theme-map');

/**
 * Walk a deck's diagrams, resolve each slide's `themeVariables`, and render.
 *
 * @param {Array<{scope: any, diagrams: any[]}>} deck  Slides in DOCUMENT ORDER.
 *   A slide with no diagrams may be omitted or passed with an empty list; either
 *   way it costs nothing, because a palette is only built for a slide that has a
 *   diagram to paint.
 * @param {object} ports
 * @param {(scope: any, tokenName: string) => string} ports.readToken  Read one CSS
 *   custom property (WITHOUT the leading `--`) as this slide resolves it. Owns the
 *   MISS POLICY, which differs by path on purpose — see mermaid-theme-map.js.
 * @param {(diagram: any, themeVars: object, meta: object) => any} ports.renderOne
 *   Render one diagram with the palette the kernel resolved for its slide. `meta`
 *   carries `{ scope, scopeKey, slideIndex, diagramIndex, index }`. Whatever this
 *   returns is collected; a promise is passed through untouched, so an async path
 *   stays async without the kernel becoming so (the emulator renders synchronously
 *   at module-evaluation time and cannot await).
 * @param {(scope: any) => string} [ports.scopeKey]  Names the palette a scope
 *   resolves. Defaults to `String`, which is exactly right for a scope that IS the
 *   band.
 * @param {(themeVars: object, scope: any) => void} [ports.finishTheme]  The ONE
 *   sanctioned place a path may differ from the other in the palette itself. Its only
 *   licensed use is `DIVERGENT_KEYS` (today `fontFamily`, because a hyphenated font
 *   stack cannot survive mermaid's directive sanitizer on the PDF path), and
 *   `test/unit/core/diagram-theme-parity.test.js` fails on any OTHER key that comes
 *   apart — in both directions, so a divergence that stops diverging must be retired
 *   rather than left as a standing license. Called once per theme BUILD, not per
 *   slide, so it is memoized with the rest of the palette.
 * @param {(runStart: {scope: any, scopeKey: string, themeVars: object}) => void} [ports.beginRun]
 *   Called before the first diagram of each RUN — a maximal stretch of consecutive
 *   diagrams that share a palette. The preview needs this because
 *   `mermaid.initialize` is global: it configures once per run and serializes the
 *   run's renders against that config. The PDF path passes nothing, because mmdc
 *   takes its config in the diagram source. The kernel walks SYNCHRONOUSLY, so
 *   every `renderOne` of a run has been called before any promise a `beginRun`
 *   opened can settle — which is what lets the preview collect a run's renders
 *   without the kernel telling it how many to expect.
 * @returns {any[]} One entry per diagram, in document order.
 */
function renderDiagrams(deck, { readToken, renderOne, scopeKey = String, beginRun, finishTheme } = {}) {
  if (typeof readToken !== 'function') throw new TypeError('renderDiagrams: readToken port is required');
  if (typeof renderOne !== 'function') throw new TypeError('renderDiagrams: renderOne port is required');

  // One theme build per distinct palette, not per slide. Built LAZILY: a deck whose
  // dark slides carry no diagram never resolves the dark palette, which on the PDF
  // path also means its "palette missing --token" warnings are not printed for a
  // band nothing renders in.
  const themeByKey = new Map();
  const themeFor = (key, scope) => {
    let vars = themeByKey.get(key);
    if (!vars) {
      vars = buildDiagramTheme((name) => readToken(scope, name));
      if (finishTheme) finishTheme(vars, scope);
      themeByKey.set(key, vars);
    }
    return vars;
  };

  const results = [];
  // Runs are CONSECUTIVE, deliberately — not a global grouping by key. Document
  // order is what a reader sees and what the PDF path's build log reports, and for
  // the single-palette deck (almost every deck) a consecutive run and a global
  // group are the same one batch. A deck alternating bands pays one extra
  // `initialize` per transition, which is a config-object merge, not a rebuild of
  // 166 variables — those stay memoized above.
  let runKey = null;
  const slides = Array.isArray(deck) ? deck : [];
  for (let slideIndex = 0; slideIndex < slides.length; slideIndex++) {
    const slide = slides[slideIndex] || {};
    const diagrams = Array.isArray(slide.diagrams) ? slide.diagrams : [];
    if (diagrams.length === 0) continue;
    const key = scopeKey(slide.scope);
    const themeVars = themeFor(key, slide.scope);
    if (key !== runKey) {
      runKey = key;
      if (beginRun) beginRun({ scope: slide.scope, scopeKey: key, themeVars });
    }
    for (let diagramIndex = 0; diagramIndex < diagrams.length; diagramIndex++) {
      results.push(renderOne(diagrams[diagramIndex], themeVars, {
        scope: slide.scope,
        scopeKey: key,
        slideIndex,
        diagramIndex,
        index: results.length,
      }));
    }
  }
  return results;
}

module.exports = { renderDiagrams };
