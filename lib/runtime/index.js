/* Lattice runtime — esbuild entry, bundled to dist/lattice-runtime.js
   (see tools/build-runtime.js). One of the three render paths.

   Goal: fenced ```mermaid blocks render in Marp previews.

   Mermaid expects something like: <pre class="mermaid">graph TD ...</pre>
   Marp preview emits: <marp-pre><code class="language-mermaid">...</code></marp-pre>
   We upgrade those wrappers + run Mermaid after DOMContentLoaded.
*/

// Shared transformer registry — bundled by esbuild from lib/transformers/.
// Currently dispatches split-panels.applyToDom (all six layouts including
// split-panel + split-compare). Chart-family,
// roadmap, journey, word-cloud migrate into this registry in follow-up PRs.
const sharedTransformerRegistry = require('../../lib/transformers/registry');
const stateChartLayout = require('../../lib/components/chart/state-chart/state-chart.transform');
const { finishClasses, sectionIsFinish } = require('../../lib/core/resolve-finish');
const {
  overflowMarkerPolicy,
  sweepOverflowMarkers,
  legibilityTabText,
} = require('./fluid-view-policy');
const {
  AUTHORING_DEFAULT_MARKER, EXPORT_DEFAULT_MARKER, resolveOverflowMarker,
} = require('../../lib/core/resolve-overflow-marker');
const { readExportSettings } = require('../../lib/core/export-settings');
const matrixGridCells = require('../../lib/core/matrix-grid-cells');
const { slotLayoutSelector } = require('../../lib/core/slot-label-lift');
const glossarySlide = require('../../lib/core/glossary-slide');
const bgImage = require('../../lib/core/bg-image');
const { readFrontMatterBlock, readBakedFrontMatter } = require('../../lib/core/deck-front-matter');
const { readFormMode, deckLogoPlacement, deckLogoInCorner } = require('../../lib/integrations/markdown-it/plugins');
const { frontMatterValue, frontMatterName } = require('../../lib/core/front-matter-key');
const { modeClasses, MODE_TOKENS } = require('../../lib/core/resolve-mode');
const { claimClasses } = require('../../lib/core/resolve-claim');
const { stampClass } = require('../../lib/core/resolve-stamp');
const { toneStyleClass, TONE_STYLE_TOKENS } = require('../../lib/core/resolve-tone-style');
const {
  spectrumClass,
  spectrumEdgeClass,
  spectrumCardClass,
  spectrumCardEdgeClass,
  spectrumTrimClass,
  isSpectrumStyleToken,
  isSpectrumEdgeToken,
  isSpectrumCardToken,
  isSpectrumCardEdgeToken,
  isSpectrumTrimToken,
} = require('../../lib/core/resolve-spectrum');
const { ruleClass, RULE_TOKENS } = require('../../lib/core/resolve-rule');
const { eyebrowClass, EYEBROW_TOKENS } = require('../../lib/core/resolve-eyebrow');
const { headlineClass, HEADLINE_TOKENS } = require('../../lib/core/resolve-headline');
const { liftClass } = require('../../lib/core/resolve-lift');
const { COLOR_MODE_TOKENS: COLOR_MODE_TOKEN_LIST, slidePinEvictsDeckToken } = require('../../lib/core/color-mode');
const { deckColorModeToken } = require('../../lib/core/resolve-color-mode');
const { deckClassTokensFromFrontMatter } = require('../../lib/core/deck-class-register');
// THE diagram render kernel: it walks the deck, resolves each slide's palette from
// the shared 166-entry map, and calls this path back (#1332 step 4, HARD RULE #1).
// This path supplies a token reader, a scope key, and a renderer — no policy.
const { renderDiagrams } = require('../../lib/core/render-diagrams');
// The per-slide cascade-context key + the SVG cache key derived from it (#1332
// step 3). Pure and DOM-shape-agnostic, so what the grouping keys on is testable
// as behavior; see lib/core/diagram-scope.js for why it is a class signature and
// deliberately NOT a resolved band.
const { diagramScopeKey, diagramCacheKey, groupDiagramsBySlide } = require('../../lib/core/diagram-scope');
// The look question (lib/core/diagram-look.js). Resolved HERE from the live
// section — the same port the band uses: the deck's `mode: sketch` is already
// propagated onto every section's class list, and the texture channel is a custom
// property that slide's cascade resolves. So the preview reads the DOM where the
// PDF path reads front matter, and both reach the same answer.
const { resolveDiagramLook } = require('../../lib/core/diagram-look');
// THE shared non-palette Mermaid config — the config half of the port (#1347). This
// path builds its `mermaid.initialize` argument from it and adds only what is
// enumerated in DIVERGENT_CONFIG; before that, eight keys diverged with no gate.
const { engineInitConfig } = require('../../lib/integrations/mermaid/init-directive');
const { withDefaultComponent } = require('../../lib/core/resolve-component');
const {
  CLIP_CELL_SELECTOR,
  IGNORED_CLIP_SELECTOR,
  IGNORED_BEARER_SELECTOR,
  probeSectionOverflow,
  probeContentClipped,
  probeFigureLegibility,
  FIGURE_TEXT_FLOOR_RATIO,
} = require('../../lib/core/overflow-probe');
// WHEN the fit probes run and over WHICH slides — the scheduling policy that
// replaced `schedulePostMutation(check)`. Pure and DOM-free, so the decision is
// unit-testable without a browser; see lib/core/fit-sweep.js for why a
// generation counter and a viewport band beat a per-frame full-document scan.
const { planFitSweep, COMPLETE: COMPLETE_SWEEP } = require('../../lib/core/fit-sweep');
// The marker's chrome, emitted WITH the slide instead of created by this
// watcher. `berth()` is how the watcher reaches an element it no longer owns.
const fitBerth = require('../../lib/core/fit-berth');
// The three berths, attribute-qualified — the one subtree this runtime's own
// writes land in, and therefore the one the content observer must ignore.
const MARKER_CHROME_SELECTOR = fitBerth.BERTHS.map((c) => `.${c}[${fitBerth.BERTH_ATTR}]`).join(', ');
const { settleFonts } = require('../../lib/core/font-settle');
const { familyFor, orientationFor: deckOrientation } = require('../../lib/adaptive/families');
// Self-contained Form Tiles (issue #356): each owns BOTH its adapters
// (HTML-string + DOM) in one kernel under lib/forms/tile/<id>. The runtime uses
// the DOM adapter (applyToDom). This replaced the old lib/runtime/form-dom.js
// mirror file, which is gone now that every Tile owns its own DOM injector.
const metaTile = require('../../lib/forms/tile/meta/meta.transform');
const progressTile = require('../../lib/forms/tile/progress/progress.transform');
const watermarkTile = require('../../lib/forms/tile/watermark/watermark.transform');
const { reorientMermaidForPortrait } = require('../../lib/integrations/mermaid/reorient');
// Form is the DEFAULT composition model (design/forms.md; on by default since
// 2026-06-26). Marp runs none of the render-time form-toggle, so the runtime
// reproduces the default on the live DOM through this shared kernel — one source
// for the skip set + `form`/`no-form` opt-outs across all render paths
// (HARD RULE #1). See lib/forms/form-default.js for the full rationale.
const { applyFormDefaultToDom } = require('../../lib/forms/form-default');
// Accessibility (CVD) categorical texture <defs> — the shared kernel both
// render paths are meant to call (HARD RULE #1); lattice-emulator.js already
// injects these into every export, but the runtime never did ("the runtime
// follows" in the module's own header comment was never actually done), so
// an a11y-* theme's chart/diagram fills referenced a nonexistent pattern id
// in live preview. See lib/core/accessibility-textures.js.
const { texturePatternDefs } = require('../../lib/core/accessibility-textures');

(() => {
  const globalScope = typeof window !== "undefined" ? window : globalThis;
  if (globalScope.__llMermaidBootstrapLoaded) return;
  globalScope.__llMermaidBootstrapLoaded = true;

  // Marp preview often re-renders slide DOM on edit without a full page reload.
  // A one-shot DOMContentLoaded init can miss newly inserted fences, making Mermaid
  // appear to "randomly" stop rendering. We keep a lightweight observer that
  // schedules Mermaid runs when Mermaid fences/containers are added/changed.

  // ── BEGIN PALETTE PORT: THIS PATH'S TOKEN READER, the whole difference ──────
  //
  // Bracketed by sentinels because a gate LIFTS this block and runs it (see
  // diagramThemePorts below).
  //
  // Reads computed values from the loaded palette file (themes/indaco.css,
  // themes/cuoio.css, …) so the palette always matches whatever is active in the
  // preview. The CSS variables read here are the --diagram-* tokens each palette
  // declares; the renderer is otherwise palette-blind. Per-diagram CSS overrides live
  // in lattice.css's DIAGRAM OVERRIDES section, not in this runtime — only Mermaid's
  // own themeVariables API surfaces are wired up here.
  // See engineering/decisions/2026-05-12-diagram-tokens.md for the architecture.
  //
  // WHAT IS AND IS NOT HERE. This is a READER and nothing else. Which variables
  // exist, which token feeds each, and when to build a palette from them all live in
  // the shared kernel (lib/core/mermaid-theme-map.js + lib/core/render-diagrams.js,
  // #1332 steps 2 and 4, HARD RULE #1). This file used to hold a second copy of the
  // 166-entry map, kept in sync BY COMMENT — a cross-file prose pointer where an
  // import belonged, and 38 of the values had quietly drifted.
  //
  // THE SECTION IS THE PORT (#1332 step 3). The scope used to be resolved inside the
  // builder as `document.querySelector('section')` — ALWAYS slide 1 — so a deck whose
  // first slide is light baked LIGHT ink into every diagram in the deck, including
  // slide 9's `_class: dark` one. Chip is per-section CSS, ink is baked: the last
  // surviving instance of the #1326 bug class, ink and chip describing different
  // slides.
  //
  // No band is resolved here, and none should be. `getComputedStyle(sectionEl)`
  // returns the values THAT slide's cascade produced, including its own
  // `_class: dark` / `light` / `print`, so CSS inheritance already answers offline
  // `resolveDiagramBand`'s question. That asymmetry between the two paths IS the port.
  //
  // A reader holds a live PROBE, so it must be closed. Probes are opened lazily, one
  // per palette, and torn down together once the kernel's walk returns — the walk is
  // synchronous, so "after it returns" is provably after the last read.
  /**
   * The node look for one slide, read off the live section.
   *
   * The DOM-side half of `resolveDiagramLook`: `section.className` already carries
   * the deck's `mode:` (the deck-class propagator appends it to every section) plus
   * any per-slide `_class:` opt-out, and `--cat-1-texture` is defined only by a
   * palette that carries categories by pattern. So both of the resolver's inputs are
   * readable here without parsing front matter the preview never sees.
   */
  function lookForSection(sectionEl) {
    if (typeof document === 'undefined' || !sectionEl) return 'classic';
    const cls = typeof sectionEl.className === 'string' ? sectionEl.className : '';
    let usesTexture = false;
    try {
      usesTexture = !!getComputedStyle(sectionEl).getPropertyValue('--cat-1-texture').trim();
    } catch {
      // A detached or cross-document section cannot be probed; fall back to the
      // safe answer, which is the one that preserves redundant encoding.
      usesTexture = true;
    }
    return resolveDiagramLook({ slideClass: cls, paletteUsesTexture: usesTexture });
  }

  function openSectionReader(scopeEl) {
    if (typeof document === 'undefined') return { read: () => '', raw: () => '', close() {} };
    // Marp scopes CSS custom properties to <section> elements, not :root. Reading from
    // document.documentElement always returns empty strings for theme tokens, so a
    // caller with no section to hand falls back to it only to stay defined — it reads
    // empty and hits the retry budget.
    const el = scopeEl || document.querySelector('section') || document.documentElement;
    const s = getComputedStyle(el);
    const raw = (name) => s.getPropertyValue('--' + name).trim();

    // Colour resolver. CSS custom properties returned via getPropertyValue come back
    // as the raw token stream — so a token defined as `light-dark(#FAF7F2, #15110D)`
    // reads as that literal string, which Mermaid's color parser rejects with
    // "Unsupported color format". Setting a real `color` property to `var(--name)` on a
    // probe element forces the browser to resolve light-dark() / color-mix() / etc. to
    // a flat rgb() value, which Mermaid accepts. The probe inherits color-scheme from
    // `el`, so per-section dark contexts resolve to the dark side automatically. Falls
    // back to raw string access for non-color tokens.
    let probe = null;
    const read = (name) => {
      if (!probe) {
        probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
        el.appendChild(probe);
      }
      probe.style.color = '';
      probe.style.color = `var(--${name})`;
      const c = getComputedStyle(probe).color;
      if (c && c !== 'rgba(0, 0, 0, 0)') return c;
      // Probe didn't resolve — either the var is undefined or the value uses a function
      // the browser doesn't support (e.g. light-dark() on older Chromium builds). Parse
      // light-dark() manually so Mermaid never sees the raw token string.
      const rawValue = raw(name);
      const ld = /^light-dark\(\s*([^,]+?)\s*,\s*(.+?)\s*\)$/i.exec(rawValue);
      if (ld) {
        const isDark = (getComputedStyle(el).colorScheme || '').includes('dark');
        return isDark ? ld[2].trim() : ld[1].trim();
      }
      // A MISS RETURNS THE EMPTY STRING, never a black sentinel. That is this path's
      // half of the miss policy and it is load-bearing: an unresolved theme on a slow
      // webview must fall through to the retry budget, not paint the deck black. (The
      // PDF path warns and substitutes #000000, so a palette gap is loud in its build
      // log — see lib/core/mermaid-theme-map.js.)
      return rawValue;
    };

    return {
      read,
      raw,
      close() {
        if (probe?.parentNode) probe.parentNode.removeChild(probe);
        probe = null;
      },
    };
  }

  // One open READER per palette, for the duration of one kernel walk. Bounded by the
  // number of distinct class signatures in the deck, so no eviction policy is needed —
  // and they are all closed when the walk returns, because each holds a live probe
  // element in the document.
  //
  // A live PALETTE switch is not invalidated across walks, exactly as it is not for
  // mermaidSvgCache: a Mermaid SVG bakes its colors, so a theme change needs a preview
  // reload either way (see the theme-change caveat on that cache).
  let sectionReaders = new Map();
  function sectionReaderFor(scopeEl) {
    const key = diagramScopeKey(scopeEl);
    let reader = sectionReaders.get(key);
    if (!reader) {
      reader = openSectionReader(scopeEl);
      sectionReaders.set(key, reader);
    }
    return reader;
  }
  function closeSectionReaders() {
    for (const reader of sectionReaders.values()) {
      try { reader.close(); } catch (_e) { /* the section may already be gone */ }
    }
    sectionReaders = new Map();
  }

  /**
   * THE PALETTE HALF of this path's port, as one object.
   *
   * Grouped and named rather than written inline at the call site so a gate can DRIVE
   * it — `test/unit/core/diagram-theme-parity.test.js` lifts the block between the two
   * sentinel comments and runs the real functions against a fake DOM. A paraphrase in
   * the test would test the paraphrase, and this is the half where a silent divergence
   * from the PDF path would be invisible.
   */
  function diagramThemePorts() {
    return {
      scopeKey: diagramScopeKey,
      readToken: (sectionEl, name) => sectionReaderFor(sectionEl).read(name),
      // THE ONE SANCTIONED DIVERGENCE (DIVERGENT_KEYS). The PDF path bakes a monospace
      // stack because mermaid's `sanitizeDirective` allow-list has no hyphen, so
      // `system-ui`/`sans-serif` is blanked the moment it rides in a %%{init}%%
      // directive — and a blank font makes mermaid MEASURE labels in one font while the
      // page RENDERS them in another, clipping them mid-word. This path goes through
      // `mermaid.initialize`'s far more permissive `sanitize`, so it can carry the deck's
      // real body font. A pre-existing WYSIWYG gap (engineering/mermaid.md §5.3),
      // tracked separately and deliberately left alone: closing it changes how every
      // preview renders, which is not the same change as inverting the kernel.
      //
      // It lives in the PORT rather than in a post-pass over the kernel's output, so the
      // divergence is a property of this path's READER — where a path difference belongs
      // — and the parity gate still fails on any OTHER key that comes apart.
      finishTheme: (themeVars, sectionEl) => {
        themeVars.fontFamily = sectionReaderFor(sectionEl).raw('font-body')
          || "'Outfit', system-ui, sans-serif";
      },
    };
  }
  // ── END PALETTE PORT ─────────────────────────────────────────────────────────

  // ── The per-slide cascade SCOPE (#1332 step 3) ──────────────────────────────
  //
  // `mermaid.initialize` is GLOBAL and `mermaid.render` takes no config, so
  // per-slide themeVariables mean re-initializing between diagrams that resolve
  // differently. Doing that per DIAGRAM would rebuild 166 variables for every
  // fence on every keystroke (the preview re-renders on a 150 ms debounce), so
  // diagrams are GROUPED by the cascade context they sit in and the palette is
  // built — and applied — once per group. A deck has one to three such contexts
  // in practice (the three bands), never one per slide.
  //
  // THE KEY IS THE SECTION'S OWN CASCADE IDENTITY, and it is deliberately NOT a
  // band: nothing in this file decides light/dark/print, because CSS already did
  // (see openSectionReader). It lives in lib/core/diagram-scope.js — pure and
  // DOM-shape-agnostic, so what it keys on is unit-testable as BEHAVIOR instead of
  // only as a source-text assertion on this bundle, and the reasoning (plus the one
  // positional-selector limit it carries) is stated once, there.

  // Trailing-edge debounce for Marp's re-render mutation bursts (typically
  // 5–10 mutations within ~30ms). 150ms coalesces them below the
  // perceptible-lag threshold. We don't section-scope: initAndRun filters on
  // data-mermaid-state="pending" so already-rendered diagrams are no-ops.
  const DEBOUNCE_MS = 150;
  let scheduledRunHandle = null;
  // Listeners for "a mutation burst has settled and the content pass has run".
  //
  // The overflow sweep rides this rather than installing an observer of its own,
  // and which observer it rides is the whole point: THIS one watches `childList`
  // and `subtree` only (see the `new MutationObserver(scheduleRun)` call site),
  // while the per-frame dispatcher the sweep used to use also watched
  // `attributes` — so the sweep's own class and attribute writes re-triggered
  // the sweep. Same document, same mutations, one crucial difference in what is
  // observed. See lib/core/fit-sweep.js.
  const contentSettledListeners = [];
  function onContentSettled(fn) { contentSettledListeners.push(fn); }
  // Is every record in this batch inside marker chrome — i.e. was this burst the
  // WATCHER'S OWN doing?
  //
  // This exists because a claim in this file was FALSE, and the false version had
  // shaped the design. The comments said "filling a berth is not a childList
  // mutation", so moving the tabs into the markup was described as cutting the
  // self-trigger edge at the root. Measured in Chromium, `textContent = 'x'` emits
  // exactly ONE childList record (a text node added, and the old one removed) and
  // ZERO characterData records — so a berth fill IS a childList mutation, this
  // observer does see it, and the cycle was still being held shut by the
  // inequality guard at each write site rather than by the shape. The generation
  // counter settling at 2 instead of 1 on an overflowing deck is that extra lap.
  //
  // So the filter moves to where the edge actually is. A mutation inside a marker
  // berth is never something the content transforms need to react to — they do not
  // read it, and nothing they emit depends on it — so dropping those bursts costs
  // no coverage and removes the edge for real. The guards stay (they are cheap and
  // they are correct), but they are no longer the only thing standing between this
  // observer and a loop. (HARD RULE #25 checker, which measured the record types.)
  const burstIsMarkerChromeOnly = (records) => {
    for (const r of records) {
      const t = r.target;
      const el = t && (t.nodeType === 1 ? t : t.parentElement);
      if (!el || typeof el.closest !== 'function') return false;
      if (!el.closest(MARKER_CHROME_SELECTOR)) return false;
    }
    return true;
  };
  function scheduleRun() {
    if (scheduledRunHandle) clearTimeout(scheduledRunHandle);
    scheduledRunHandle = setTimeout(() => {
      scheduledRunHandle = null;
      initAndRun();
      // AFTER the content pass, never before: the transforms move DOM around
      // (the Form composition, the Tile injectors, a Mermaid SVG landing in its
      // target), and measuring the arrangement they replaced is measuring a
      // slide that no longer exists.
      for (const fn of contentSettledListeners) {
        try { fn(); } catch (_e) { /* one listener must not strand the others */ }
      }
    }, DEBOUNCE_MS);
  }

  function wrapFences() {
    // Mark each ```mermaid fence's <pre> with `data-mermaid-state="pending"`
    // and insert a sibling <div class="mermaid"> as the SVG render target.
    // We do NOT wrap the <pre> in any container — Marp's `<pre is="marp-pre">`
    // is a direct flex child of `<section>` and participates in Marp's
    // auto-scaling (`data-auto-scaling`); wrapping it broke that relationship.
    //
    // The <pre> is purely a conduit for mermaid.render() to read source from.
    // CSS hides it as soon as `data-mermaid-state` is set (any value), so it
    // is never shown to the author. Visibility transitions are:
    //   pending/rendering → nothing visible (host is loading the diagram)
    //   rendered          → sibling .mermaid (the SVG) visible
    //   error             → sibling .mermaid-error (themed error block) visible
    //
    // The .mermaid-error sibling is created lazily by attachError() on
    // failure; we don't pre-create it here.
    const FENCE_SELECTOR = [
      "pre > code.language-mermaid",
      "pre > code[class*='language-mermaid']",
      "marp-pre > code.language-mermaid",
      "marp-pre > code[class*='language-mermaid']",
    ].join(",");
    for (const codeEl of document.querySelectorAll(FENCE_SELECTOR)) {
      const preEl = codeEl.parentElement;
      if (!preEl) continue;
      // Already marked — skip.
      if (preEl.dataset.mermaidState) continue;

      // Defang the language class so other extensions that target
      // `code.language-mermaid` (notably bierner.markdown-mermaid in the
      // plain VS Code markdown preview) stop trying to render the same
      // fence with their own bundled mermaid build. We keep the original
      // text in `data-original-class` for diagnostics; nothing else reads it.
      // We retain "language-mermaid-source" so syntax highlighting from
      // the engine (which scoped on `language-mermaid` at build time)
      // is untouched in exports — exports never run this runtime.
      if (codeEl.classList.contains("language-mermaid")) {
        codeEl.dataset.originalClass = codeEl.className;
        codeEl.classList.remove("language-mermaid");
        codeEl.classList.add("language-mermaid-source");
      }

      // Check whether a previous render-cycle's sibling survived. Marp's
      // VS Code preview re-renders the <section> on every content change,
      // which produces a fresh <pre> (no data-mermaid-state) but leaves the
      // adjacent `.mermaid` div untouched. Without this reuse path, every
      // re-render would prepend a new EMPTY sibling, orphaning the SVG-bearing
      // one further down — making the diagram visually disappear after the
      // first successful render.
      let target = preEl.nextElementSibling;
      if (target?.classList.contains("mermaid")) {
        // Existing sibling. If it already holds an SVG, the diagram survived
        // intact — flag the pre as rendered and we're done.
        if (target.querySelector("svg")) {
          preEl.dataset.mermaidState = "rendered";
          continue;
        }
        // Empty leftover sibling — reuse as the target for this cycle.
      } else {
        target = document.createElement("div");
        target.className = "mermaid";
        target.setAttribute("aria-hidden", "true");
        preEl.insertAdjacentElement("afterend", target);
      }
      preEl.dataset.mermaidState = "pending";
    }
  }

  // Has the theme's CSS actually landed? Asked ONCE per document, not per slide.
  //
  // Guard: don't render until the theme's CSS custom properties are actually
  // resolved. On the first tick in Marp's webview, getComputedStyle may return
  // empty strings for --diagram-* vars if the stylesheet hasn't been applied yet.
  // An empty primaryColor causes Mermaid to fall back to its built-in base
  // defaults (#fff4dd yellow), which cascades into yellow clusters and wrong
  // cScale values. Check one sentinel var — if it's empty, skip this tick (the
  // rAF retry will catch it next frame).
  //
  // `force=true` bypasses the sentinel after the rAF retry budget is exhausted.
  // Some preview environments (notably marp-vscode's webview) never expose theme
  // CSS vars to JS — the themed `<section>` is loaded but the cascade from a Marp
  // scoped rule does not propagate to `getComputedStyle` reads in the way the
  // file:// browser preview does. Without force, every diagram would stay forever
  // in data-mermaid-state=pending.
  //
  // ONE section answers for all of them, and that is not the slide-1 bug this
  // change fixes: an unapplied stylesheet is a DOCUMENT-wide condition, so if the
  // first section resolves nothing, none of them do. What was wrong before was
  // reading the PALETTE from slide 1, not probing readiness there. Latching means the
  // probe cost is paid once, not per pass.
  function themeSettled({ force = false } = {}) {
    if (globalScope.__llMermaidThemeSettled) return true;
    const scopeEl = document.querySelector('section') ?? document.documentElement;
    const haveTheme = !!getComputedStyle(scopeEl).getPropertyValue('--cat-1-fill').trim();
    if (!haveTheme && !force) return false;
    if (!haveTheme && force && typeof console !== 'undefined') {
      console.warn('[lattice-runtime] theme CSS vars not resolved after retry budget; proceeding with Mermaid defaults');
    }
    globalScope.__llMermaidThemeSettled = true;
    return true;
  }

  // The PALETTE OBJECT currently loaded into mermaid's global config, or null before
  // the first `initialize`. This replaced the `__llMermaidConfigured` one-shot: that
  // flag existed because `mermaid.initialize` is global and re-running it was assumed
  // to be the only alternative to configuring once — but "once per document" is exactly
  // what baked slide 1's ink into slide 9's diagram (#1332 step 3). Re-initializing per
  // RUN keeps the call count at one per band instead of one per diagram, and the render
  // queue below is what makes it safe.
  //
  // Compared BY IDENTITY, and on the palette rather than on the scope KEY. A key does
  // not imply a palette across passes: the kernel memoizes per walk, so a later pass
  // rebuilds the same key's palette from scratch — and it may resolve differently,
  // because the first pass can have run under `force` with the theme CSS unresolved, or
  // the host may have switched palette without changing any section's class. Keying on
  // the name would skip `initialize` and silently keep the stale palette. Within one
  // pass the memo returns the same object, so the redundant call is still skipped.
  let mermaidConfiguredVars = null;
  // The look the live mermaid config was last initialized with. Part of the
  // guard above because a run can share a palette with the previous one and
  // still need a different node renderer — a `mode: sketch` deck with one
  // `_class: boardroom` slide is exactly that, and without this the opted-out
  // slide would keep the hand-drawn shapes of the run before it.
  let mermaidConfiguredLook = null;

  // ── BEGIN PREVIEW INIT CONFIG ────────────────────────────────────────────────
  //
  // What this path sends `mermaid.initialize`, built FROM the shared non-palette
  // config (#1347). `engineInitConfig` always claimed to be "shared so the PDF path
  // and the runtime send Mermaid the same non-palette options, not just the same
  // colors" — and the runtime did not call it, so eight config keys diverged with no
  // gate anywhere: `DIVERGENT_KEYS` governs `themeVariables` only. The one that bit
  // was `flowchart.wrappingWidth` (480 here, Mermaid's 200 there), because wrapping
  // decides where a label breaks and a label break decides node WIDTH — a layout gap,
  // not an inset gap.
  //
  // Everything preview-only is now enumerated in ONE place, and
  // `test/unit/mermaid/init-config-parity.test.js` fails on an unlisted divergence AND
  // on a stale entry. Bracketed by sentinels because that gate lifts this block and
  // runs it — a paraphrase in the test would test the paraphrase.
  const PREVIEW_ONLY_CONFIG = {
    // We orchestrate rendering ourselves via mermaid.render() so we can attribute
    // success/failure per fence and surface the parse error to the user. A Mermaid
    // SECURE KEY, so it could not ride a %%{init}%% directive even if the PDF path
    // wanted it — and that path never runs Mermaid in a page anyway.
    startOnLoad: false,
    // STRICT — Mermaid's own default, and the PDF path has always had it because it
    // never overrides. The runtime was the one surface that opted OUT, and that
    // opt-out was a live XSS: with `loose`, a `click X "javascript:…"` directive
    // renders as `<a xlink:href="javascript:…">` inside the SVG, which the runtime
    // assigns straight to `innerHTML` below — clicking the node then executes it, in
    // the docs Studio's SAME-ORIGIN, un-sandboxed preview frame, which renders shared
    // and AI-generated decks (the HARD RULE #22 threat model: XSS there is
    // OpenRouter-key theft). Verified on the real Playground: the payload fired under
    // `loose` and does not under `strict`.
    //
    // The old comment claimed `loose` was "required to allow HTML (e.g. <br/>) in node
    // labels". That is not true on Mermaid 11 — `strict` still renders
    // `<p>first line<br>second line</p>` in a label (verified the same way). What
    // `strict` actually costs is Mermaid's `click` interactivity, which is the attack
    // vector itself and which no deck in this repo uses.
    //
    // A Mermaid SECURE KEY, so it is stated HERE and cannot be shared: `sanitize`
    // deletes it from anything that is not `initialize`, so putting it in
    // `engineInitConfig` would emit a key Mermaid silently drops and call it parity.
    securityLevel: 'strict',
    // We use mermaid.render() with try/catch and inject our own themed error block —
    // Mermaid's built-in error SVG (fixed 2412x512 viewBox) does not fit slide bounds.
    // Also a secure key.
    suppressErrorRendering: true,
    // NOTE: do NOT set `layout` here. Mermaid 11.x recognizes only "dagre" (built-in)
    // and "elk" (separate package). Any other value (e.g. "tidy-tree") makes Mermaid
    // throw "Unknown layout algorithm" mid-render, which `suppressErrorRendering:true`
    // then swallows silently — leaving certain diagram types (state, ER, class) with
    // `data-processed=true` but no SVG. Omitting the option lets each diagram pick its
    // native layout.
  };

  // The one NESTED divergence, kept separate because it has to be merged into the
  // shared `flowchart` block rather than replace it.
  const PREVIEW_ONLY_FLOWCHART = {
    // Render flowcharts at intrinsic size, not stretched to container.
    // useMaxWidth:true scales the SVG's viewBox to fit 100% width, which makes
    // small-viewBox diagrams blow up and large ones shrink — giving visually
    // inconsistent sizing across the deck. false = intrinsic pixel size; the
    // slide-level h2 handles the title (SVG title is suppressed by CSS in the slide
    // context but retained for exports).
    //
    // Deliberately NOT shared (DIVERGENT_CONFIG): inside `section.diagram`,
    // mermaid.css forces width/max-width/height with `!important` and this key cannot
    // be seen at all; OUTSIDE one it decides how an exported diagram is constrained,
    // so flipping the export would be a layout change carried in under a parity fix.
    useMaxWidth: false,
  };

  function previewInitConfig(themeVars, look) {
    const shared = engineInitConfig(themeVars, { look });
    return {
      ...shared,
      ...PREVIEW_ONLY_CONFIG,
      flowchart: { ...shared.flowchart, ...PREVIEW_ONLY_FLOWCHART },
    };
  }
  // ── END PREVIEW INIT CONFIG ──────────────────────────────────────────────────

  function configureForScope(mermaid, themeVars, look) {
    if (mermaidConfiguredVars === themeVars && mermaidConfiguredLook === look) return;
    mermaidConfiguredLook = look;
    // The palette rides the GLOBAL config, read from the active theme's CSS custom
    // properties AS THAT SLIDE RESOLVES THEM. Mermaid merges an author's in-source
    // `%%{init}%%` OVER this siteConfig per render (`updateCurrentConfig`), so a
    // directive that names layout/curve/renderer keeps every color it did not set —
    // the #1311 guarantee, for free, with no per-diagram injection. The PDF path
    // cannot do this (mmdc is a separate process, so its config has to travel in the
    // diagram source); that difference is delivery, not policy.
    mermaid.initialize(previewInitConfig(themeVars, look));
    mermaidConfiguredVars = themeVars;
  }

  let renderCounter = 0;
  // Caches already-rendered Mermaid SVGs by their exact source string so that
  // fences whose source did not change between re-renders skip mermaid.render()
  // entirely and inject the cached SVG instead. Key benefit: when Marp replaces
  // a <section> wholesale on every keystroke (producing new, unmarked <pre>
  // elements for all fences in the deck), only the fence whose source actually
  // changed calls mermaid.render(); all others get their SVG from this cache.
  //
  // Cache key is the SCOPE KEY plus the raw source string (trimmed) — see
  // `diagramCacheKey`. It was the source alone until #1332 step 3, which is only
  // sound while every diagram in the deck is baked from one palette: the moment
  // ink is per slide, the SAME diagram source on a light slide and on a
  // `_class: dark` slide resolves to two different SVGs, and a source-only key
  // hands the second slide the first one's baked ink — reintroducing the very
  // mismatch step 3 exists to remove, from the cache instead of from the config.
  // No size bound is needed for a single editor session; the number of distinct
  // (scope, diagram) pairs in a deck is small.
  //
  // Not used when mermaid.render() fails — errors are never cached so that a
  // fix to a broken diagram is retried on the next edit.
  //
  // Theme-change caveat: themeVariables are baked into the SVG at render time.
  // If the author switches themes without reloading the preview, stale SVGs from
  // the cache would show the old theme colours. This is acceptable because theme
  // switches require a manual preview reload in marp-vscode anyway. (A per-slide
  // `_class:` EDIT is not that case and is handled: it changes the section's class
  // list, so it changes the scope key, so it misses the cache and re-renders.)
  const mermaidSvgCache = new Map();

  // Cached front-matter-derived config for the deck-wide `meta:`/`logo:`/
  // `class:`(+finish/mode/claim/stamp/tone/spectrum) registers — each is
  // populated once, on the first successful source-`.md` fetch, then
  // idempotently RE-APPLIED from runAllContentTransforms on every later pass
  // (mirrors how #837 moved the progress/watermark Tiles into the recurring
  // pass, instead of firing once at boot). Without this, a live edit that
  // makes Marp replace a slide's <section> wholesale rebuilds a fresh, empty
  // `.masthead-bay` / logo-less / backdrop-less section that a one-shot
  // injector never revisits — so previously-shown deck-wide chrome can go
  // silently missing after any later edit, even though the fetch itself
  // already succeeded once.
  let cachedMastheadMeta = null;
  let cachedDeckLogoConfig = null;
  let cachedDeckClassConfig = null;
  // Has the deck's front matter resolved (or failed to) at least once? That is
  // the point from which every deck-wide register is on the section, and so the
  // point from which the DEFAULT-component rule may safely read the resolved list
  // and stamp. It is NOT the same question as
  // `cachedDeckClassConfig !== null`, which stays null for a deck that declares no
  // deck-wide register at all — gating on that would leave the default permanently
  // unstamped on the plainest decks there are.
  let deckFrontMatterSettled = false;

  // The deck's front matter, resolved ONCE for all three deck-wide registers
  // below (class/finish/mode/…, logo, meta) — they used to each fetch the same
  // `.md` separately, three requests for one answer.
  //
  // Two sources, in order:
  //   1. the BAKED block an Export-to-Marp bundle carries
  //      (lib/core/deck-front-matter.js). No network, so it is the only source
  //      that works over `file://` — which is how a recipient double-clicking
  //      `<name>.html` AND marp-cli rendering the PDF both load the deck.
  //   2. fetching the source `.md` beside the document, for a deck served over
  //      http(s) whose export predates the bake. Still blocked in the
  //      `vscode-webview://` sandbox, which no-ops as before.
  let deckFrontMatterPromise = null;
  // The BAKED front matter, synchronously — the block is in the DOM before the
  // first transform pass, so a register that has to be known BEFORE anything is
  // stamped (today: `form: off`) can read it without waiting on a promise. Stays
  // null on the fetch path, where nothing is knowable that early.
  let bakedFrontMatter = null;

  function deckFrontMatterSource() {
    if (deckFrontMatterPromise) return deckFrontMatterPromise;
    const baked = typeof document !== 'undefined' ? readBakedFrontMatter(document) : null;
    if (baked !== null) {
      bakedFrontMatter = baked;
      deckFrontMatterPromise = Promise.resolve(baked);
      return deckFrontMatterPromise;
    }
    if (typeof fetch === 'undefined' || typeof window === 'undefined' || !window.location?.href) {
      deckFrontMatterPromise = Promise.resolve(null);
      return deckFrontMatterPromise;
    }
    const url = window.location.href.replace(/[?#].*$/, '');
    const mdUrl = url.replace(/\.html?$/i, '.md');
    if (mdUrl === url) { // not an .html→.md mapping (e.g. webview://)
      deckFrontMatterPromise = Promise.resolve(null);
      return deckFrontMatterPromise;
    }
    deckFrontMatterPromise = fetch(mdUrl)
      .then((r) => (r.ok ? r.text() : null))
      .then((src) => (src ? readFrontMatterBlock(src) || null : null))
      .catch(() => null); // fetch blocked / 404 / sandbox — no-op
    return deckFrontMatterPromise;
  }

  /**
   * The baked front matter as a DECK-SHAPED string (`---\n…\n---\n`), or '' — the
   * shape the shared readers that take a whole deck source expect (`readFormMode`,
   * `metaTile.readFrontMatter`), so they parse it exactly as they parse a real deck.
   */
  function latticeFrontMatterDoc(fm = bakedFrontMatter) {
    return fm ? `---\n${fm}\n---\n` : '';
  }

  /**
   * The deck's Form mode — `off` only when a BAKED front matter says so.
   *
   * The `standard` default is load-bearing: `readFormMode` answers `'off'` for an
   * EMPTY string (its contract is "no source, no Form"), so passing it the empty
   * doc a non-exported document produces would switch the Form default off
   * everywhere the runtime runs — the docs Playground, a live preview, every
   * surface with no block to read. Only an actual `form: off` may turn it off.
   */
  function deckFormMode() {
    return bakedFrontMatter ? readFormMode(latticeFrontMatterDoc()) : 'standard';
  }

  /**
   * The export's overflow-marker level, or `fallback` when nothing says.
   *
   * Read from the EXPORT SETTINGS block (lib/core/export-settings.js), which an
   * export producer writes and nothing else does — so a document carrying one IS an
   * exported artifact, and a document without one is a live preview / Studio /
   * published page. That is why no fallback needs to be passed on the main boot
   * path: the presence of the block decides the surface, and the surfaces want
   * different answers (an authoring surface shows the authoring signal, because you
   * are the one fixing the deck).
   *
   * Deliberately NOT the deck's front matter. The level is a property of the render
   * target, not an authoring fact — one deck source is previewed, exported, and
   * printed, and the same question has three different correct answers decided by
   * which command you ran. It shipped as a front-matter register for one commit and
   * was moved (engineering/decisions/2026-07-30-overflow-marker-register.md).
   *
   * Resolved once and memoized: `readExportSettings` REMOVES the block it reads, so
   * a second call would find nothing and silently answer the authoring default.
   */
  let exportSettings;
  /**
   * Is this document a SPECIMEN — a rendering of a CATALOG SAMPLE that the author did
   * not write and cannot edit, shown so they can pick one?
   *
   * Opt-in via `<html data-lattice-specimen>`, the same root-attribute idiom as
   * `data-lattice-fluid-capable`: one producer sets it (the Studio's add-slide gallery,
   * through `SlideThumbFace`), nothing else does, and every other surface — the VS Code
   * preview, the HTML player, an Export-to-Marp bundle, the Studio's own full-size
   * preview — is byte-identical to before.
   *
   * IT IS NOT "IS THIS A THUMBNAIL", and the first cut of this got that wrong. It was
   * called `isThumbnailDocument` and `SlideThumbFace` set it unconditionally, which
   * silenced the watcher in Present's slide overview and Reshape's variant tiles too —
   * and those show the AUTHOR'S OWN SLIDES. Measured on the real Studio: an overflowing
   * slide read `rings=1, tabs=1` in the main preview and `rings=0, tabs=0` on the same
   * slide's overview tile. The whole-deck overview is exactly where an author scans for
   * a clipped slide, so that was a self-inflicted regression on a surface that worked
   * before (HARD RULE #18), shipped behind a justification written only about the
   * gallery. The predicate had to be named for the thing that actually decides —
   * WHOSE CONTENT IS THIS — not for the size of the box it is drawn in.
   *
   * WHY A SPECIMEN WANTS NOTHING WATCHED. Two reasons, and the second is the one that
   * scales:
   *
   *   · The signal has no addressee. It is unreadable at ~260px, and it describes a
   *     CATALOG SAMPLE the author neither wrote nor can fix — measured on the shipped
   *     gallery, the `image` tile painted an "Overflows" tab and `state-chart` /
   *     `quadrant` painted type-floor alarms.
   *   · The cost is per-DOCUMENT, so it multiplies by the grid. Be exact about what that
   *     cost IS, because the first draft of this comment overstated it and a false cost
   *     claim in a comment shapes the next optimization (the same warning drawTags carries).
   *     The watcher installs NO observer of its own: it registers `check` with
   *     `schedulePostMutation`, and that facility's shared MutationObserver + resize
   *     listener are installed by whichever caller comes first — which is
   *     `patchSectionGeometry()` above, deliberately kept. The observer count is therefore
   *     identical either way. What a specimen stops paying is the `check` PASS, on every
   *     dispatch of that shared rAF: a cell-aware geometry probe, a text-rect walk over
   *     anything that clips, drill-down culprit resolution and `drawFixMeTags` — all
   *     layout-forcing — plus the one `scroll` listener `drawFixMeTags` binds per document.
   *     Once per frame, across every one of the ~33 frames a scrolled gallery holds open
   *     (the budget in slide-thumb.tsx).
   *
   * WHY `off` AND NOT A BYPASS. This reads like it wants an early `return` past
   * `startOverflowWatcher`, and the first cut of it was exactly that. It is the wrong
   * shape, because `off` ALREADY means "install nothing" in this runtime — read the
   * `if (!policy.mark)` branch: it sweeps, stamps, and returns before any probe,
   * observer, or resize handler exists. (Note that lib/core/resolve-overflow-marker.js's
   * header says the probe "always runs" at `off`. That is true of the CLI/export
   * contract it documents, and NOT of this watcher; the sentence is about who is told,
   * not about what executes here.) So a bypass would add a second, parallel way to be
   * silent — with strictly less behavior than the one already tested, since it would
   * skip the sweep of any pre-existing mark and skip the stamp the CSS suppression keys
   * on. Routing to the existing level is HARD RULE #15: reuse, don't reinvent.
   *
   * SCOPE, deliberately narrow: this changes ONLY the overflow/legibility watcher.
   * `patchSectionGeometry()` above still runs — its `--_sec-1cqi` / `--_sec-1cqh`
   * stamps and `data-orientation` are load-bearing for portrait sizes and every
   * container-query reflow, so a specimen that skipped them would render DIFFERENTLY
   * from the component it depicts, which is a worse defect than the one being fixed.
   */
  function isSpecimenDocument() {
    return typeof document !== 'undefined' && !!document.documentElement?.hasAttribute('data-lattice-specimen');
  }

  function deckOverflowMarker(fallback) {
    if (exportSettings === undefined) {
      exportSettings = typeof document !== 'undefined' ? readExportSettings(document) : null;
    }
    const base = fallback
      || (exportSettings === null ? AUTHORING_DEFAULT_MARKER : EXPORT_DEFAULT_MARKER);
    return resolveOverflowMarker(exportSettings?.overflowMarker, base);
  }


  /** Run `apply(frontMatterYaml)` once the deck's front matter is available. */
  function withDeckFrontMatter(apply) {
    deckFrontMatterSource().then((fm) => { if (fm) apply(fm); }).catch(() => { /* no-op */ });
  }

  /**
   * Run `apply()` after every `withDeckFrontMatter` continuation registered BEFORE
   * this call has run — whether or not the deck actually has front matter.
   *
   * `withDeckFrontMatter` defers on a promise, so a plain statement written after a
   * call to it still executes FIRST. That bit the default-component pass: it ran
   * before deck-class propagation, and a deck with `class: kpi` plus a class-less
   * slide ended up `content … kpi` — two component classes on one section, where
   * the engine path emitted just `kpi`. Source order is not execution order, so the
   * ordering has to be stated instead of implied.
   *
   * That exact deck can no longer be written — a component name in the deck-wide
   * `class:` is refused at the boundary now (lib/core/deck-class-register.js), which
   * is why this sequencing is kept rather than relied on: it is what puts EVERY
   * deck-wide token on the section before any pass reads the resolved list, and the
   * next pass to depend on one should not have to rediscover the promise ordering.
   *
   * Registration order is what makes this work: `deckFrontMatterSource()` memoizes
   * a single promise, so continuations run in the order they were attached. Unlike
   * `withDeckFrontMatter` this one fires on the empty case too, which is exactly
   * the deck the default-component rule exists for.
   */
  function afterDeckFrontMatter(apply) {
    deckFrontMatterSource().then(() => apply(), () => apply());
  }

  // Runs every non-Mermaid DOM transform. Called from initAndRun (every
  // scheduled re-render), from bootstrap before the Mermaid wait, and
  // previously from the now-removed glossary/chart observers.
  // Ordering matters: transformSlotLabels must precede transformSplitCompare.
  function runAllContentTransforms() {
    // NOTE: heading-period normalization (strip + add) is a render-time
    // markdown-it concern — applied by lib/integrations/markdown-it/plugins.js via
    // the engine and the playground bundle (lib/playground/index.js), so
    // the DOM the runtime sees is already normalized. The previous
    // transformStripHeadingPeriods()/transformAddHeadingPeriods() calls here
    // referenced functions that never existed in this runtime; the resulting
    // ReferenceError aborted this whole pass (Mermaid/charts/badges never ran).
    //
    // Form default FIRST: stamp `data-lattice-slide` + the `form` class on every
    // eligible top-level slide so the registry's masthead-lift (below) and the
    // progress/watermark Tiles see the class the engine would have added at render
    // time. Idempotent + per-section, so an already-formed export re-render is a
    // no-op. Must precede applyAllToDom (masthead-lift keys on `section.form`).
    // Resolve the deck's front matter FIRST — memoized, so a no-op after the first
    // pass. It has to precede applyFormDefaultToDom because the deck-wide
    // `form: off` opt-out decides whether that stamps the `form` class at all, and
    // on the export path the answer is available synchronously (the block is in
    // the DOM). It also takes the consumed block out of the document before
    // anything copies or serializes slide HTML.
    deckFrontMatterSource();
    // CLASSES BEFORE THE TRANSFORMS THAT READ THEM. These two used to run near the END of
    // the pass, beside the logo/meta re-injectors, and that was a real bug rather than an
    // ordering nicety: every class-keyed transform in between — the whole `applyAllToDom`
    // registry, below-note among them — read each section BEFORE its deck-wide tokens had
    // landed, and most of those transforms are idempotent, so a wrapper built on the first
    // pass from the wrong class list is never unbuilt on a later one.
    //
    // Measured: on a deck declaring `class: no-note`, a slide carrying its own `_class:
    // content` still had its trailing paragraph promoted to a below-note — the token was on
    // the section by the time anyone looked, but not by the time below-note ran. (A slide
    // with NO `_class:` was correct, because Marpit applies the deck-wide class natively
    // there and the propagation had nothing to re-add.) Same shape for any deck-wide
    // register a transform keys on, which is why the fix is the ordering rather than a
    // special case for one token.
    //
    // Both are idempotent and both are no-ops until the front matter resolves, so hoisting
    // them costs a pass nothing. They stay in this order for the reason the bootstrap
    // comment gives: the default-component rule reads the RESOLVED class list, so every
    // deck-wide token must be on the section before it decides what the slide names.
    applyCachedDeckClass();
    if (deckFrontMatterSettled) applyDefaultComponent();
    // `form: off` is honored only from the BAKED front matter: it must be known
    // before the first stamp, and the fetch path can't answer that early. An older
    // export served over http(s) therefore keeps the pre-existing behavior.
    applyFormDefaultToDom(document, { mode: deckFormMode() });
    transformVerdictGridBadges();
    transformObligationMatrixBadges();
    // matrix-grid's bracket-marker cells — the third member of the badge/state/
    // cell family, and the one that had no mirror until #1256, so its swatches
    // came out of a Marp render as literal `[x]` / `[-]` / `[ ]` text. Kernel:
    // lib/core/matrix-grid-cells.js (shared with the markdown-it plugin).
    matrixGridCells.applyToDom(document);
    // The glossary slide's list→table conversion + range pill. Engine-only until
    // #1256, so an exported deck's generated Glossary arrived as a bare bullet
    // list. Kernel: lib/core/glossary-slide.js (shared with the two plugins).
    glossarySlide.applyToDom(document);
    transformChecklistItemStates();
    transformSlotLabels();
    // Registry-managed DOM transforms — split-panels, roadmap, journey,
    // word-cloud, chart-family. All five layout-transform groups
    // dispatch from one registry call; the runtime is no longer the
    // canonical home for any of them.
    sharedTransformerRegistry.applyAllToDom(document);
    // The progress + watermark Tiles dock AFTER masthead-lift (just above, inside
    // applyAllToDom) so the `.cell-stage`/`.cell-footer` cells exist first — the
    // rail docks INTO the footer Cell beside the page number (flex cell-tree §6),
    // never swept into the stage. Both are idempotent (guarded on their marker) and
    // no-op without dividers, so re-running them on every transform pass keeps a
    // live-edited preview's rail/watermark in sync (they used to run once at boot
    // and miss slides added after load).
    progressTile.applyToDom(document);
    watermarkTile.applyToDom(document);
    // The image component's text panel — the engine's `applyImageStructure` runs at
    // the same point (after the registry pass and the Tile injectors), and the
    // `![bg]` → `.lattice-bg` lift it pairs with is baked into the exported deck by
    // tools/export-marp.js. Without both halves an `image` slide came out of a Marp
    // render with the photo full-bleed and the prose unscrimmed on top of it.
    bgImage.wrapImageTextToDom(document);
    // Deck-wide meta/logo/class(+finish/mode/claim/stamp/tone/spectrum)
    // registers — cheap, idempotent no-ops until their one-shot source-`.md`
    // fetch (triggered once from bootstrap()) resolves; once it has,
    // re-applying on every pass keeps them from going silently missing after a
    // live edit rebuilds a fresh masthead-bay / logo-less / backdrop-less
    // section (see the cache declarations above this function).
    applyCachedMastheadMeta();
    applyCachedDeckLogo();
    // The deck-wide CLASS and the DEFAULT-component rule are the other two members of this
    // family, and they are applied at the TOP of this function instead of here — see the
    // comment there. They have to precede every class-keyed transform, not follow them.
    // state-chart is browser-measured: chart-family emits HTML nodes + an
    // empty SVG overlay above; this measures the laid-out nodes and draws
    // the edges/markers. Idempotent (re-runs on each transform pass).
    try { stateChartLayout.installStateChartLayout(document); } catch (_e) { /* no-op */ }
    // LAST, and that position is the requirement rather than a preference: the
    // marker berth has to be a DIRECT CHILD of the section, and the Form
    // composition above sweeps everything from the masthead band to the end of
    // the slide into `.cell-stage`. Berthing earlier would bury the marker inside
    // the very box it reports on. Mirrors the engine's own call site, which sits
    // after the same transforms for the same reason (lib/engine/index.js).
    fitBerth.applyToDom(document);
  }

  function initAndRun({ force = false } = {}) {
    runAllContentTransforms();
    const mermaid = globalScope.mermaid;
    // Guard against stub `window.mermaid` (e.g. bierner.markdown-mermaid in
    // VS Code's plain markdown preview, which exposes a render-blocks-only
    // shim without .initialize/.render). Without this check, scheduleRun
    // from the MutationObserver could re-enter configureForScope with the
    // stub and throw "mermaid.initialize is not a function".
    if (!mermaid || typeof mermaid.initialize !== "function" || typeof mermaid.render !== "function") {
      return false;
    }

    wrapFences();
    if (!themeSettled({ force })) return false;

    // A pre is "pending" until mermaid.render() resolves into its sibling
    // target or we attach an error sibling. Re-running initAndRun is a no-op
    // for handled fences because we filter on data-mermaid-state.
    const FENCE_SELECTOR = [
      'pre[data-mermaid-state="pending"]',
      'marp-pre[data-mermaid-state="pending"]',
    ].join(",");
    // BUILD THE DECK, THEN LET THE KERNEL WALK IT (#1332 step 4). This path supplies
    // three capabilities and no policy: read a token for a slide (`getComputedStyle`
    // on its section — CSS inheritance has already applied that slide's own classes),
    // name the palette a slide resolves (`diagramScopeKey`), and render one diagram
    // (`mermaid.render`). Which slides exist, which palette each resolves, and when to
    // rebuild it are the kernel's, shared with the PDF path.
    //
    // A DOM section IS this path's scope, where the PDF path's is a resolved band.
    // That difference is the whole port; everything else used to be written twice.
    const fences = [];
    for (const preEl of document.querySelectorAll(FENCE_SELECTOR)) {
      const codeEl = preEl.querySelector(":scope > code");
      const target = preEl.nextElementSibling?.classList.contains("mermaid")
        ? preEl.nextElementSibling
        : null;
      if (!codeEl || !target) continue;
      const sectionEl = codeEl.closest('section');
      // Reorient a LR/RL flowchart to TB/BT on a portrait slide so it flows down
      // the tall frame — matches the emulator's PDF path (lib/integrations/mermaid/
      // reorient.js). The section's data-orientation is stamped by
      // patchSectionGeometry; absent (landscape) → source is unchanged.
      const orientation = sectionEl?.getAttribute('data-orientation') || 'landscape';
      const source = reorientMermaidForPortrait((codeEl.textContent || "").trim(), orientation);

      // Cache hit: this (scope, source) pair was rendered earlier this session —
      // reuse the SVG directly and skip mermaid.render() entirely. This is the
      // common case when Marp replaces sections wholesale on every keystroke: only
      // the fence whose source actually changed gets a fresh render call. Handled
      // BEFORE the deck is built so an unchanged deck reaches the kernel empty and
      // never reconfigures mermaid at all.
      const cachedSvg = mermaidSvgCache.get(diagramCacheKey(diagramScopeKey(sectionEl), source));
      if (cachedSvg) {
        target.innerHTML = cachedSvg;
        preEl.dataset.mermaidState = "rendered";
        continue;
      }

      // Mark in-flight so a re-entrant scheduleRun does not double-dispatch. Set
      // BEFORE the queue drains, because the queue is async and the observer is not.
      preEl.dataset.mermaidState = "rendering";
      fences.push({ preEl, target, source, sectionEl });
    }
    if (!fences.length) return true;
    // ONE ENTRY PER SLIDE. Grouped by the shared kernel rather than inline, because
    // *which slide does this diagram belong to* is the decision the whole per-slide bake
    // rests on — and inline it was gated only by a source-text match, which a collapse
    // back to a single entry (the slide-1 bake) passes. See groupDiagramsBySlide.
    const deck = groupDiagramsBySlide(fences);

    // Every fence the walk actually handed to the queue, so a mid-walk throw can reset
    // exactly the ones that did NOT make it.
    const dispatchedFences = [];
    try {
      renderDiagrams(deck, {
        ...diagramThemePorts(),
        beginRun: ({ scope, themeVars }) => beginDiagramRun(mermaid, themeVars, lookForSection(scope)),
        renderOne: (job, _themeVars, meta) => {
          dispatchedFences.push(job.preEl);
          return enqueueDiagramJob(mermaid, meta.scopeKey, job);
        },
      });
    } catch (err) {
      // A throw mid-walk would otherwise be PERMANENT: every fence was stamped
      // `rendering` before the walk, and the pending-fence selector above only picks up
      // `pending` — so nothing would ever retry them and those slides would sit blank for
      // the session. Hand the un-dispatched ones back to `pending`.
      //
      // ONLY the un-dispatched ones. A fence whose run was already opened is on the queue
      // and will still render; resetting it too would have the next pass render it a
      // SECOND time — same output, twice the work, two `mermaid.render` calls.
      const enqueued = new Set(dispatchedFences);
      for (const slide of deck) {
        for (const job of slide.diagrams) {
          if (enqueued.has(job.preEl)) continue;
          if (job.preEl.dataset.mermaidState === 'rendering') job.preEl.dataset.mermaidState = 'pending';
        }
      }
      if (typeof console !== 'undefined') console.warn('[lattice-runtime] diagram walk failed; will retry', err);
    } finally {
      // Each reader holds a probe <span> in the document. The kernel's walk is
      // synchronous, so this is provably after the last read — and it must run even on
      // a throw, or a failed pass leaves probe elements inside slides.
      closeSectionReaders();
      endDiagramRuns();
    }
    return true;
  }

  // ── THE RENDER QUEUE — one chain, so `mermaid.initialize` for band B can never
  // land between band A's render calls. ───────────────────────────────────────────
  //
  // Mermaid holds its config in module state and `mermaid.render` takes none, so
  // per-slide themeVariables are only correct if configure→render→configure is
  // strictly ordered. Before #1332 step 3 the config was written once and every
  // render was dispatched concurrently; now the configure is per band, and concurrent
  // dispatch across bands would let a render read the NEXT band's palette.
  // Serializing per RUN rather than per DIAGRAM keeps the concurrency that mattered:
  // within a run the config is identical, so its diagrams still render in parallel
  // exactly as they always did, and a single-band deck (almost every deck) is one
  // batch just like before.
  //
  // The kernel walks SYNCHRONOUSLY, which is what makes this safe without the kernel
  // telling us how many diagrams a run holds: every `enqueueDiagramJob` of a run has
  // pushed its thunk before the link `beginDiagramRun` opened can run.
  let diagramQueue = Promise.resolve();
  let currentRunJobs = null;
  function beginDiagramRun(mermaid, themeVars, look) {
    const jobs = [];
    const fences = [];
    currentRunJobs = { jobs, fences };
    diagramQueue = diagramQueue
      .then(() => {
        configureForScope(mermaid, themeVars, look);
        // allSettled, NOT all. `Promise.all` settles on the FIRST rejection, so a run
        // whose second diagram failed would hand control to the next link — and the next
        // link's `mermaid.initialize` while band A's other renders were still in flight,
        // which is the #1326 ink/chip mismatch arriving through the queue. Every job also
        // resolves rather than rejects (renderDiagramJob), so this is belt and braces: the
        // ordering guarantee this chain exists for must not have a failure path.
        return Promise.allSettled(jobs.map((run) => run()));
      })
      // A run must not poison the chain for later runs: every job already handles its
      // own failure, and `configureForScope` throwing (a stub mermaid slipping past the
      // guard) would otherwise leave every later band permanently unrendered.
      //
      // But swallowing it silently was its own defect: the fences were stamped
      // `rendering` before the walk and the pending-fence selector only picks up
      // `pending`, so a run that failed HERE left those diagrams blank for the session
      // with nothing to retry them and no diagnostic. Hand them back to `pending` and say
      // so. (On the pre-#1332 path this could not happen: `ensureConfigured` threw
      // synchronously BEFORE any fence was marked, so the retry budget covered it.)
      .catch((err) => {
        for (const preEl of fences) {
          if (preEl.dataset.mermaidState === 'rendering') preEl.dataset.mermaidState = 'pending';
        }
        if (typeof console !== 'undefined') console.warn('[lattice-runtime] diagram run failed; will retry', err);
      })
      .then(pinMermaidTooltip);
  }

  function enqueueDiagramJob(mermaid, scopeKey, job) {
    // A `renderOne` with no run open would render against whatever config happened to be
    // live. The kernel always calls `beginRun` first, so this is a guard against a future
    // edit — and it is a LIVE guard rather than dead code because `endDiagramRuns()`
    // clears the handle at the end of every walk. Left un-cleared it was permanently
    // non-null after the first pass, which made the branch unreachable and its promise
    // false: a stray job would have been pushed onto an already-drained array and never
    // executed, stranding that fence at `rendering`.
    if (!currentRunJobs) beginDiagramRun(mermaid, {});
    currentRunJobs.jobs.push(() => renderDiagramJob(mermaid, scopeKey, job));
    currentRunJobs.fences.push(job.preEl);
  }

  /** Close the walk: no run is open, so a later stray `renderOne` cannot append to one. */
  function endDiagramRuns() {
    currentRunJobs = null;
  }

  // A cap on ONE diagram's render, so the queue can always advance.
  //
  // The single chain is what orders configure→render→configure, and that made a
  // never-settling `mermaid.render` catastrophic rather than local: the link would never
  // resolve, so every later band AND every later pass queued behind it forever — with
  // those fences stamped `rendering`, which the pending-fence selector does not re-select,
  // and no diagnostic, because a `.catch` never runs for a promise that merely hangs.
  // Before the chain existed each fence had its own independent promise, so a hung render
  // hung only itself. This restores that blast radius without giving up the ordering.
  //
  // Not hypothetical: `mermaid.render` awaits dynamic imports and, for architecture / C4,
  // an external icon-pack fetch. A STALLED fetch — not a rejected one — in a webview or an
  // offline Studio frame produces exactly this promise. 20 s is far past any real render
  // (they finish in milliseconds), so a healthy deck never reaches it.
  const RENDER_SETTLE_CAP_MS = 20000;

  /** `attachError` must not be able to reject a job — see the allSettled note above. */
  function attachErrorSafely(preEl, target, err) {
    try {
      attachError(preEl, target, err);
    } catch (e) {
      preEl.dataset.mermaidState = "error";
      if (typeof console !== 'undefined') console.warn('[lattice-runtime] could not attach a diagram error block', e);
    }
  }

  function renderDiagramJob(mermaid, scopeKey, { preEl, target, source }) {
    const id = `lattice-mermaid-${++renderCounter}`;
    // Resolves ALWAYS, and exactly once — on success, on failure, or on the cap.
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => { settled = true; resolve(); };
      const timer = setTimeout(() => {
        if (settled) return;
        attachErrorSafely(preEl, target, new Error(`Mermaid render did not settle within ${RENDER_SETTLE_CAP_MS}ms`));
        finish();
      }, RENDER_SETTLE_CAP_MS);
      Promise.resolve()
        .then(() => mermaid.render(id, source))
        .then((result) => {
          // A render that settles AFTER the cap must not write. The queue has moved on, so
          // mermaid's global config now holds a LATER band's palette and this SVG was baked
          // against it — injecting it would put another slide's ink on this one.
          if (settled) return;
          // Mermaid may resolve with `undefined` if it failed silently in
          // older versions. Treat absence-of-svg as an error.
          const svg = result?.svg;
          if (!svg) {
            attachErrorSafely(preEl, target, new Error("Mermaid produced no SVG"));
            return;
          }
          mermaidSvgCache.set(diagramCacheKey(scopeKey, source), svg);
          target.innerHTML = svg;
          if (result.bindFunctions) {
            try { result.bindFunctions(target); } catch (_e) { /* non-fatal */ }
          }
          preEl.dataset.mermaidState = "rendered";
        })
        .catch((err) => { if (!settled) attachErrorSafely(preEl, target, err); })
        .then(() => {
          if (settled) return;
          clearTimeout(timer);
          finish();
        });
    });
  }

  // Mermaid appends `<div class="mermaidTooltip">` to document.BODY the first time
  // it draws a flowchart — outside the deck root, outside every <section>.
  //
  // It is `position:absolute` with NO `top`/`left`, so it sits at its static
  // position: after the last slide. Empty and ~6px tall, but real scrollable
  // overflow, and in print that pushes document height past the deck's own and
  // Chrome spills ONE MORE SHEET. Every export of a deck containing a flowchart
  // ended on a blank page (measured on dist/marp-kit: 13 sections, body 7800px,
  // document 7806px, 14 pages).
  //
  // PIN IT, DO NOT REMOVE IT. `position:fixed` takes the node out of scrollable
  // overflow entirely — the extra sheet goes away — while leaving it in the DOM
  // and fully functional. That distinction is the whole point: Mermaid's
  // `setupToolTips` captures this exact node in a closure (`let r = createTooltip()`)
  // during `bindFunctions()`, and its `mouseover` handler writes into `r`. An
  // earlier revision of this function REMOVED the node, which left every hover
  // writing into a detached div — so `click A "url" "tooltip"` silently did
  // nothing on every interactive surface (the Playground, the Studio preview, the
  // HTML player, `marp --html` opened in a browser) to fix a symptom that only
  // exists in print. Verified by dispatching a real mouseover in Chromium: the
  // tooltip was reachable before that change, unreachable after, and reachable
  // again now.
  //
  // It also cannot be fixed from theme CSS, which is the obvious first instinct:
  // Marpit SCOPES theme rules to the deck root, so an unscoped
  // `.mermaidTooltip{position:fixed}` in lattice.css is rewritten to a selector
  // that can never match a body-level node. An inline style is not scoped, which
  // is why this is set on the element. Idempotent — safe after every render.
  function pinMermaidTooltip() {
    if (typeof document === "undefined") return;
    for (const el of document.querySelectorAll("body > .mermaidTooltip")) {
      el.style.position = "fixed";
      el.style.top = "0";
      el.style.left = "0";
    }
  }

  function attachError(preEl, target, err) {
    preEl.dataset.mermaidState = "error";
    // Strip any partial render Mermaid may have written into the SVG target.
    if (target) target.innerHTML = "";

    // Idempotent: don't append a second error block if scheduleRun fires twice.
    let errEl = null;
    const scan = target ? target.nextElementSibling : preEl.nextElementSibling;
    if (scan?.classList.contains("mermaid-error")) errEl = scan;
    if (!errEl) {
      errEl = document.createElement("div");
      errEl.className = "mermaid-error";
      errEl.setAttribute("role", "status");
      (target || preEl).insertAdjacentElement("afterend", errEl);
    }
    const message = (err && (err.message || err.str || String(err))) || "Mermaid render failed";
    // First line is the headline; the rest (if any) goes into a <pre>.
    const [headline, ...rest] = String(message).split("\n");
    errEl.innerHTML = "";
    const label = document.createElement("strong");
    label.className = "mermaid-error-label";
    label.textContent = "Mermaid error";
    errEl.appendChild(label);
    const msg = document.createElement("span");
    msg.className = "mermaid-error-msg";
    msg.textContent = headline;
    errEl.appendChild(msg);
    if (rest.length > 0) {
      const detail = document.createElement("pre");
      detail.className = "mermaid-error-detail";
      detail.textContent = rest.join("\n");
      errEl.appendChild(detail);
    }
  }

  /**
   * Universal state-token marker decoder — shared by transformVerdictGridBadges,
   * transformObligationMatrixBadges, and transformChecklistItemStates.
   * Maps a single-char marker to the semantic + shape classes that the
   * universal CSS recipe paints. Sibling implementations in
   * the engine and the runtime must stay in sync.
   *
   *   [x] → pass + state-full     (filled disc)
   *   [-] → warn + state-half     (half-filled disc)
   *   [ ] → fail + state-empty    (outline disc)
   *   [/] → skip + state-slashed  (filled disc + diagonal slash)
   */
  function stateClassesFor(marker, neutralEmpty = false) {
    if (marker === 'x') return { sem: 'pass', shape: 'state-full' };
    if (marker === '-') return { sem: 'warn', shape: 'state-half' };
    if (marker === '/') return { sem: 'skip', shape: 'state-slashed' };
    // `[ ]` is neutral "todo / pending" in checklist/obligation/roadmap, but
    // "not met" in verdict-grid — neutralEmpty picks the open-ring treatment.
    return neutralEmpty
      ? { sem: 'todo', shape: 'state-todo' }
      : { sem: 'fail', shape: 'state-empty' };
  }

  /**
   * Transforms verdict-grid badge items in VS Code preview (no Marp plugin).
   * Finds [x]/[-]/[ ]/[/] prefixed li items inside section.verdict-grid (and
   * section.pricing, which shares the nested-card-with-badges shape — per-tier
   * feature rows), strips the prefix, and wraps the label in
   * <span class="badge {sem} {shape}">. Idempotent — skips li items that
   * already contain a .badge span.
   */
  function transformVerdictGridBadges() {
    if (typeof document === 'undefined') return;
    for (const section of document.querySelectorAll('section.verdict-grid, section.pricing')) {
      for (const outerLi of section.querySelectorAll(':scope > ul > li')) {
        const innerUl = outerLi.querySelector(':scope > ul');
        if (!innerUl) continue;
        const innerItems = [...innerUl.children];
        // Last item is body text — skip it; all others are badge items
        const badgeItems = innerItems.slice(0, -1);
        for (const li of badgeItems) {
          if (li.querySelector('.badge')) continue; // already transformed
          const text = li.textContent.trim();
          const m = /^\[([x\-/ ])\]\s*(.*)$/.exec(text);
          if (!m) continue;
          const { sem, shape } = stateClassesFor(m[1]);
          li.innerHTML = `<span class="badge ${sem} ${shape}">${m[2]}</span>`;
        }
      }
    }
  }

  /**
   * Transforms obligation-matrix table cells in VS Code preview (mirrors
   * the Marp plugin). Finds [x]/[-]/[ ]/[/] in <td> cells inside
   * section.obligation-matrix, strips the marker, and wraps any trailing
   * label in <span class="state {sem} {shape}">. CSS draws the universal
   * state token (coloured disc + shape mask). Idempotent — skips cells
   * already containing a .state span.
   */
  function transformObligationMatrixBadges() {
    if (typeof document === 'undefined') return;
    for (const section of document.querySelectorAll('section.obligation-matrix')) {
      for (const td of section.querySelectorAll('td')) {
        if (td.querySelector('.state')) continue; // already transformed
        const text = td.textContent.trim();
        const m = /^\[([x\-/ ])\]\s*(.*)$/.exec(text);
        if (!m) continue;
        const { sem, shape } = stateClassesFor(m[1], true); // obligation [ ] = exempt (neutral)
        td.innerHTML = `<span class="state ${sem} ${shape}">${m[2]}</span>`;
      }
    }
  }

  /**
   * Transforms checklist items in VS Code preview (mirrors the Marp plugin).
   * For each top-level <li> in section.checklist whose text starts with
   * [x]/[-]/[ ]/[/], strips the marker and adds
   *   class="state {pass|warn|fail|skip} {state-full|state-half|state-empty|state-slashed}"
   * to the <li>. CSS handles the trailing-`code` pill (universal pill
   * convention, shared with cards-grid / actors). Idempotent —
   * skips items already tagged.
   */
  function transformChecklistItemStates() {
    if (typeof document === 'undefined') return;
    for (const section of document.querySelectorAll('section.checklist')) {
      for (const li of section.querySelectorAll(':scope > ul > li, :scope > ol > li')) {
        if (li.classList.contains('state')) continue;
        // Inspect the first text node (leading text content of the <li>).
        const firstText = (() => {
          for (const node of li.childNodes) {
            if (node.nodeType === 3) return node;
            if (node.nodeType === 1) return null; // element before any text
          }
          return null;
        })();
        if (!firstText) continue;
        const m = /^\[([x\-/ ])\]\s*/.exec(firstText.nodeValue);
        if (!m) continue;
        const { sem, shape } = stateClassesFor(m[1], true); // checklist [ ] = todo (neutral)
        firstText.nodeValue = firstText.nodeValue.slice(m[0].length);
        li.classList.add('state', sem, shape);
      }
    }
  }

  /**
   * Lifts the leading inline content of each top-level <li> in named-slot
   * layouts (`compare-prose`, `decision`, …) into a <strong>
   * wrapper, matching the `slotLabelLift` markdown-it plugin
   * and `liftSlotLabel` in lattice-emulator.js. The labeled corner-tag CSS
   * (`> strong:first-child`) then renders the slot label as a flush
   * top-left tag without authors having to write `**Label**` in source.
   *
   * Idempotent: skips items whose first element child is already <strong>.
   * Walks until the first nested <ul>/<ol> (the body list) so prose lifts
   * cleanly even when the lead spans multiple inline tokens (e.g. trailing
   * `code`).
   */
  function transformSlotLabels() {
    if (typeof document === 'undefined') return;
    // From the shared kernel — this used to be a hand-kept selector string that
    // had silently fallen behind the plugin's list (no `premise`, no `q-and-a`).
    const SELECTOR = slotLayoutSelector();
    for (const section of document.querySelectorAll(SELECTOR)) {
      // actors: a trailing inline-code chip (actor-name pill) stays a
      // sibling of the <strong> label, not a child of it.
      const chipTail = section.classList.contains('actors');
      // compare-prose authored with the build pipeline already has the
      // .compare-prose-inner / .card structure with the strong inside.
      // The runtime only needs to handle the raw <ul>/<ol> case.
      const lists = section.querySelectorAll(':scope > ul, :scope > ol');
      for (const list of lists) {
        for (const li of list.children) {
          if (li.tagName !== 'LI') continue;
          // Idempotent: first element child already <strong>.
          const firstEl = li.firstElementChild;
          if (firstEl && firstEl.tagName === 'STRONG' &&
              (li.firstChild === firstEl ||
               (li.firstChild.nodeType === 3 && !li.firstChild.nodeValue.trim() && li.firstChild.nextSibling === firstEl))) {
            continue;
          }
          // Collect lead nodes up to (but not including) the first nested list.
          const lead = [];
          let cursor = li.firstChild;
          while (cursor && !(cursor.nodeType === 1 && (cursor.tagName === 'UL' || cursor.tagName === 'OL'))) {
            lead.push(cursor);
            cursor = cursor.nextSibling;
          }
          if (!lead.length) continue;
          // For chip-tail layouts (actors), a trailing run of inline <code>
          // chips (+ whitespace) is metadata (the actor-name pill), not
          // heading text — keep it a sibling after the <strong> so
          // `li > code` CSS keeps matching.
          let end = lead.length;
          if (chipTail) {
            while (end > 0) {
              const n = lead[end - 1];
              if (n.nodeType === 1 && n.tagName === 'CODE') { end--; continue; }
              if (n.nodeType === 3 && !n.nodeValue.trim()) { end--; continue; }
              break;
            }
          }
          const labelNodes = lead.slice(0, end);
          if (!labelNodes.length) continue;
          // Skip empty / whitespace-only leads.
          const leadHasText = labelNodes.some(n =>
            (n.nodeType === 3 && n.nodeValue.trim()) ||
            (n.nodeType === 1 && n.textContent.trim())
          );
          if (!leadHasText) continue;
          // Anchor for re-insertion: the first node left outside the label
          // (a trailing chip) or the nested body list.
          const anchor = end < lead.length ? lead[end] : cursor;
          const strong = document.createElement('strong');
          for (const n of labelNodes) strong.appendChild(n);
          li.insertBefore(strong, anchor);
        }
      }
    }
  }

  // split-* DOM transforms now live in lib/transformers/split-panels.js,
  // bundled in via the registry above. Called from runAllContentTransforms.




  /**
   * Convenience `logo:` front-matter directive — runtime mirror.
   *
   * Reads the deck's front matter through `withDeckFrontMatter` (the baked block
   * an export carries, else a fetch of the source `.md`) and injects
   * `<img class="deck-logo">` as the first child of each section the `logo-on`
   * rule selects. Real DOM (not a `::before` pseudo) so the logo composes with
   * `::before`-based decorations like `mark-orbit`.
   *
   * Sibling implementations:
   *   - the engine's `applyDeckLogoToHtml` (marp-cli path)
   *   - lattice-emulator.js's HTML post-process (emulator path)
   * All three must produce identical DOM injection so the rendered
   * output is consistent across renderers.
   */
  function applyDeckLogoFromFrontMatter() {
    if (typeof document === 'undefined') return;
    withDeckFrontMatter((fm) => {
      const logo = frontMatterValue(fm, 'logo');
      if (!logo) return;
      const brand = (frontMatterValue(fm, 'logo-style') || '').toLowerCase() === 'brand';
      const onTitle = (frontMatterValue(fm, 'logo-on') || '').toLowerCase() === 'title';
      // Optional placement/size — logo-x/logo-y (0–100, the logo CENTER as %) and
      // logo-scale (a multiplier). Only finite, clamped numbers are applied, so a
      // crafted value can't inject a style. Mirrors deckLogoStyle in plugins.js.
      const num = (re) => { const m = fm.match(re); if (!m) return null; const n = Number(m[1]); return Number.isFinite(n) ? n : null; };
      const logoX = num(/^[ \t]*logo-x:[ \t]*["']?(-?[\d.]+)["']?[ \t]*$/m);
      const logoY = num(/^[ \t]*logo-y:[ \t]*["']?(-?[\d.]+)["']?[ \t]*$/m);
      const logoScale = num(/^[ \t]*logo-scale:[ \t]*["']?(-?[\d.]+)["']?[ \t]*$/m);
      // Cache the parsed config (not just the raw front-matter text) so
      // applyCachedDeckLogo can re-inject on every later
      // runAllContentTransforms pass without re-resolving — see the cache
      // declarations near runAllContentTransforms.
      cachedDeckLogoConfig = { logo, brand, onTitle, logoX, logoY, logoScale };
      applyCachedDeckLogo();
    });
  }

  // Re-injects the deck logo from the cached config — idempotent (skips a
  // section that already has one), so safe to call on every transform pass.
  // A no-op until the fetch above has resolved at least once.
  function applyCachedDeckLogo() {
    const cfg = cachedDeckLogoConfig;
    if (!cfg || typeof document === 'undefined') return;
    // On the SECTION, not the img — custom properties inherit downward only, so while
    // these lived in the img's own style no sibling could read them and the marker
    // stack could not see the logo it was colliding with (#1404). The img still reads
    // them by inheritance.
    //
    // The clamps and the both-axes rule come from `deckLogoPlacement` in plugins.js —
    // the SAME function the build path uses — rather than a hand-kept copy here. Two
    // copies agreeing by inspection is what HARD RULE #1 exists to prevent, and nothing
    // failed when one drifted (the docs asserted the invariant; no gate held it).
    const placement = deckLogoPlacement({ scale: cfg.logoScale, x: cfg.logoX, y: cfg.logoY });
    const inCorner = deckLogoInCorner({ x: cfg.logoX, y: cfg.logoY });
    const applyLogoPlacement = (section) => {
      for (const [prop, value] of placement) section.style.setProperty(prop, value);
      // Not repositioned, so it sits in the top-right corner the marker tabs share.
      if (inCorner) section.setAttribute('data-logo-corner', '');
    };

    // Scope to Marp's real slide sections — same reason the overflow
    // watcher does so. Literal `<section>` text inside code blocks
    // parses as nested DOM and would otherwise get a logo injected.
    const sections = document.querySelectorAll('section[data-lattice-slide]');
    let firstSeen = false;
    for (const section of sections) {
      const cls = section.className.split(/\s+/).filter(Boolean);
      const isTitle = cls.includes('title');
      const isFirst = !firstSeen;
      firstSeen = true;
      if (cfg.onTitle && !isFirst && !isTitle) continue;
      // Skip if already injected (idempotent — runtime re-fires every pass).
      if (section.querySelector(':scope > img.deck-logo')) continue;
      const img = document.createElement('img');
      img.className = 'deck-logo' + (cfg.brand ? ' deck-logo-brand' : '');
      img.src = cfg.logo;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      applyLogoPlacement(section);
      section.insertBefore(img, section.firstChild);
    }
  }

  // meta Tile — read `meta:` from the deck's front matter and fill the masthead
  // bays built by the registry's masthead-lift pass. The reader + DOM mutation are
  // the meta Tile kernel (lib/forms/tile/meta); only the front-matter wrapper
  // lives here.
  function applyMastheadMetaFromFrontMatter() {
    if (typeof document === 'undefined') return;
    withDeckFrontMatter((fm) => {
      // The meta Tile kernel owns the `meta:` front-matter reader, so the HTML
      // path and this wrapper parse it ONE way. It reads a whole deck source, so
      // it gets the front matter re-wrapped in its `---` fence. Cached so
      // applyCachedMastheadMeta can re-fill a fresh masthead-bay on every later
      // runAllContentTransforms pass without re-resolving.
      cachedMastheadMeta = metaTile.readFrontMatter(latticeFrontMatterDoc(fm)) || '';
      applyCachedMastheadMeta();
    });
  }

  // metaTile.applyToDom is itself idempotent (only fills a bay with no
  // `.tile-meta` yet), so re-calling it on every transform pass is cheap and
  // a no-op both before the fetch above resolves and on an already-filled bay.
  function applyCachedMastheadMeta() {
    if (typeof document === 'undefined') return;
    metaTile.applyToDom(document, cachedMastheadMeta);
  }

  /**
   * Mirror of the engine's `defaultComponent` plugin for the preview path — a
   * section that names no component gets the catch-all `content` layout, so an
   * un-classed slide renders as a Lattice slide instead of unstyled markdown
   * (#1292, lib/core/resolve-component.js).
   *
   * A SEPARATE pass from applyDeckClassFromFrontMatter, not a step inside it:
   * that one runs under `withDeckFrontMatter` and so never fires on a deck with
   * no front matter — which is precisely the deck this rule exists for. It must
   * run AFTER it, though, so the resolved list it reads already carries every
   * deck-wide token — hence `afterDeckFrontMatter` at the call site rather than a
   * plain statement, which would run first and lose the race.
   *
   * Scoped to TOP-LEVEL sections, matching the engine plugin, which walks
   * `lattice_slide_open` tokens. A deck may hand-author a nested `<section>` (see
   * lib/core/below-note.js), and an unfiltered `querySelectorAll('section')` would
   * stamp `content` on that inner element on this path only — a silent divergence
   * from the engine, which is what the mirror exists to prevent.
   */
  // Returns TRUE when it actually stamped a section. The caller re-runs the
  // content transforms only on a true, so the common deck — every slide naming
  // its own component — pays nothing for the correction pass.
  function applyDefaultComponent() {
    if (typeof document === 'undefined') return false;
    let changed = false;
    for (const section of document.querySelectorAll('section')) {
      if (section.parentElement?.closest('section')) continue; // nested — not a slide

      const cur = section.className.split(/\s+/).filter(Boolean);
      const next = withDefaultComponent(cur);
      if (next !== cur) { section.className = next.join(' '); changed = true; }
    }
    return changed;
  }

  /**
   * Mirror of the engine's `deckClassPropagate` plugin for the preview path, plus
   * every other deck-wide class register (color-mode, finish, mode, claim, stamp,
   * tone, spectrum, rule, eyebrow, headline, lift).
   *
   * Marpit's spec is "spot replaces global", so a slide with a `_class:` directive
   * drops the deck-wide `class:` value entirely. The engine's plugin overrides
   * that at token-rewrite time on the owned render paths; a previewer that renders
   * the HTML without running our plugins keeps only per-slide classes, so the
   * runtime re-applies it — reading the front matter through
   * `withDeckFrontMatter`, and honoring the same per-slide-wins rules the plugin
   * does.
   */
  function applyDeckClassFromFrontMatter() {
    if (typeof document === 'undefined') return;
    withDeckFrontMatter((fm) => {
      // The deck-wide `class:` register, SANITIZED AT THE BOUNDARY — one kernel
      // with the engine plugin (lib/core/deck-class-register.js), so a token the
      // register refuses (a color-axis token superseded by `color-mode:`, a
      // component name) is never stamped and this mirror never has to take one
      // back. It CANNOT take one back: it sees only a resolved class list, where
      // the deck's `dark` and the slide's own `dark` are one string.
      const classTokens = deckClassTokensFromFrontMatter(fm);
      const colorModeToken = deckColorModeToken(fm);
      const colorModeTokens = colorModeToken ? [colorModeToken] : [];
      // Custom `finish:` (backdrop) register → its class tokens, appended the
      // same way (none / atrium / …). See lib/core/resolve-finish.js.
      // Through the shared reader — see the sibling in markdown-it/plugins.js. The private
      // `$`-anchored pattern this replaces dropped an annotated `finish:` on the runtime path
      // only, so a deck rendered one way in the browser and another in the engine.
      const finishTokens = finishClasses(frontMatterName(fm, 'finish') || '').split(/\s+/).filter(Boolean);
      // Custom `mode:` (rendering mode) register → boardroom / sketch / sketch-clean.
      // See lib/core/resolve-mode.js. Composes with finish (both apply).
      const modeTokens = modeClasses(frontMatterName(fm, 'mode') || '').split(/\s+/).filter(Boolean);
      // Deck-wide `claim:` (framed | quiet | hero | bleed) → one claim token,
      // stamped like finish/mode. framed/unknown → no token. See resolve-claim.js.
      const claimTokens = claimClasses(frontMatterName(fm, 'claim') || '').split(/\s+/).filter(Boolean);
      // Deck-wide stamp / tone STYLE registers (resolve-stamp.js / resolve-tone-style.js).
      const stampName = frontMatterName(fm, 'stamp') || '';
      const stampTokens = stampClass(stampName) ? [stampClass(stampName)] : [];
      const toneStyleName = frontMatterName(fm, 'tone') || '';
      const toneStyleTokens = toneStyleClass(toneStyleName) ? [toneStyleClass(toneStyleName)] : [];
      // Deck-wide SPECTRUM registers — STYLE (`spectrum:` → the gradient identity, flows
      // to every accent) + EDGE (`spectrum-edge:` → the section-edge bar placement).
      // See resolve-spectrum.js.
      const spectrumName = frontMatterName(fm, 'spectrum') || '';
      const spectrumTokens = spectrumClass(spectrumName) ? [spectrumClass(spectrumName)] : [];
      const spectrumEdgeName = frontMatterName(fm, 'spectrum-edge') || '';
      const spectrumEdgeTokens = spectrumEdgeClass(spectrumEdgeName) ? [spectrumEdgeClass(spectrumEdgeName)] : [];
      const spectrumCardName = frontMatterName(fm, 'spectrum-card') || '';
      const spectrumCardTokens = spectrumCardClass(spectrumCardName) ? [spectrumCardClass(spectrumCardName)] : [];
      const spectrumCardEdgeName = frontMatterName(fm, 'spectrum-card-edge') || '';
      const spectrumCardEdgeTokens = spectrumCardEdgeClass(spectrumCardEdgeName) ? [spectrumCardEdgeClass(spectrumCardEdgeName)] : [];
      const spectrumTrimName = frontMatterName(fm, 'spectrum-trim') || '';
      const spectrumTrimTokens = spectrumTrimClass(spectrumTrimName) ? [spectrumTrimClass(spectrumTrimName)] : [];
      // Deck-wide HEADING RULE (`rule:`) + EYEBROW (`eyebrow:`) accent finishes — one
      // token each; default (auto/plain) → no token. See resolve-rule.js / resolve-eyebrow.js.
      const ruleName = frontMatterName(fm, 'rule') || '';
      const ruleTokens = ruleClass(ruleName) ? [ruleClass(ruleName)] : [];
      const eyebrowName = frontMatterName(fm, 'eyebrow') || '';
      const eyebrowTokens = eyebrowClass(eyebrowName) ? [eyebrowClass(eyebrowName)] : [];
      // Deck-wide HEADLINE ALIGNMENT (`headline:`) — framing-cluster horizontal align;
      // one token, default (auto) → no token. See resolve-headline.js.
      const headlineName = frontMatterName(fm, 'headline') || '';
      const headlineTokens = headlineClass(headlineName) ? [headlineClass(headlineName)] : [];
      // Deck-wide LIFT toggle — opt-in card elevation (resolve-lift.js).
      const liftName = frontMatterName(fm, 'lift') || '';
      const liftTokens = liftClass(liftName) ? [liftClass(liftName)] : [];
      const deckTokens = [...classTokens, ...colorModeTokens, ...finishTokens, ...modeTokens, ...claimTokens, ...stampTokens, ...toneStyleTokens, ...spectrumTokens, ...spectrumEdgeTokens, ...spectrumCardTokens, ...spectrumCardEdgeTokens, ...spectrumTrimTokens, ...ruleTokens, ...eyebrowTokens, ...headlineTokens, ...liftTokens];
      if (!deckTokens.length) return;
      // Cached so applyCachedDeckClass can re-apply on every later
      // runAllContentTransforms pass without re-resolving the front matter.
      cachedDeckClassConfig = { deckTokens, modeTokens };
      applyCachedDeckClass();
    });
  }

  // Re-applies the cached deck-wide class tokens — idempotent (only appends a
  // token a section doesn't already carry, same per-slide-override rules as
  // the fetch above), so safe to call on every transform pass. A no-op until
  // the fetch above has resolved at least once.
  function applyCachedDeckClass() {
    const cfg = cachedDeckClassConfig;
    if (!cfg || typeof document === 'undefined') return;
    const { deckTokens, modeTokens } = cfg;
    const modeSet = new Set(modeTokens);
    const toneStyleSet = new Set(TONE_STYLE_TOKENS);
    const colorModeSet = new Set(COLOR_MODE_TOKEN_LIST);
    for (const section of document.querySelectorAll('section')) {
      // APPEND-ONLY. See lib/core/deck-class-register.js: this mirror runs on a
      // document whose sections were classed by someone else (Marp, on an export
      // bundle), so removal here removes by VALUE — which deleted a slide's own
      // component when the deck-wide register happened to name the same token.
      const cur = section.className.split(/\s+/).filter(Boolean);
      let changed = false;
      // A per-slide finish overrides the deck-wide one: if this slide already
      // carries its OWN `finish-*` preset (or the `finish-none` opt-out), skip
      // appending the deck's `finish-*` preset (both stacking would composite
      // two finishes). Base `finish` + non-finish deck classes still apply.
      // (Mirrors lib/integrations/markdown-it/plugins.js.)
      const slideHasOwnFinish = cur.some((c) => c.startsWith('finish-') || c === 'finish-none');
      // Likewise a per-slide mode token (sketch, or the `boardroom` opt-out)
      // is not overwritten by the deck-wide mode.
      const slideHasOwnMode = cur.some((c) => MODE_TOKENS.includes(c));
      // A per-slide `claim-*` preset wins over the deck-wide claim.
      const slideHasOwnClaim = cur.some((c) => c.startsWith('claim-'));
      const slideHasOwnStamp = cur.some((c) => c.startsWith('stamp-'));
      const slideHasOwnToneStyle = cur.some((c) => toneStyleSet.has(c));
      // Spectrum STYLE and EDGE are independent registers, guarded separately so an edge
      // override doesn't suppress the deck's style token (or vice-versa).
      const slideHasOwnSpectrumStyle = cur.some((c) => isSpectrumStyleToken(c));
      const slideHasOwnSpectrumEdge = cur.some((c) => isSpectrumEdgeToken(c));
      // Card STYLE and card EDGE are independent registers, guarded separately.
      const slideHasOwnSpectrumCard = cur.some((c) => isSpectrumCardToken(c));
      const slideHasOwnSpectrumCardEdge = cur.some((c) => isSpectrumCardEdgeToken(c));
      // A per-slide spectrum-trim token wins over the deck-wide `spectrum-trim: on`.
      const slideHasOwnSpectrumTrim = cur.some((c) => isSpectrumTrimToken(c));
      // A per-slide `rule-*` / `eyebrow-*` accent token wins over the deck-wide one.
      const slideHasOwnRule = cur.some((c) => RULE_TOKENS.includes(c));
      const slideHasOwnEyebrow = cur.some((c) => EYEBROW_TOKENS.includes(c));
      // A per-slide `head-*` alignment token wins over the deck-wide one.
      const slideHasOwnHeadline = cur.some((c) => HEADLINE_TOKENS.includes(c));
      // A per-slide lift choice (`lifted`/`flat`) wins over deck-wide `lift: on`.
      const slideHasOwnLift = cur.some((c) => c === 'lifted' || c === 'flat');
      // A per-slide color-mode token (`dark`/`light`) wins over the deck-wide one
      // (a bright `_class: light` slide in a `class: dark` deck stays light).
      // Mirrors lib/integrations/markdown-it/plugins.js.
      const slideHasOwnColorMode = cur.some((c) => colorModeSet.has(c));
      for (const t of deckTokens) {
        if (slideHasOwnFinish && t.startsWith('finish-')) continue;
        if (slideHasOwnMode && modeSet.has(t)) continue;
        if (slideHasOwnClaim && t.startsWith('claim-')) continue;
        if (slideHasOwnStamp && t.startsWith('stamp-')) continue;
        if (slideHasOwnToneStyle && toneStyleSet.has(t)) continue;
        if (slideHasOwnSpectrumStyle && isSpectrumStyleToken(t)) continue;
        if (slideHasOwnSpectrumEdge && isSpectrumEdgeToken(t)) continue;
        if (slideHasOwnSpectrumCard && isSpectrumCardToken(t)) continue;
        if (slideHasOwnSpectrumCardEdge && isSpectrumCardEdgeToken(t)) continue;
        if (slideHasOwnSpectrumTrim && isSpectrumTrimToken(t)) continue;
        if (slideHasOwnRule && RULE_TOKENS.includes(t)) continue;
        if (slideHasOwnEyebrow && EYEBROW_TOKENS.includes(t)) continue;
        if (slideHasOwnHeadline && HEADLINE_TOKENS.includes(t)) continue;
        if (slideHasOwnLift && t === 'lifted') continue;
        // `print` survives a slide's own scheme pin — see slidePinEvictsDeckToken.
        if (slideHasOwnColorMode && slidePinEvictsDeckToken(t)) continue;
        if (!cur.includes(t)) { cur.push(t); changed = true; }
      }
      if (changed) section.className = cur.join(' ');
    }
    // Deck-wide finishes just landed — wrap them (per-slide finishes were
    // already wrapped synchronously in bootstrap). Backdrop restraint is BAKED into
    // the finish CSS (`--fin-backdrop-*`) now, so the wrapper needs no inline stamp.
    injectBackdrops();
  }

  // Inject the `.backdrop` wrapper as the first child of every finish section —
  // the DOM mirror of applyBackdropToHtml (lib/integrations/markdown-it/plugins.js).
  // The finish compositor lives on this wrapper (base.finish.css) so strength +
  // the mask overlay address the whole finish as one layer. Idempotent (a
  // `:scope > .backdrop` guard) — safe to re-run after deck-wide classes land.
  // slice 1 of the backdrop-controls work.
  function injectBackdrops() {
    if (typeof document === 'undefined') return;
    for (const section of document.querySelectorAll('section')) {
      if (!sectionIsFinish([...section.classList])) continue;
      // A per-slide `finish-<name>` implies the bare `finish` compositor class.
      if (!section.classList.contains('finish')) section.classList.add('finish');
      if (section.querySelector(':scope > .backdrop')) continue;
      const bd = document.createElement('div');
      bd.className = 'backdrop';
      bd.setAttribute('aria-hidden', 'true');
      const mask = document.createElement('i');
      mask.className = 'backdrop-mask';
      bd.appendChild(mask);
      section.insertBefore(bd, section.firstChild);
    }
  }

  // Inject the accessibility categorical texture pattern `<defs>` once, as a
  // hidden `<svg>` in `<body>` — inert unless an a11y-* theme's chart/diagram
  // fills reference `url(#latt-a11y-tex-N)` (themes/a11y-base.css). Mirrors
  // lattice-emulator.js's injection at the top of `<body>`. Idempotent
  // (guarded on the `.latt-a11y-defs` marker) in case bootstrap ever runs
  // twice; deck-independent static markup, so — unlike the meta/logo/class
  // registers above — it needs no recurring re-fire: it lives outside any
  // `<section>`, so Marp's wholesale section-replacement on edit never
  // touches it.
  function injectA11yTextureDefs() {
    if (typeof document === 'undefined' || !document.body) return;
    if (document.querySelector('.latt-a11y-defs')) return;
    document.body.insertAdjacentHTML('afterbegin', texturePatternDefs());
  }

  function bootstrap() {
    // Diagnostic breadcrumb. Visible in the host's DevTools console.
    // In VS Code: "Developer: Open Webview Developer Tools" while the Marp
    // preview pane has focus. If you don't see this log at all, the script
    // tag never executed (CSP block, src 404, or HTML filter stripped it).
    if (typeof console !== 'undefined') {
      try {
        const fenceCount = document.querySelectorAll(
          "pre > code.language-mermaid, marp-pre > code.language-mermaid"
        ).length;
        console.log('[lattice-runtime] bootstrap', {
          mermaidLoaded: typeof globalScope.mermaid !== 'undefined',
          mermaidVersion: globalScope.mermaid?.version,
          fenceCount,
          readyState: document.readyState,
          host: location?.href,
        });
      } catch (_) { /* swallow */ }
    }
    // Mark the document so we can verify script execution from the inspector
    // (look for `<html data-lattice-runtime="loaded">`).
    if (document.documentElement) {
      document.documentElement.setAttribute('data-lattice-runtime', 'loaded');
    }

    // Detect whether `window.mermaid` is the real Mermaid library. Some
    // environments (notably the VS Code plain markdown preview, when the
    // `bierner.markdown-mermaid` extension is installed) install a STUB
    // `window.mermaid` that exposes only `renderMermaidBlocksInElement` and
    // lacks `.initialize` / `.render` / `.version`. That stub also tries to
    // render the same `<pre><code class="language-mermaid">` fences using
    // its own bundled mermaid build, which fails on Marp-style frontmatter
    // inside the fence (UnknownDiagramError).
    //
    // Our `<script src="…/mermaid.min.js">` UMD will overwrite that stub
    // unconditionally — but only once it finishes loading. Until then we
    // must keep waiting; using the stub yields TypeError on .initialize.
    const isRealMermaid = (m) =>
      m && typeof m.initialize === 'function' && typeof m.render === 'function';

    // ...existing comment about two distinct waits applies, with one tweak:
    //
    //   1. Waiting for the REAL `window.mermaid` (one with .initialize/.render),
    //      not just any object on the global. ...
    let mermaidWaitFrames = 0;
    let themeWaitFrames = 0;
    const MERMAID_WAIT_CAP = 600;   // ~10s @ 60fps
    const THEME_WAIT_CAP = 30;      // ~500ms @ 60fps

    const tick = () => {
      if (!isRealMermaid(globalScope.mermaid)) {
        if (++mermaidWaitFrames > MERMAID_WAIT_CAP) {
          if (typeof console !== 'undefined') {
            console.warn('[lattice-runtime] real mermaid never loaded; giving up after',
              MERMAID_WAIT_CAP, 'frames. window.mermaid =', globalScope.mermaid,
              '— check that the mermaid <script src> path resolves and that no other extension is shadowing window.mermaid.');
          }
          return;
        }
        requestAnimationFrame(tick);
        return;
      }
      // Mermaid is loaded; now we're just waiting on theme vars.
      if (initAndRun()) {
        if (typeof console !== 'undefined') {
          console.log('[lattice-runtime] init OK after', themeWaitFrames, 'theme-wait frame(s)');
        }
        return;
      }
      if (++themeWaitFrames > THEME_WAIT_CAP) {
        if (typeof console !== 'undefined') {
          console.warn('[lattice-runtime] theme vars never resolved; force-init');
        }
        initAndRun({ force: true });
        return;
      }
      requestAnimationFrame(tick);
    };
    injectA11yTextureDefs();
    applyDeckClassFromFrontMatter();
    // Sequenced, not merely written after: deck-class propagation is async, so a
    // bare call here would run BEFORE it and read a class list the deck-wide
    // registers had not yet contributed to (#1292).
    //
    // That deferral has a consequence worth stating, because it is the ONE place
    // this mirror is not a mirror: `runAllContentTransforms()` below is a plain
    // synchronous call, so the FIRST transform pass sees sections without
    // `content`, while the engine's plugin runs before every transform and they
    // always see it with. Harmless today only by luck — no transform is keyed on
    // `content` since it left below-note's EXCLUDED — and luck is not what
    // marp-fidelity.js's `coverage: 'mirrored'` should rest on. So the transforms
    // re-run inside the same continuation, and the two paths converge regardless
    // of what a future transform keys on (HARD RULE #1).
    //
    // GATED ON A REAL CHANGE, not run unconditionally: a deck whose every slide
    // names its own component pays nothing. And the initial pass below is NOT
    // deferred to cover this, though that would collapse the two into one —
    // `deckFrontMatterSource()` falls back to a `fetch` when the document carries
    // no baked front-matter block, so deferring first paint behind it would leave
    // the preview blank for a network round trip. Immediate paint, then correct.
    // Setting the flag here (rather than inside `deckFrontMatterSource`) keeps the
    // "settled" signal on the same continuation that already sequences the first stamp,
    // so the re-stamp in runAllContentTransforms can never start earlier than this did.
    afterDeckFrontMatter(() => {
      deckFrontMatterSettled = true;
      if (applyDefaultComponent()) runAllContentTransforms();
    });
    applyDeckLogoFromFrontMatter();
    applyMastheadMetaFromFrontMatter();
    // Wrap per-slide finishes (already in the DOM at load); deck-wide finishes
    // re-trigger this from applyDeckClassFromFrontMatter after their fetch lands.
    injectBackdrops();
    // Stamp data-orientation on every section FIRST, so the render-time chart
    // transforms below (e.g. funnel's portrait viewBox) see it on their first
    // build. patchSectionGeometry() re-stamps + observes later; this early pass
    // is what keeps the live preview in sync with the export. (Layout is ready —
    // patchSectionGeometry reads offsetWidth a few calls down.)
    if (typeof document !== 'undefined') {
      for (const s of document.querySelectorAll('section')) stampOrientation(s);
    }
    // Run all content transforms immediately so the Form default (masthead band +
    // bay + footer cell), glossary, chart family, and layout slides render without
    // waiting for the Mermaid library to load. runAllContentTransforms now owns the
    // Form default + the progress/watermark Tile dock (after masthead-lift builds
    // the cells), so both run here and re-fire idempotently on every later pass.
    // tick() calls initAndRun() once Mermaid is ready, which re-runs them
    // (idempotent) alongside Mermaid fence rendering.
    runAllContentTransforms();
    // Mark every Mermaid fence pending immediately. Combined with the CSS rule
    // that hides <pre> for any data-mermaid-state except "error", this prevents
    // raw Mermaid source from being visible during the Mermaid library load and
    // on full webview reloads (where the SVG cache is cold and tick() takes
    // time to fire).
    wrapFences();
    tick();
    // Re-run Mermaid when the slide DOM changes (e.g. marp-vscode re-renders a
    // slide on edit). scheduleRun() debounces the mutation burst and initAndRun()
    // is idempotent — already-rendered fences (data-mermaid-state) are skipped,
    // so this settles instead of looping on Mermaid's own SVG insertion. The
    // previous startObserver() call referenced a function dropped in the registry
    // migration (690835d), so this observer was silently lost.
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver((records) => {
        // The watcher's own berth fills are childList mutations too (see
        // burstIsMarkerChromeOnly). Dropping a burst that is ENTIRELY marker chrome
        // is what keeps this observer from scheduling the pass that fed it.
        if (burstIsMarkerChromeOnly(records)) return;
        scheduleRun();
      }).observe(document.body || document.documentElement, {
        subtree: true,
        childList: true,
      });
    }
    patchSectionGeometry();
    // No explicit fallback: a document with no export-settings block is a live
    // preview and defaults to `author`; an exported bundle carries one, and its
    // recorded level decides.
    //
    // …unless this document is a SPECIMEN — a catalog sample the author did not write
    // and cannot edit — which has no addressee for the signal and pays the watcher's
    // cost once per frame across a whole grid. `off` is not a quieter marker here: it is
    // the level that installs NOTHING (see startOverflowWatcher: "Sweep once, install
    // nothing: no probe, no observer, no resize handler"), which is exactly what a
    // specimen wants, and it sweeps + stamps on the way out where a bare `return` would
    // not. A thumbnail of the AUTHOR'S OWN slide is not a specimen and keeps its
    // watcher. See isSpecimenDocument().
    startOverflowWatcher({ level: isSpecimenDocument() ? 'off' : deckOverflowMarker() });
  }

  // ── Section geometry injector ─────────────────────────────────────────
  // section { container-type:size } makes section the query container, so
  // cqi on section's OWN properties (padding-top, border-top) cannot resolve
  // against section — they fall back to the ICB.  In PDF print mode the ICB
  // is the @page area (correct).  In VS Code screen mode the ICB is the editor
  // viewport, giving ~103px at 4K instead of the intended 264px.
  // section has container-type:size, so its own cqi properties cannot query
  // themselves (CSS self-reference) and fall back to the ICB. In VS Code screen
  // mode the ICB is the editor viewport, not the slide. Fix: set --_sec-1cqi to
  // section.offsetWidth/100 px (the CSS width before any transform scale —
  // 38.40px for a 3840px 4K slide). lattice.css uses calc(var(--_sec-1cqi,1cqi)*X)
  // for every direct-cqi property on section; the 1cqi fallback fires only in
  // the emulator/print path where @page sets the ICB to the slide size correctly.
  // Orientation scaling/fill for the social/mobile portrait + square @sizes.
  // SIBLING of lib/engine/css.js orientationFor/orientationCss (HARD RULE #1) —
  // the engine scaffold + emulator template emit the same deck-wide rule at
  // render time; the runtime (VS Code preview / published HTML) consumes an
  // already-rendered doc, so it injects the equivalent <style> once, derived
  // from the live slide aspect. Keep the thresholds/scales in step with css.js.
  function injectOrientationStyle(section) {
    if (typeof document === 'undefined') return;
    if (document.getElementById('lattice-orientation')) return;
    const w = section.offsetWidth, h = section.offsetHeight;
    if (!w || !h) return; // not laid out yet — retried on the next observer tick
    const aspect = w / h;
    if (aspect > 1.05) return; // landscape — no scaling (byte-identical)
    // MUST match orientationFor() in lib/engine/css.js (square flat 1.2; portrait
    // ramps 1.2 + (1-aspect)*0.75, capped 1.6). test/unit/.../engine.test.js guards
    // the two against drift, since the browser runtime can't require the Node module.
    const scale = aspect >= 0.95
      ? 1.65
      : Math.min(2.4, Math.round((1.75 + (1 - aspect) * 1.0) * 100) / 100);
    // Hero-number emphasis param — mirrors orientationCss() in lib/engine/css.js.
    const statEmphasis = aspect >= 0.95 ? 1.3 : 1.45;
    // Bare `section` (0,0,1), appended last: a component layout's own
    // `justify-content` (`section.kpi`, …) is (0,1,1) and still wins, so this
    // only centres the default flex-column layouts.
    // Safe-area bands (px) for the opt-in `safe` modifier — mirrors
    // orientationCss() in lib/engine/css.js (12% top / 20% bottom of height).
    const safe = ` --safe-top: ${Math.round(h * 0.12)}px; --safe-bottom: ${Math.round(h * 0.2)}px;`;
    const el = document.createElement('style');
    el.id = 'lattice-orientation';
    el.textContent = `section { --canvas-scale: ${scale}; --stat-emphasis: ${statEmphasis}; justify-content: center;${safe} }`;
    (document.head || document.documentElement).appendChild(el);
  }

  // Stamp `data-orientation` from a section's measured aspect — the single signal
  // both the component reflow CSS AND the render-time chart transforms (funnel's
  // tall viewBox) read. Mirrors orientationFor() in lib/engine/css.js. Idempotent
  // (only writes on change, or the attributes:true observer loops every frame).
  // MUST run before runAllContentTransforms so a JS chart transform that bakes
  // orientation into geometry sees it on its first (and, given the chart-frame
  // idempotency guard, only) build — otherwise the live preview diverges from the
  // export (the funnel would render landscape on a portrait deck). CSS-reflow
  // consumers are immune to a late stamp; geometry-baking transforms are not.
  function stampOrientation(s) {
    const w = s.offsetWidth, h = s.offsetHeight;
    if (!w || !h) return;
    const a = w / h;
    // data-orientation is derived from the SAME family classifier as data-family
    // (lib/adaptive/families.js) — landscape→unstamped, square, portrait
    // (tall ∪ strip) — so the leaf (component reflow) and the frame (Frame
    // slicing) can't disagree on the box. Since #1218 BOTH read the same
    // `data-family` stamp, so the agreement is structural, not a convention. See M1.
    const orient = deckOrientation(a);
    const o = orient === 'landscape' ? null : orient;
    if (o && s.getAttribute('data-orientation') !== o) s.setAttribute('data-orientation', o);
    // data-family drives the Form responsive-Frame slicing: the per-family
    // [data-family] rules generated from each Frame's manifest `slicing`
    // (same-band re-slicing only — cross-band relocation is a follow-up slice, not
    // yet wired). `wide` is the authored default → leave it unstamped (and clear a
    // stale stamp on a resize back to wide), so a runtime-less render is
    // byte-unchanged. Family taxonomy is the single source in lib/adaptive/
    // families.js. See 2026-06-21-reflow-as-form-capability.md.
    const fam = familyFor(a);
    if (fam === 'wide') s.removeAttribute('data-family');
    else if (s.getAttribute('data-family') !== fam) s.setAttribute('data-family', fam);
  }

  // ── Shared post-mutation dispatcher (geometry + overflow) ────────────────
  // patchSectionGeometry() and startOverflowWatcher() each used to install
  // their OWN MutationObserver on document.body, coalesced only by their own
  // requestAnimationFrame flag — so every DOM mutation fired TWO separate
  // full-document `querySelectorAll('section')`-class scans. One shared
  // observer + one shared rAF batches both callbacks into a single dispatch
  // per frame; scheduleRun's own 150ms debounce (above) stays separate on
  // purpose — it drives the Mermaid/content-transform pass, which wants its
  // own settle window, not the geometry/overflow watchers' every-frame feel.
  const postMutationCallbacks = [];
  let postMutationRaf = 0;
  function dispatchPostMutation() {
    if (postMutationRaf) return;
    postMutationRaf = requestAnimationFrame(() => {
      postMutationRaf = 0;
      for (const cb of postMutationCallbacks) cb();
    });
  }
  let postMutationObserverInstalled = false;
  // Registers `fn` to run on the shared rAF-coalesced dispatch and, on first
  // call, installs the one shared MutationObserver + resize listener that
  // drive it.
  function schedulePostMutation(fn) {
    postMutationCallbacks.push(fn);
    if (!postMutationObserverInstalled && typeof MutationObserver !== 'undefined') {
      postMutationObserverInstalled = true;
      new MutationObserver(dispatchPostMutation).observe(document.body, {
        subtree: true, childList: true, characterData: true, attributes: true,
      });
      if (typeof window !== 'undefined') window.addEventListener('resize', dispatchPostMutation);
    }
  }

  function patchSectionGeometry() {
    if (typeof document === 'undefined') return;
    const patch = (s) => {
      const w = s.offsetWidth;
      if (!w) return;
      injectOrientationStyle(s);
      // Stamp data-orientation per section (portrait/square only) so the
      // component reflow rules in lattice.css fire in the live preview, matching
      // the engine's per-section stamp (lib/engine/slides.js).
      stampOrientation(s);
      const v = (w / 100).toFixed(3) + 'px';
      // Idempotent write. style.setProperty ALWAYS rewrites the style attribute,
      // even to the same value — and this runs inside a MutationObserver that
      // watches attributes:true, so an unconditional write re-triggers the
      // observer every frame (a perpetual requestAnimationFrame loop that also
      // keeps the overflow watcher below churning). Only write on a real change.
      if (s.style.getPropertyValue('--_sec-1cqi') !== v) {
        s.style.setProperty('--_sec-1cqi', v);
      }
      // …and the HEIGHT twin, for the same reason on the other axis. A
      // section-own `cqh` (the imagery/video composition grids, which split the
      // slide by height) has the identical self-reference problem: the section
      // cannot query itself, so it falls back to the ICB — the HOST VIEWPORT in a
      // browser host — and a composition's rows tracked the preview pane's height
      // instead of the slide's. Same shape as --_sec-1cqi: stamped here, `1cqh`
      // fallback everywhere else (in the export the ICB IS the slide box, so that
      // path is unchanged).
      // Guarded BEFORE the value is computed, mirroring the width path's `if (!w)
      // return`: a section measured mid-layout (height 0) must leave the previous
      // stamp alone rather than write `0px`, and must not be re-stamped from a
      // degenerate box on the next tick.
      const h = s.offsetHeight;
      if (h) {
        const vh = (h / 100).toFixed(3) + 'px';
        if (s.style.getPropertyValue('--_sec-1cqh') !== vh) s.style.setProperty('--_sec-1cqh', vh);
      }
    };
    for (const s of document.querySelectorAll('section')) patch(s);
    schedulePostMutation(() => { for (const s of document.querySelectorAll('section')) patch(s); });
  }

  // ── Fix-Me overlay (Case A — clip-cell overflow) ────────────────────────
  // Highlights the SPECIFIC bounded content cell (`.cell-stage` /
  // `.panel-right` / `.compare-right`) responsible for an overflowing slide —
  // or, when the cell holds a known repeated-item collection, drills down
  // further to the specific item within it. Unlike a grow-to-fit grid card —
  // which grows and pushes a NEIGHBOUR past the frame, so pinpointing "the
  // biggest box" flags the wrong element (see startOverflowWatcher below) — a
  // clip cell (overflow:clip) that overflows genuinely clipped its OWN
  // content. It never pushed anything. That makes it a safe,
  // geometrically-certain "cause" signal, unlike the section-level ring. See
  // engineering/decisions/2026-07-10-overflow-cause-highlighting.md (§3 Case A,
  // §10 the item-level drill-down). §3 Case B — the grow-to-fit fallback for
  // slides with NO clip-cell at all, keyed off the prose-density word budget —
  // is deliberately NOT built here (follow-up).
  //
  // ── Item-level drill-down ──────────────────────────────────────────────
  // A clip-cell's own items are often flex row-mates STRETCHED to a common
  // height (align-items:stretch is the flex default) — every item in that row
  // reports the SAME rendered height, so box size alone can't tell the
  // genuine culprit from an innocently-stretched neighbour. What DOES
  // distinguish them: how much of that shared height each item's OWN content
  // actually reaches. An item whose content nearly fills its box (near-zero
  // "slack") demanded the height; a bystander stretched to match it has
  // content that stops well short (large slack) — confirmed empirically
  // (17px vs 291px slack on an otherwise identical box height, on both
  // cards-grid and split-compare). The collection itself is found via
  // axis-dom-catalog.generated.js (component name → density.axis +, for the
  // few components whose own transform retags the axis elements, an explicit
  // `domSelector` override) — never a hardcoded per-component list.
  // The outlier math itself (contentSlack/findCulprits/componentNameFor)
  // lives in lib/core/drill-down.js — pure, unit-tested there with plain
  // fake DOM-like objects (mirroring overflow-probe.test.js's own pattern),
  // not only verifiable via a real-browser spot-check.
  const axisDomCatalog = require('./axis-dom-catalog.generated');
  const { domItemElements, domRowElements } = require('../../lib/core/collections');
  const { findCulprits, componentNameFor, findDensityOutlier } = require('../../lib/core/drill-down');

  // Within one clip-cell, find its axis collection (if any) and return the
  // item(s) that are a genuine low-slack outlier among their SAME-HEIGHT
  // row-mates. Returns [] when there's no collection, no stretched grouping,
  // or no clear outlier — the caller falls back to highlighting the whole
  // cell, never a guess.
  function drillDownCulprits(cell, section) {
    const name = componentNameFor(section, axisDomCatalog);
    const entry = name ? axisDomCatalog[name] : null;
    if (!entry) return [];
    let items;
    if (entry.domSelector) items = [...cell.querySelectorAll(entry.domSelector)];
    else if (entry.axis === 'item') items = domItemElements(cell);
    else if (entry.axis === 'row') items = domRowElements(cell);
    else items = [];
    return findCulprits(items);
  }

  // ── Fix-Me overlay (Case B — density-budget fallback, §12) ──────────────
  // Fires only when a section overflows with NO clip-cell registering any
  // spill at all (overCells empty) — Case A's geometric signal has nothing
  // to say, because there's no bounded cell to blame (e.g. a STAGE_DEFERRED
  // layout like timeline-list, whose body is a direct flex child, never
  // wrapped in `.cell-stage`; masthead.transform.js). Falls back to the
  // component's own `density.soft`/`hard` word budget (axis-dom-catalog now
  // carries both, scanned from the same manifest field
  // lib/authoring/review-core.js's Node-side linter already enforces): the
  // item with the highest LIVE word count past `hard` is the best
  // content-grounded guess for the cause — an editorial signal, not a
  // geometric certainty (§3), so the caller labels it distinctly from
  // Case A's unhedged "Fix Me".
  function drillDownDensityOutlier(section) {
    const name = componentNameFor(section, axisDomCatalog);
    const entry = name ? axisDomCatalog[name] : null;
    if (!entry) return null;
    let items;
    if (entry.domSelector) items = [...section.querySelectorAll(entry.domSelector)];
    else if (entry.axis === 'item') items = domItemElements(section);
    else if (entry.axis === 'row') items = domRowElements(section);
    else items = [];
    return findDensityOutlier(items, entry);
  }
  //
  // MARKED IN PLACE, not mirrored by a floating overlay. The culprit cell gets a
  // class; engine CSS draws an `outline` on it and fills the section's own
  // `.fixme-tab` berth with the label.
  //
  // The overlay this replaced was a `position: fixed` layer in `document.body`
  // holding one absolutely-positioned box per culprit, rebuilt from
  // `getBoundingClientRect()` on every pass and re-synced on a `scroll`
  // listener. It was written that way for a real reason, which still stands and
  // is still honored: a marker must never become a DOM CHILD of the cell it is
  // reporting on, because appending even a `position: absolute` child shifts
  // `nth-child` for every sibling selector inside that cell, and a marker that
  // perturbs the layout it measures can manufacture the overflow it reports
  // (HARD RULE #20 — the same trap that once let an in-flow tab take 50px out of
  // the very `.cell-stage` being probed).
  //
  // `outline` satisfies that constraint outright, and better than a mirror layer
  // does. It is drawn OUTSIDE the box model — no reflow, no space consumed, no
  // child appended, so no `nth-child` index moves — and it is painted by the
  // browser at the element's real position, which buys three things the fixed
  // overlay had to work for and never fully got:
  //
  //   · IT TRACKS SCROLL FOR FREE. The overlay's coordinates were viewport-
  //     relative, so they went stale the instant the page scrolled without a
  //     coincident DOM mutation — hence a `scroll` listener whose whole job was
  //     re-measuring rects to keep a box on top of the thing it outlined. Deleted
  //     here, along with the rect re-reads it triggered on every scroll event.
  //   · IT TRACKS SCALE FOR FREE. Every preview surface scales its slides (the
  //     filmstrip scales each `<section>`, the single-slide Studio scales the
  //     iframe). A fixed overlay in the HOST document is outside that transform,
  //     so its box had to be positioned from already-scaled rects — the same
  //     visual-vs-layout pixel confusion that produced the Playground/Studio
  //     overflow disagreement (2026-07-29-section-cq-icb-leak.md). An outline on
  //     the element is inside the transform by construction.
  //   · IT SURVIVES THE SWEEP BEING SCOPED. The overlay was a single global
  //     layer rebuilt from whatever the last pass found, so a sweep that
  //     deliberately measures only the slides in view (fit-sweep.js) would have
  //     wiped the marks on every slide it skipped. Per-element state has no such
  //     coupling: a slide keeps its mark until that slide is re-measured.
  //
  // What is left is two idempotent attribute writes and a class toggle, on the
  // culprit element and on a berth the markup already carries — no node created,
  // none destroyed, and nothing for a childList observer to react to.
  const FIT_CULPRIT_CLASS = 'fit-culprit';
  const FIT_LABEL_ATTR = 'data-fit-label';
  const FIT_HINT_ATTR = 'data-fit-hint';

  /**
   * Point the Fix-Me signal at `targets` within `sections`, and clear it from
   * anything in `sections` that is no longer a culprit.
   *
   * SCOPED TO THE SWEPT SECTIONS, deliberately. A slide that was not measured
   * this pass keeps whatever mark it had, because the only honest thing to say
   * about an unmeasured slide is nothing — clearing it would make a scroll look
   * like a fix. That is the direct consequence of the sweep no longer touching
   * the whole document, and it is why this state lives on the elements rather
   * than in one overlay.
   */
  function markFitCulprits(sections, targets) {
    const wanted = new Map();
    for (const t of targets) if (t?.el) wanted.set(t.el, t);
    for (const s of sections) {
      // Clear stale marks first, so an element that is still a culprit is not
      // cleared and re-set (two mutations where zero will do).
      for (const el of s.querySelectorAll('.' + FIT_CULPRIT_CLASS)) {
        if (wanted.has(el)) continue;
        el.classList.remove(FIT_CULPRIT_CLASS);
        el.removeAttribute(FIT_LABEL_ATTR);
        el.removeAttribute(FIT_HINT_ATTR);
      }
    }
    for (const [el, t] of wanted) {
      // Every write guarded on inequality. The observer that made this
      // load-bearing is gone, but an unconditional attribute write still costs a
      // style invalidation on an element inside the box being measured, which is
      // the one place in this file where that is worth avoiding on its own merits.
      if (!el.classList.contains(FIT_CULPRIT_CLASS)) el.classList.add(FIT_CULPRIT_CLASS);
      const label = t.label || 'Fix Me';
      if (el.getAttribute(FIT_LABEL_ATTR) !== label) el.setAttribute(FIT_LABEL_ATTR, label);
      const hint = t.hint || '';
      if (hint) {
        if (el.getAttribute(FIT_HINT_ATTR) !== hint) el.setAttribute(FIT_HINT_ATTR, hint);
      } else if (el.hasAttribute(FIT_HINT_ATTR)) {
        el.removeAttribute(FIT_HINT_ATTR);
      }
    }
  }

  /**
   * The section-level half of the Fix-Me signal: the label, in the berth the
   * markup carries, and the `.fit-marked` class that reveals it.
   *
   * The label is section-level rather than per-cell because the alternative
   * needs a positioned ancestor: an absolutely-positioned tag drawn on the CELL
   * requires the cell to be `position: relative`, which changes the containing
   * block for every absolutely-positioned descendant of that cell — author
   * content moving because a QA marker was drawn. The section is ALREADY the
   * containing block the other two tabs position against, so the berth costs
   * nothing and risks nothing. A slide with more than one culprit gets one
   * label and N outlines, which is also the honest reading: the outlines say
   * where, the label says what to do.
   */
  // Parameter named `s`, matching every other per-section function in this file —
  // and load-bearing beyond style: resolve-overflow-marker.test.js derives the set
  // of classes `off` must sweep by reading `s.classList.toggle('…')` out of this
  // source, precisely so a NEW register cannot be added without the sweep learning
  // about it. A local named `section` would slip past that regex and re-open the
  // hole the derivation was written to close.
  function drawFitLabel(s, targets) {
    const mine = targets.filter((t) => t?.el && s.contains(t.el));
    const first = mine[0];
    const tab = fitBerth.berth(s, 'fixme-tab');
    const on = !!first;
    if (s.classList.contains('fit-marked') !== on) {
      s.classList.toggle('fit-marked', on);
    }
    if (!tab) return;
    const label = on ? (first.label || 'Fix Me') : '';
    // A slide can have more than one culprit and gets ONE label, so the label
    // carries the count — otherwise "Fix Me" beside three outlines reads as though
    // it names one of them.
    const text = mine.length > 1 ? `${label} ×${mine.length}` : label;
    if (tab.textContent !== text) tab.textContent = text;
    const hint = on ? (first.hint || '') : '';
    if (hint) {
      if (tab.getAttribute('title') !== hint) tab.setAttribute('title', hint);
    } else if (tab.hasAttribute('title')) {
      tab.removeAttribute('title');
    }
  }

  // ── Overflow watcher ─────────────────────────────────────────────────
  // Tags any <section> whose content exceeds the slide frame (any @size) with
  // class `overflow`, which lattice.css renders as a loud red inset ring.
  // Re-checks on resize and whenever DOM mutations land (Marp preview
  // re-renders on every keystroke).
  // `level` is the export's `overflow-marker` setting — who the signal is
  // addressed to (lib/core/resolve-overflow-marker.js). `author` draws the full
  // authoring signal (ring + "Overflows" + the per-cell "Fix Me" overlays + the
  // type-floor alarm); `reader` drops the ring and calls the tab "Content clipped"
  // and drops the QA chrome; `off` draws nothing and sweeps what an earlier pass
  // left. Each boot site resolves it with its own fallback, because the right
  // default differs by surface: a live preview is authoring, an export is not.
  function startOverflowWatcher({ level: rawLevel = AUTHORING_DEFAULT_MARKER } = {}) {
    if (typeof document === "undefined") return;
    // Normalize before anything reads it. An unrecognized level would otherwise
    // produce a HYBRID rather than a graceful degrade: `overflowMarkerPolicy` would
    // hand back the reader's label while the CSS gate (`[…="reader"]`) failed to
    // match and drew the AUTHOR red ring — a slide saying "Content clipped" inside a
    // QA box. Both call sites resolve already; this makes it structural.
    const level = resolveOverflowMarker(rawLevel, AUTHORING_DEFAULT_MARKER);
    const policy = overflowMarkerPolicy(level);
    const authorTags = policy.authorTags;
    // The attribute the TONE rules key on (base.modifiers.css): author = the loud
    // red ring + "OVERFLOWS" flag, reader = no ring and a calm "Content clipped" pill.
    // Stamped on each SECTION, never on <html>, and that is not a style choice:
    // marp-core scopes a theme rule off its LEFTMOST COMPOUND, so a
    // `:root[…] section.overflow` prelude comes out of a Marp render as
    // `… > section:not([root])[…] section.overflow` — a slide inside a slide, which
    // never matches (measured; the same trap lib/core/leading-is.js exists for). A
    // literal leading `section` is the one head marp-core scopes to the slide
    // itself, so the gate has to ride on the section.
    const MARKER_ATTR = 'data-lattice-overflow-marker';
    // The three berths, as a selector — what this watcher writes into, and so the
    // one subtree its own trigger must ignore. Same set overflow-probe.js excludes
    // from both probes (MARKER_CHROME_SELECTOR), for the same underlying reason:
    // the marker must never be the evidence for itself.
    const MARKER_CHROME = MARKER_CHROME_SELECTOR;
    // `off` still has work to do — it is not "skip the watcher". A build-time
    // stamp (lattice-emulator writes `.overflow` into the exported HTML) or an
    // earlier pass at a louder level can have left a ring and a tab in the DOM,
    // and leaving those is exactly the debug chrome `off` was asked to remove.
    // Sweep once, install nothing: no probe, no observer, no resize handler.
    if (!policy.mark) {
      // Stamp FIRST, then sweep. The sweep alone is not enough: a `--fluid` export
      // carries lattice-emulator.js's own inline watcher, which knows nothing about
      // the register and re-stamps `.overflow` on font-settle and on every resize —
      // so a one-shot sweep loses the race and a deck that asked for silence
      // rendered the loud author ring. The attribute is what the CSS suppression in
      // base.modifiers.css keys on, and it survives whatever stamps `.overflow`
      // afterwards. Sweeping too still matters: it clears what is already there.
      for (const s of document.querySelectorAll('section[data-lattice-slide]')) {
        if (s.getAttribute(MARKER_ATTR) !== level) s.setAttribute(MARKER_ATTR, level);
      }
      sweepOverflowMarkers(document);
      return;
    }
    // Sub-pixel rounding from nested flex/grid borders + shadows can push
    // scrollHeight a few px past clientHeight even when content visually
    // fits. 12px filters that noise while still catching genuine overflow
    // (smallest real bug observed in the gallery was a 211px overshoot).
    const TOL = 12;
    // Overflow is detected at the SLIDE level (content exceeds the slide
    // frame). Per-box "which cell" pinpointing was prototyped and dropped: in a
    // grow-to-fit grid (`1fr` = minmax(auto,1fr)) an oversized card doesn't clip
    // its own box — it grows and pushes its NEIGHBOURS past the frame, so a
    // geometric per-box test flags the pushed-aside cards, not the oversized
    // culprit. Slide-level is the honest granularity; the export warning lists
    // the exact pages.
    //
    // `sections` is the SWEEP PLAN's output, not "every slide in the document":
    // which slides a triggered sweep touches is `lib/core/fit-sweep.js`'s
    // decision, and the whole reason this takes an argument at all. Passing the
    // full list is still legal and is what the boot sweep and the jsdom tests do.
    // One probe failure must not silence the slides behind it. Reported once per
    // document, because a broken probe reports on EVERY sweep and a console the
    // author cannot read past is its own outage.
    let probeFailureReported = false;
    const reportProbeFailure = (err) => {
      if (probeFailureReported || typeof console === 'undefined') return;
      probeFailureReported = true;
      console.warn('[lattice-runtime] overflow probe threw; that slide is UNMEASURED '
        + '(no ring means "not checked" here, not "fits"). Later slides in this sweep '
        + 'were still measured, and the next generation retries.', err);
    };

    const check = (sections) => {
      // Fix-Me targets accumulate across every slide in the sweep (the filmstrip
      // previewers render many <section>s at once), then draw in one pass at the
      // end — mirrors how `check()` scans its whole batch before drawing.
      const fixMeTargets = [];
      // The slides this pass actually PROBED, returned so the caller can record the
      // fit-cache from what was MEASURED rather than from what was PLANNED. Those
      // are not the same list, and treating them as one is how a sweep marks a
      // slide "current" that it never looked at.
      const measured = [];
      for (const s of sections) {
        try {
        // Cell-aware: a bounded content cell (overflow:clip) CONTAINS its
        // overflow, so the section's own scrollHeight reports zero — probe the
        // clipping cells too, else the ring goes silent on an over-stuffed cell
        // (lib/core/overflow-probe.js; 2026-06-26-frames-as-flex-cell-trees.md).
        // Idempotent, like the class toggles below — the observer watches
        // attributes:true, so an unconditional write would let it react to its own
        // mutation and churn every frame.
        if (s.getAttribute(MARKER_ATTR) !== level) s.setAttribute(MARKER_ATTR, level);
        const { over, overCells, squeezed, clipSuspect } = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL, IGNORED_CLIP_SELECTOR);
        // Idempotent: only mutate the class when the state actually flips. The
        // observer below watches attributes:true, so an unconditional write
        // lets it react to its own class change and churn every frame. `.overflow`
        // (inset box-shadow) and the tab never shift layout, so a stable
        // measurement means a stable class and the loop settles.
        // Keep the class in sync with the measured state (idempotent — only
        // toggle when it differs, so the attribute observer doesn't churn).
        if (s.classList.contains('overflow') !== over) {
          s.classList.toggle('overflow', over);
        }
        // What a READER is told is narrower than what an AUTHOR is shown: `author`
        // keeps pure geometry (an over-subscribed box is a defect to fix regardless),
        // while `reader` asks whether the clip actually CUT something readable or
        // visible. Same predicate, same kernel, same answer as the emulator's inline
        // watcher (HARD RULE #1) — the two must agree or a `--fluid` export disagrees
        // with the PDF beside it. `.overflow` stays on geometry because autosplit and
        // the console report key off it; only the reader treatment yields, via
        // `.clip-marked` in base.modifiers.css.
        // OVERPRINT is lost content that crosses no box edge — a flex-shrunk child
        // painting over its next sibling, i.e. text on top of text. No rect leaves a
        // clip box, so probeContentClipped is blind to it by construction; the
        // geometry probe already measures it, so take the number from there.
        // The content probe is NOT gated behind the geometry probe any more. `over && …`
        // made every geometry blind spot load-bearing for all three registers at once —
        // #1299 shipped 24 cut text rects at `over: false` because one `.panel-left` was
        // missing from a hand-kept list, and no amount of content truth could reach it.
        // `clipSuspect` is the cheap over-eager "is any clip box hiding anything at all"
        // the same probe already computes, so the expensive text walk still never runs on
        // a slide where nothing clips — it just no longer requires the geometry to have
        // been right first. `clipSuspect` is what keeps the walk off the slides where
        // nothing clips; `author` does NOT skip it. (An earlier comment here claimed
        // "`author` short-circuits before it, so that register stays purely geometric
        // and exactly as cheap as it was." Both halves were false: `over &&` short-
        // circuits only when `over` is TRUE, so an `author` slide with `over: false,
        // clipSuspect: true` runs the whole text walk — which is exactly the ellipsis
        // case this change exists to catch, so it must. Corrected rather than deleted:
        // a false cost claim in a comment shapes the next optimization. HARD RULE #25.)
        const clip = (over || clipSuspect)
          ? probeContentClipped(s, IGNORED_CLIP_SELECTOR, TOL, IGNORED_BEARER_SELECTOR)
          : { cut: false, first: null, chromeOnly: false };
        // DETECTION is general; TREATMENT is not. `clip.cut` counts every cut, the
        // running footer's included, and that is what the author is shown. A cut that
        // is ENTIRELY inside the footer band (`chromeOnly`) is not shown to a READER:
        // the reader pill lives in that same band, so it painted an opaque capsule over
        // the confidentiality line it was reporting, on every page of any deck with an
        // ordinary `footer:` — and a reader can neither edit a footer nor scroll a PDF.
        // See probeContentClipped's climb for the full reasoning.
        const readerCut = clip.cut && !clip.chromeOnly;
        const tell = policy.authorTags
          ? (over || clip.cut)
          : ((over && squeezed > TOL) || readerCut);
        // ONE class for the whole marker question, and it is named for what it IS: a
        // TREATMENT flag, "this section shows a clip marker at the resolved level" —
        // not a fact about content. It replaced `.overflow-silent` (`over && !tell`)
        // and `.content-clipped` (`tell && !over`), two conjunctions that between them
        // left a slide which BOTH overflows and cuts carrying neither, and let the CSS
        // un-hide a population by one class while styling it by the other. It was then
        // called `.content-cut`, which read as a fact and is not one: the population is
        // level-dependent by design (at `author` it includes purely geometric overflow;
        // at `reader` it excludes footer-band cuts), so anyone querying it as "slides
        // that lost content" would get a different answer per surface. `.overflow` is
        // the fact; this is the treatment. `policy.mark` is false only at `off`, which
        // promises to leave nothing. Idempotent, like the toggle above: the observer
        // watches attributes, so an unconditional write would let it react to its own
        // mutation.
        const clipMarked = policy.mark && tell;
        if (s.classList.contains('clip-marked') !== clipMarked) {
          s.classList.toggle('clip-marked', clipMarked);
        }
        // The labelled tab (AA: name the condition in text, not colour alone)
        // tracks `over` INDEPENDENTLY of the flip above. The export stamps
        // `.overflow` at BUILD time (lattice-emulator), so for a pre-stamped
        // slide the class flip never fires — yet the reader must still see the
        // honest marker, never a silent clip.
        //
        // THE TAB IS NO LONGER CREATED OR REMOVED HERE — it is a berth the markup
        // carries (lib/core/fit-berth.js), and all this does is fill it. That
        // deletes the add/remove branch pair outright, and with it the reason
        // `overflowTabAction` existed: "should I create a node this tick" is not a
        // question any more. Three consequences worth naming, because each was a
        // shipped defect the old shape kept re-earning:
        //
        //   · `off` cannot leave a stray tab behind. It used to append one that
        //     survived purely because CSS hid it, while the emulator's inline
        //     watcher skipped the branch — two producers, different DOM, same
        //     level (HARD RULE #1). An empty berth is the same DOM either way.
        //   · A tab ANOTHER producer already wrote no longer needs reconciling as
        //     a special case. A `--fluid` export runs the emulator's inline
        //     watcher AND this one; both now write text into the same element,
        //     last writer wins, and the wording can never disagree with the
        //     styling the way `--overflow-marker=author` once shipped a calm
        //     reader pill reading "Overflows".
        //   · Nothing observes childList any more (fit-sweep.js), but even if it
        //     did, filling a berth is not a childList mutation.
        const tab = fitBerth.berth(s, 'overflow-tab');
        const drawTab = policy.mark && tell;
        // "Overflows" is the geometry word, and it was wrong on the population this
        // change added: at `author` a slide with an ellipsed label has `over: false` and
        // still drew a tab reading "Overflows", so the author hunted for a ring that was
        // correctly absent. A cut without overflow says so, in the same words the stderr
        // channel uses.
        //
        // Author preview names the defect ("Overflows" / "Content clipped"); the
        // reader gets a calm cue instead of a QA banner (both are text — WCAG 1.4.1).
        // Styling: the loud red is base.modifiers.css; the reader restyle too.
        // EMPTY when the slide fits — the berth stays, the label goes, and
        // `section:not(.clip-marked) > .overflow-tab { display: none }` was already
        // the rule that hid it.
        const tabText = drawTab
          ? (policy.authorTags && !over ? policy.tabTextCut : policy.tabText)
          : '';
        if (tab && tab.textContent !== tabText) tab.textContent = tabText;
        // §8 rule 8 — the LEGIBILITY FLOOR, on a SECOND axis. A viewBox figure is
        // container-responsive: it never overflows its box, it shrinks its own text, so
        // `probeSectionOverflow` above is blind to it by construction and a dense chart
        // ships silently at 5px type. The two conditions are orthogonal — a slide can be
        // illegible while its box fits, and it can be both — so this runs beside the
        // overflow branch, never instead of it. Same probe and same floor as the export
        // watcher (lib/core/overflow-probe.js; the emulator injects the very same function
        // source), so the live preview and the PDF cannot disagree about what "too small"
        // means.
        //
        // AUTHOR-ONLY, unlike the overflow signal beside it. Overflow has a reader
        // treatment — `overflowMarkerPolicy(level).tabText` turns "Overflows" into a plain "Content clipped"
        // below", and base.modifiers.css restyles the tab into a calm pill — because a reader
        // CAN act on clipped content by scrolling. The type floor has no reader answer: a
        // reader cannot resize a figure, so an amber alarm reading "Type 3px · floor 8.4px"
        // is a QA diagnostic in front of a boardroom. Shipped ungated, it fired on 7 of 11
        // slides of the state-chart gallery in a `--fluid` export at 390×844, overprinting
        // the deck header — the floor is a fraction of the SLIDE box, and in the fluid
        // viewer that box is the reader's phone. All three lenses of the HARD RULE #25 trio
        // caught it independently. Gated here, like the Fix-Me overlays below.
        const leg = policy.legibility ? probeFigureLegibility(s, FIGURE_TEXT_FLOOR_RATIO) : null;
        const under = !!leg?.under;
        if (s.classList.contains('illegible') !== under) {
          s.classList.toggle('illegible', under);
        }
        // Same berth treatment as the overflow tab above: the element is the
        // markup's, the text is this watcher's. `legibilityTabAction`'s add /
        // update / remove trichotomy collapses to one guarded write, because
        // there is no longer anything to add or remove.
        const legTab = fitBerth.berth(s, 'illegible-tab');
        const legText = under ? legibilityTabText(leg) : '';
        if (legTab && legTab.textContent !== legText) legTab.textContent = legText;
        // Resolve overCells' indices back to live elements. Same synchronous
        // query, same selector, no mutation in between → same NodeList order
        // as the query probeSectionOverflow ran internally.
        //
        // Collected PER SECTION and drawn per section, then folded into the
        // sweep-wide list. The label is section-level chrome (see drawFitLabel)
        // and the outlines are per-element, so the two halves need different
        // granularity from the same walk.
        const sectionTargets = [];
        if (authorTags && over && overCells?.length) {
          // Case A — a clip-cell itself is clipping (geometric fact).
          const cells = s.querySelectorAll(CLIP_CELL_SELECTOR);
          for (const oc of overCells) {
            const cellEl = cells[oc.index];
            if (!cellEl) continue;
            const culprits = drillDownCulprits(cellEl, s);
            if (culprits.length) sectionTargets.push(...culprits.map((el) => ({ el, label: 'Fix Me' })));
            else sectionTargets.push({ el: cellEl, label: 'Fix Me' });
          }
        } else if (authorTags && over) {
          // Case B — no clip-cell is over; fall back to the density-budget
          // guess (§12). Hedged label + a tooltip carrying the count, never
          // Case A's unqualified "Fix Me" (HARD RULE 23).
          const outlier = drillDownDensityOutlier(s);
          if (outlier) {
            sectionTargets.push({ el: outlier.el, label: 'Likely fix', hint: `Likely cause — ${outlier.words} words, over budget` });
          }
        }
        if (authorTags) drawFitLabel(s, sectionTargets);
        fixMeTargets.push(...sectionTargets);
        } catch (err) {
          // NOT recorded as measured — so the next sweep retries it instead of
          // skipping it as current, and the slide is never left silently unringed
          // because of a throw on some earlier slide in the same batch.
          reportProbeFailure(err);
          continue;
        }
        measured.push(s);
      }
      if (authorTags) markFitCulprits(sections, fixMeTargets);
      return measured;
    };

    // ── The sweep: WHEN this runs, and over WHAT ────────────────────────────
    //
    // This used to be one line — `schedulePostMutation(check)` — which put the
    // whole-document scan on a rAF-coalesced MutationObserver watching
    // `document.body` for childList, characterData AND attributes. The policy
    // now lives in lib/core/fit-sweep.js; what follows is its wiring. See that
    // file for the measurements and the reasoning; the short version is that
    // the old shape scanned every slide in the deck on every frame in which
    // anything changed, forced layout on slides the preview had deliberately
    // virtualized away, and — because the watcher's own class and attribute
    // writes were mutations the same observer saw — kept a permanent loop one
    // forgotten idempotency guard away.
    //
    // A GENERATION is one settled render. Bumped by the things that can change
    // a verdict; never by this function's own writes.
    const fitState = new WeakMap();
    let fitGeneration = 0;
    const slides = () => [...document.querySelectorAll('section[data-lattice-slide]')];

    // The marker LEVEL is stamped on every slide, always — not just the swept
    // ones, and not just once. It is what the CSS tone rules key on, so an
    // unstamped slide renders the author's red ring at `reader` level; scoping
    // it to the sweep would mean a slide flashing the author ring for the frame
    // between scrolling into view and being measured. One guarded attribute
    // write per slide, no measurement, no layout read.
    const stampLevel = () => {
      for (const s of slides()) {
        if (s.getAttribute(MARKER_ATTR) !== level) s.setAttribute(MARKER_ATTR, level);
      }
    };

    const sweep = ({ bandRatio } = {}) => {
      const all = slides();
      stampLevel();
      const plan = planFitSweep({
        sections: all,
        generation: fitGeneration,
        viewportH: typeof window !== 'undefined' ? window.innerHeight : 0,
        rectOf: (s) => (typeof s.getBoundingClientRect === 'function' ? s.getBoundingClientRect() : null),
        boxOf: (s) => ({ w: s.offsetWidth, h: s.offsetHeight }),
        stateOf: (s) => fitState.get(s),
        ...(bandRatio === undefined ? {} : { bandRatio }),
      });
      if (!plan.measure.length) return plan;
      // RECORD AFTER MEASURING, never before — the fit-cache is a record of what
      // was probed, and writing it from the PLAN makes it a record of intent.
      //
      // The difference is not academic. `check()` is one loop over the batch; a
      // throw on slide k used to leave k+1…N unprobed but stamped `current` at
      // this generation, and the scroll path deliberately does NOT open a new
      // generation — so those slides were skipped as already-done on every
      // subsequent scroll sweep. Reproduced on the real bundle: two slides
      // overflowing by 1300px, no ring, no tab, and scrolling them back into view
      // did not recover them, which is exactly the recovery the gotchas entry
      // promises. Only a fresh generation cleared it.
      const planned = new Map(plan.measure.map((m) => [m.section, m]));
      for (const s of check(plan.measure.map((m) => m.section))) {
        const m = planned.get(s);
        if (m) fitState.set(s, { gen: fitGeneration, w: m.w, h: m.h });
      }
      return plan;
    };

    // A NEW generation: everything measurable is re-measured next sweep. This is
    // the call for "the document changed" — a re-render, a resize, fonts landing.
    const invalidate = () => { fitGeneration++; };

    // Trailing-edge debounce. NOT rAF: a frame is the wrong unit for "has the
    // render settled", and rAF is what made the old watcher a per-frame tax.
    // 150ms matches scheduleRun's own settle window (the Mermaid/content pass),
    // so an edit burst produces one content pass and one sweep rather than
    // interleaving them.
    let sweepHandle = null;
    // THE COMPLETENESS BACKSTOP. Every sweep re-arms it; when the deck finally
    // goes quiet it measures the WHOLE document at the CURRENT generation, so
    // every slide the interactive band never reached gets its verdict.
    //
    // This is what makes the band safe to keep. On its own the band is silent on
    // whole classes of render target — measured on the real bundle, a 12-slide
    // all-overflowing deck marks 3 of 12 when nobody scrolls, and still 3 of 12
    // after `page.pdf()`, which is the shape of a print and of an Export-to-Marp
    // bundle (that path renders through THIS runtime inside marp-cli, where it is
    // the only marker producer). It is also silent on slides you scroll straight
    // past: one slide fell between two sampled bands and was never measured at
    // all. Both are the silent clip this register exists to prevent.
    //
    // Nearly free, and that is why it can just always run: it does NOT open a new
    // generation, so the cache skips every slide already measured and only the
    // never-measured ones cost a probe. On a settled deck it is one rect read per
    // section (0.1ms across 117) and zero probes.
    //
    // LONGER than the interactive window on purpose. It is the thing that runs
    // when nothing else is happening, so it must not fire in the middle of an
    // edit burst and re-measure the deck while the author is typing.
    // A monotonic-ish clock for the max-wait below. `performance.now()` where it
    // exists (monotonic, immune to a wall-clock jump); `Date.now()` otherwise.
    const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now());
    const BACKSTOP_MS = 800;
    //
    // IT HAS ITS OWN MAX WAIT, and leaving that out was a real defect rather than
    // a theoretical one. As a pure trailing debounce the backstop is only as
    // reliable as the quietest moment in the document — and a document that never
    // goes quiet never gets complete coverage. Measured on the repo's own
    // 117-slide baseline gallery: the `contact` and `wifi` transforms re-assigned
    // `innerHTML` on every content pass (their idempotency guard looked for a
    // direct child the Form composition had already moved into `.cell-stage`),
    // which scheduled the next pass, ~5.3 times a second, forever. Every one of
    // those re-armed the backstop, so it never fired and 18 of 21 overflowing
    // slides in the red team's deck carried no ring at all.
    //
    // That root cause is fixed too (lib/transformers/contact.js, wifi.js), but the
    // guard belongs here regardless: this is the mechanism that guarantees
    // coverage, and it must not be defeasible by anything that happens to keep the
    // document busy — a chatty transform, an animation, a host that re-renders on
    // a timer. This is the same trailing-debounce trap the interactive sweep
    // carries `SWEEP_MAX_WAIT_MS` for, and it was left off the one timer whose
    // whole job is to be the thing that eventually runs.
    const BACKSTOP_MAX_WAIT_MS = 4000;
    let backstopHandle = null;
    let backstopPendingSince = 0;
    const runBackstop = () => {
      backstopHandle = null;
      backstopPendingSince = 0;
      sweep({ bandRatio: COMPLETE_SWEEP });
    };
    const armBackstop = () => {
      const now = nowMs();
      if (!backstopPendingSince) backstopPendingSince = now;
      if (now - backstopPendingSince >= BACKSTOP_MAX_WAIT_MS) {
        if (backstopHandle) clearTimeout(backstopHandle);
        runBackstop();
        return;
      }
      if (backstopHandle) clearTimeout(backstopHandle);
      backstopHandle = setTimeout(runBackstop, BACKSTOP_MS);
    };
    // A MAX WAIT, because a trailing debounce alone never fires while the input
    // keeps arriving. Scroll events land every ~16ms, so each one reset the timer
    // and a reader scrolling a long deck got NO sweeps at all until they stopped —
    // measured: a full continuous scroll of a 12-slide deck added zero coverage.
    // A trailing debounce is the right shape for an edit burst (coalesce, then act
    // once) and the wrong one for a continuous gesture; this keeps both.
    const SWEEP_MAX_WAIT_MS = 250;
    let sweepPendingSince = 0;
    const runSweep = () => {
      sweepHandle = null;
      sweepPendingSince = 0;
      sweep();
      armBackstop();
    };
    const scheduleSweep = ({ fresh = true } = {}) => {
      if (fresh) invalidate();
      const now = nowMs();
      if (!sweepPendingSince) sweepPendingSince = now;
      // Past the max wait, run NOW rather than pushing the timer out again.
      if (now - sweepPendingSince >= SWEEP_MAX_WAIT_MS) {
        if (sweepHandle) clearTimeout(sweepHandle);
        runSweep();
        return;
      }
      if (sweepHandle) clearTimeout(sweepHandle);
      sweepHandle = setTimeout(runSweep, DEBOUNCE_MS);
    };

    // Boot: measure synchronously, before the first paint the author sees. The
    // debounced path cannot do this job — a 150ms-late first ring is a visible
    // flash of "everything fits" on a deck that does not.
    //
    // GUARDED, because everything below this line is REGISTRATION. `check()` now
    // contains its own per-slide guard, so reaching this catch means the plan
    // itself failed (no layout, a hostile host) — and letting that escape would
    // take the font-settle re-measure, the content-settled hook, both listeners
    // and `latticeSweep` with it, disabling the watcher for the document's whole
    // life over one bad frame at boot. The old shape lost only three
    // registrations to the same throw; this one would lose the lot, which is a
    // fragility this change would otherwise have made worse (HARD RULE #18).
    try { sweep(); } catch (err) { reportProbeFailure(err); }
    // …and arm the backstop from the boot sweep, so a document NOBODY ever
    // touches — a print, a marp-cli render, a static page a reader just opens —
    // still gets a complete verdict without needing an interaction to trigger one.
    armBackstop();

    // The boot sweep can measure a not-yet-rendered slide's text against
    // FALLBACK font metrics — the browser lazy-loads a @font-face only when text
    // using it is first painted, so document.fonts.ready can resolve before
    // every font this document will ever need has actually loaded (mirrors the
    // identical race lattice-emulator.js's embedded export watcher had, issue
    // #894). A new generation, so the re-measure is not skipped as current.
    if (typeof document.fonts !== 'undefined') {
      try {
        settleFonts(document.fonts, 2000).then(
          () => { invalidate(); sweep(); armBackstop(); },
          () => { invalidate(); sweep(); armBackstop(); },
        );
      } catch (_e) { /* fonts API present but unusable — the boot sweep above stands */ }
    }

    // CONTENT, part 1 — after the transforms. `scheduleRun`'s observer (childList
    // + subtree) drives the debounced content pass, and this rides its completion
    // rather than installing a duplicate: measuring the arrangement the transforms
    // just replaced is measuring a slide that no longer exists.
    onContentSettled(() => scheduleSweep());

    // CONTENT, part 2 — the mutations that pass NEVER SEES.
    //
    // `scheduleRun`'s observer watches `childList` and `subtree` only. Dropping
    // `attributes` is the whole loop fix and is deliberate: the watcher's class
    // toggles and level stamps are attribute writes, and an observer that sees
    // them is an observer that schedules itself.
    //
    // Dropping `characterData` was NOT deliberate, and it was a silent hole. The
    // old watcher observed it; riding an observer that does not meant a text node
    // growing in place — `node.nodeValue = …`, no element added or removed —
    // changed nothing anyone could see. Reproduced in Chromium on a real
    // engine-rendered deck: one slide grown to 4000 words overflowed by 1613px and
    // stayed unringed indefinitely, until an unrelated childList mutation
    // elsewhere happened to trigger a sweep. A `characterData` mutation IS a DOM
    // mutation; the decision note's claim that only a non-mutation layout change
    // could be missed was wrong, and this is the repair.
    //
    // SO IT GETS ITS OWN OBSERVER, and the filter is what makes that safe rather
    // than a reinstatement of the old cycle. Filling a berth writes text, which is
    // exactly the mutation class this observes — so a record whose target sits
    // inside marker chrome is dropped before it can schedule anything. That is a
    // narrower and more checkable rule than "don't observe the category at all":
    // the watcher's own writes are confined to three named elements, and nothing
    // else in the document is filtered.
    if (typeof MutationObserver !== 'undefined' && document.body) {
      const inMarkerChrome = (node) => {
        const el = node && (node.nodeType === 1 ? node : node.parentElement);
        return !!el && typeof el.closest === 'function' && !!el.closest(MARKER_CHROME);
      };
      new MutationObserver((records) => {
        for (const r of records) {
          if (!inMarkerChrome(r.target)) { scheduleSweep(); return; }
        }
      }).observe(document.body, { subtree: true, characterData: true });
    }

    // GEOMETRY. Every box changed, so every verdict is stale.
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('resize', () => scheduleSweep());
      // SCROLL brings unmeasured slides into the band. It changes no verdict, so
      // it does NOT open a generation — it just re-runs the plan, which picks up
      // whatever is newly in play and skips everything already current. On a
      // deck where nothing new scrolled in this costs one rect read per slide.
      window.addEventListener('scroll', () => scheduleSweep({ fresh: false }), { passive: true });
    }

    // The host's own hook. The Studio and the Playground patch slide DOM directly
    // (docs/src/playground/deck-preview.js, docs/src/lib/single-slide-render.ts)
    // and know exactly when a render has landed — better than any observer can
    // infer. Exposed so they can say so rather than relying on the 150ms fallback;
    // nothing is REQUIRED to call it, because the observer path already covers the
    // same ground more slowly.
    //
    // `sweep` is the synchronous form for a caller that needs the verdict now (a
    // test, the bench tier, an export handoff) and it returns the plan, so a caller
    // can see what was probed and what was skipped rather than inferring coverage.
    //
    // NAMED `latticeSweep`, NOT `latticeFit`: the filmstrip already injects an
    // agent called `__latticeFit` (docs/src/playground/deck-preview.js) whose job
    // is SCALING slides to the pane. Two different subsystems one underscore apart
    // is a name collision waiting to be debugged at 2am.
    globalScope.latticeSweep = {
      // `all: true` measures the whole document rather than the interactive band —
      // for a host that knows it is about to print, export, or hand the deck off,
      // and cannot wait out the backstop. Always opens a new generation: a caller
      // asking for a sweep is asking for a fresh answer, not a cached one.
      sweep: (opts) => {
        invalidate();
        const plan = sweep(opts?.all ? { bandRatio: COMPLETE_SWEEP } : undefined);
        armBackstop();
        return plan;
      },
      // THE BACKSTOP, on demand: give every slide a verdict, WITHOUT re-opening a
      // generation — so a slide already measured is skipped by the cache and only
      // the never-measured ones cost a probe. This is what the idle timer runs.
      //
      // It is a separate entry point from `sweep({ all: true })` precisely because
      // the two differ in the expensive way, which the bench caught: `sweep()`
      // invalidates first, so on a settled 40-slide deck it re-probes all 40 and
      // costs the full whole-document price. Same coverage, an order of magnitude
      // apart. A host that wants "make sure nothing is unmeasured" wants this one;
      // a host that wants "re-measure, the world changed" wants the other.
      complete: () => sweep({ bandRatio: COMPLETE_SWEEP }),
      schedule: () => scheduleSweep(),
      generation: () => fitGeneration,
    };
  }

  // ── function-plot inflater ────────────────────────────────────────────
  // The markdown-it plugin `functionPlotFences` emits
  //   `<div class="functionplot" data-fp-config="…base64 JSON…"></div>`
  // and this inflates that placeholder wherever `window.functionPlot` is
  // present. The emulator path (lattice-emulator.js) injects function-plot.js
  // plus an inline inflater into the print HTML; on a live engine-rendered
  // surface (the HTML player, the Studio/Playground preview) this function is
  // what draws the curve.
  //
  // NOT on any Marp surface, and an earlier version of this comment said
  // otherwise — it claimed that in the marp-vscode preview "the runtime is what
  // makes it animate." It cannot be. `functionPlotFences` is one of Lattice's
  // OWN markdown-it plugins, and no Marp surface runs those (marp-vscode and
  // marp-cli both parse with raw marp-core), so the placeholder div is never
  // created there and this selector matches nothing. Measured on a real
  // marp-cli render of a `functionplot` fence: 0 `div.functionplot`, 0
  // `data-fp-config`, and the fence surviving as a plain code block —
  // which is exactly what `lib/core/marp-fidelity.js` already records for this
  // plugin as `unmirrored`.
  //
  // The practical consequence, since it keeps coming up: shipping
  // function-plot.js in the Export-to-Marp bundle or `dist/marp-kit` would fix
  // nothing. Mermaid is the only third-party SCRIPT those artifacts need — they
  // do carry other third-party files (the KaTeX faces and five OFL font
  // families), but those are assets the CSS references, not code the runtime
  // calls, and they ship for a different reason entirely. Mermaid earns its
  // place because a fenced `mermaid` block becomes
  // `<pre><code class="language-mermaid">` in ANY markdown renderer, so the
  // runtime can find it without a Lattice plugin having run. That is the test
  // for whether a LIBRARY belongs in a hand-off artifact: does the DOM node it
  // needs survive a PLAIN parse?
  function inflateFunctionPlots() {
    if (typeof window === 'undefined' || typeof window.functionPlot !== 'function') return;
    const divs = document.querySelectorAll('div.functionplot[data-fp-config]');
    divs.forEach((div) => {
      if (div.dataset.fpInflated === '1') return;
      try {
        const cfg = JSON.parse(atob(div.getAttribute('data-fp-config')));
        const rect = div.getBoundingClientRect();
        cfg.target = div;
        cfg.width  = cfg.width  || Math.round(rect.width)  || 480;
        cfg.height = cfg.height || Math.round(rect.height) || 320;
        if (!cfg.tip) cfg.tip = { renderer: ()=> {} };
        window.functionPlot(cfg);
        div.dataset.fpInflated = '1';
      } catch (e) {
        div.textContent = 'functionplot error: ' + e.message;
        div.classList.add('functionplot-error');
      }
    });
  }

  // ── Fluid-box viewer controller ─────────────────────────────────────────
  // Opt-in responsive *viewing* of a fixed deck (design: engineering/decisions/
  // 2026-06-21-fluid-box-viewer-design.md). INERT unless the page is flagged
  // fluid-capable — lattice-emulator `--fluid` sets <html data-lattice-fluid-
  // capable>; nothing else does — so this never runs in a normal preview/export.
  //
  // When capable it sets/clears :root[data-lattice-view="fluid"]. The CSS
  // (lib/base/base.fluid-view.css) does the box change (fixed px box → viewport
  // scroll-snap box); the box change is the whole trigger — on the resize this
  // dispatches, patchSectionGeometry re-stamps data-orientation + the cqi font
  // var off the new (portrait, on a phone) box, and the @container reflows fire.
  function initFluidView() {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    if (!root.hasAttribute("data-lattice-fluid-capable")) return; // opt-in only

    // Opt-in control. Styled in base.fluid-view.css; present in both states so a
    // reader can switch back to the authored fixed deck.
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "lattice-fluid-toggle";
    btn.setAttribute("aria-label", "Toggle fluid viewing");

    function apply(on) {
      if (on) root.setAttribute("data-lattice-view", "fluid");
      else root.removeAttribute("data-lattice-view");
      btn.textContent = "Fluid: " + (on ? "on" : "off");
      btn.setAttribute("aria-pressed", String(on));
      // injectOrientationStyle injects a global section{--canvas-scale:N…} ONCE off
      // the first box it sees and never updates it. On a toggle the box aspect
      // flips, so drop the stale style; the resize below lets patchSectionGeometry
      // re-derive it for the new box (canvas-scale falls back to 1 in fixed view).
      const os = document.getElementById("lattice-orientation");
      if (os) os.remove();
      window.dispatchEvent(new Event("resize")); // re-measure → re-stamp orientation
    }

    (document.body || root).appendChild(btn);
    btn.addEventListener("click", () => apply(root.getAttribute("data-lattice-view") !== "fluid"));

    // Initial mode: an explicit ?view=fluid / #fluid (or fixed) wins; otherwise
    // default to the device — fluid in a portrait viewport (a phone), the authored
    // fixed deck in a landscape one (a laptop). Exact hash match so a `#fixed…`
    // in-page anchor can't be mistaken for a mode request.
    const loc = window.location || {};
    const q = loc.search || "", h = loc.hash || "";
    const wants = (mode) =>
      new RegExp("[?&]view=" + mode + "(?:&|$)").test(q) || h === "#" + mode || h === "#view=" + mode;
    if (wants("fixed")) apply(false);
    else if (wants("fluid")) apply(true);
    else {
      // Default: fill EVERY screen. P1 excluded ultrawide (no cap → dead band);
      // P2 adds the CSS edge cap (base.fluid-view.css `--fill-max-aspect`), so an
      // ultrawide box now fills capped inside a symmetric frame instead of falling
      // back to the letterboxed fixed deck. Portrait/landscape unchanged (fill).
      apply(true);
    }
  }

  if (typeof document === "undefined") return;
  function boot() {
    // Fluid viewer (export DOM — lattice-emulator --fluid). The content is
    // already fully transformed at build time, so bootstrap()'s live-preview
    // content transforms are both redundant and UNSAFE here: they assume
    // pre-transform DOM and throw on the rendered export (the reason a normal
    // export strips this runtime). Run ONLY what the fluid view needs — the
    // controller (sets the viewport box) then geometry (stamps data-orientation
    // + the --_sec-1cqi var off the now-portrait box, so the portrait type scale
    // and the [data-orientation] reflows fire, and resize stays wired).
    if (document.documentElement.hasAttribute("data-lattice-fluid-capable")) {
      initFluidView();
      try { patchSectionGeometry(); } catch (_e) { /* geometry is best-effort */ }
      // The honest overflow ring (Fit Ladder move 4 — never a silent clip). The
      // fluid box can hand a dense slide less room than it needs; the reader sees
      // an honest "Overflows" marker + ring, not vanished content. Reader mode:
      // no author "Fix Me" tags. engineering/decisions/2026-07-20-adaptive-viewport-fill.md P1.
      // The fluid viewer is a READER surface by construction, so `reader` is its
      // fallback — and in practice its ONLY answer: lattice-emulator.js's `--fluid`
      // export writes no export-settings block (only the Marp producers do), so
      // there is nothing here to override it. Named explicitly rather than left to
      // the presence heuristic, because the absence of a block would otherwise read
      // as "authoring surface" and hand a reader the red ring.
      try { startOverflowWatcher({ level: deckOverflowMarker(EXPORT_DEFAULT_MARKER) }); }
      catch (_e) { /* watcher is best-effort */ }
      return;
    }
    bootstrap(); inflateFunctionPlots();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  // Re-inflate as the preview re-renders slides on edit.
  if (typeof MutationObserver !== 'undefined') {
    let raf = 0;
    new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; inflateFunctionPlots(); });
    }).observe(document.body || document.documentElement, { subtree: true, childList: true });
  }
})();
