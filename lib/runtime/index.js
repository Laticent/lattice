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
const { modeClasses, MODE_TOKENS } = require('../../lib/core/resolve-mode');
const { readFrontMatterBackdrop, backdropStrength, backdropClasses } = require('../../lib/core/resolve-backdrop');
const { CLIP_CELL_SELECTOR, probeSectionOverflow } = require('../../lib/core/overflow-probe');
const { familyFor, orientationFor: deckOrientation } = require('../../lib/adaptive/families');
// Self-contained Form Tiles (issue #356): each owns BOTH its adapters
// (HTML-string + DOM) in one kernel under lib/forms/tile/<id>. The runtime uses
// the DOM adapter (applyToDom). This replaced the old lib/runtime/form-dom.js
// mirror file, which is gone now that every Tile owns its own DOM injector.
const metaTile = require('../../lib/forms/tile/meta/meta.transform');
const progressTile = require('../../lib/forms/tile/progress/progress.transform');
const watermarkTile = require('../../lib/forms/tile/watermark/watermark.transform');
const { reorientMermaidForPortrait } = require('../../lib/integrations/mermaid/reorient');

(() => {
  const globalScope = typeof window !== "undefined" ? window : globalThis;
  if (globalScope.__llMermaidBootstrapLoaded) return;
  globalScope.__llMermaidBootstrapLoaded = true;

  // Marp preview often re-renders slide DOM on edit without a full page reload.
  // A one-shot DOMContentLoaded init can miss newly inserted fences, making Mermaid
  // appear to "randomly" stop rendering. We keep a lightweight observer that
  // schedules Mermaid runs when Mermaid fences/containers are added/changed.

  // ── Build Mermaid themeVariables from the active theme's CSS custom properties ──
  // Reads computed values from the loaded palette file (themes/indaco.css,
  // themes/cuoio.css, …) so that themeVariables always match whatever palette
  // is active in the Marp preview. The CSS variables referenced here are the
  // --diagram-* tokens each palette declares; the renderer is otherwise
  // palette-blind. Per-diagram CSS overrides live in lattice.css's DIAGRAM
  // OVERRIDES section (loaded via the page stylesheet), not in this runtime —
  // only Mermaid's own themeVariables API surfaces are wired up here.
  // See engineering/decisions/2026-05-12-diagram-tokens.md for the architecture.
  function buildMermaidThemeVars() {
    if (typeof document === 'undefined') return {};
    // Marp scopes CSS custom properties to <section> elements, not :root.
    // Reading from document.documentElement always returns empty strings for
    // theme tokens. Use the first section in the DOM so getComputedStyle sees
    // the cascade from the Marp-scoped rule that actually defines these vars.
    const scopeEl = document.querySelector('section') ?? document.documentElement;
    const s = getComputedStyle(scopeEl);
    const v = (name) => s.getPropertyValue('--' + name).trim();

    // Colour resolver. CSS custom properties returned via getPropertyValue
    // come back as the raw token stream — so a token defined as
    // `light-dark(#FAF7F2, #15110D)` reads as that literal string, which
    // Mermaid's color parser rejects with "Unsupported color format".
    // Setting a real `color` property to `var(--name)` on a probe element
    // forces the browser to resolve light-dark() / color-mix() / etc. to
    // a flat rgb() value, which Mermaid accepts. The probe inherits
    // color-scheme from `scopeEl`, so per-section dark contexts resolve
    // to the dark side automatically. Falls back to raw string access for
    // non-color tokens (fontFamily etc.).
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
    scopeEl.appendChild(probe);
    const vc = (name) => {
      probe.style.color = '';
      probe.style.color = `var(--${name})`;
      const c = getComputedStyle(probe).color;
      if (c && c !== 'rgba(0, 0, 0, 0)') return c;
      // Probe didn't resolve — either the var is undefined or the value uses
      // a function the browser doesn't support (e.g. light-dark() on older
      // Chromium builds). Parse light-dark() manually so Mermaid never sees
      // the raw token string, which it rejects as "Unsupported color format".
      const raw = v(name);
      const ld = /^light-dark\(\s*([^,]+?)\s*,\s*(.+?)\s*\)$/i.exec(raw);
      if (ld) {
        const isDark = (getComputedStyle(scopeEl).colorScheme || '').includes('dark');
        return isDark ? ld[2].trim() : ld[1].trim();
      }
      return raw;
    };

    const bg      = vc('bg');
    const bgAlt   = vc('bg-alt');
    const text    = vc('text-heading');
    const ink     = vc('cat-on-fill');
    const border  = vc('diagram-stroke');
    const line    = vc('diagram-line');
    const primary = vc('cat-1-fill');
    const second  = vc('cat-2-fill');
    const slate   = vc('cat-8-mark');

    const result = {
      fontFamily: v('font-body') || "'Outfit', system-ui, sans-serif",
      fontSize: '14px',

      // Canvas and primary fills
      background:               bg,
      primaryColor:             primary,
      primaryTextColor:         text,
      primaryBorderColor:       border,
      secondaryColor:           second,
      secondaryTextColor:       text,
      secondaryBorderColor:     border,
      tertiaryColor:            bgAlt,
      tertiaryBorderColor:      border,
      tertiaryTextColor:        text,
      textColor:                text,
      titleColor:               text,
      labelTextColor:           text,
      loopTextColor:            text,
      classText:                text,
      labelColor:               text,

      // Lines
      lineColor:                line,
      defaultLinkColor:         line,
      edgeLabelBackground:      bg,
      labelBackground:          bg,

      // Flowchart
      mainBkg:                  primary,
      nodeBorder:               border,
      nodeTextColor:            text,
      clusterBkg:               bgAlt,
      clusterBorder:            border,

      // Categorical scale — cScale feeds kanban columns, mindmap levels,
      // gitgraph branches, etc. lattice-diagram.css already routes pale
      // section fills through --cN-light for the diagrams we override
      // explicitly; cScale is the fallback for diagrams that read it
      // directly (or for the saturated-mark mode kanban applies before
      // the lighten step). Fed from --cat-* (mid-tone L≈60).
      cScale0:  vc('cat-1-mark'),   cScale1:  vc('cat-2-mark'),
      cScale2:  vc('cat-3-mark'), cScale3:  vc('cat-4-mark'),
      cScale4:  vc('cat-5-mark'),   cScale5:  vc('cat-6-mark'),
      cScale6:  vc('cat-1-mark'),   cScale7:  vc('cat-2-mark'),
      cScale8:  vc('cat-3-mark'), cScale9:  vc('cat-4-mark'),
      cScale10: vc('cat-5-mark'),   cScale11: vc('cat-6-mark'),

      // cScaleLabel — text fill emitted by Mermaid's auto-generated rule
      // `.section-${r-1} text { fill: cScaleLabel${r} }`. Mermaid derives
      // cScaleLabel* from cScale* via WCAG-aware contrast logic, but with
      // our mid-tone cScale that derivation lands on WHITE — which fails
      // catastrophically when our CSS overrides also paint the band fill
      // pale. Set each slot to the paired band-text token so the auto
      // rule lands on the same dark ink as our explicit overrides. Covers
      // the timeline `section--1` edge case too (Mermaid generates the
      // rule, our `.section--1` CSS in lattice-diagram.css is the belt;
      // this is the braces).
      cScaleLabel0:  ink, cScaleLabel1:  ink, cScaleLabel2:  ink,
      cScaleLabel3:  ink, cScaleLabel4:  ink, cScaleLabel5:  ink,
      cScaleLabel6:  ink, cScaleLabel7:  ink, cScaleLabel8:  ink,
      cScaleLabel9:  ink, cScaleLabel10: ink, cScaleLabel11: ink,

      // fillType — subgraph and mindmap level fills (pale band)
      fillType0: primary,                 fillType1: second,
      fillType2: vc('cat-3-fill'),    fillType3: vc('cat-4-fill'),
      fillType4: vc('cat-5-fill'),    fillType5: vc('cat-6-fill'),
      fillType6: primary,                 fillType7: second,

      // Sequence diagram
      actorBkg:              primary,
      actorBorder:           border,
      actorTextColor:        text,
      actorLineColor:        line,
      signalColor:           line,
      signalTextColor:       text,
      labelBoxBkgColor:      bgAlt,
      labelBoxBorderColor:   border,
      activationBkgColor:    primary,
      activationBorderColor: border,
      sequenceNumberColor:   text,

      // Notes
      noteBkgColor:    vc('diagram-note'),
      noteTextColor:   text,
      noteBorderColor: vc('diagram-today'),

      // Error
      errorBkgColor:  vc('diagram-critical'),
      errorTextColor: vc('cat-on-mark'),

      // Pie chart
      pie1:  primary,                  pie2:  second,
      pie3:  vc('cat-3-fill'),     pie4:  vc('cat-4-fill'),
      pie5:  vc('cat-5-fill'),     pie6:  vc('cat-6-fill'),
      pie7:  vc('cat-7-fill'),     pie8:  vc('cat-8-fill'),
      pie9:  vc('cat-9-fill'),     pie10: vc('cat-10-fill'),
      pie11: vc('cat-11-fill'),    pie12: vc('cat-12-fill'),
      pieTitleTextSize:    '18px',
      pieTitleTextColor:   text,
      pieSectionTextSize:  '14px',
      pieSectionTextColor: text,
      pieLegendTextSize:   '13px',
      pieLegendTextColor:  text,
      pieStrokeColor:      bg,
      pieStrokeWidth:      '2px',
      pieOuterStrokeWidth: '2px',
      pieOuterStrokeColor: border,
      pieOpacity:          '1',

      // Gantt
      sectionBkgColor:        bgAlt,
      altSectionBkgColor:     bg,
      sectionBkgColor2:       primary,
      taskBkgColor:           primary,
      taskTextColor:          text,
      taskTextLightColor:     text,
      taskTextOutsideColor:   text,
      taskTextDarkColor:      text,
      taskTextClickableColor: text,
      taskBorderColor:        border,
      activeTaskBkgColor:     vc('diagram-active'),
      activeTaskBorderColor:  vc('diagram-active-mark'),
      gridColor:              vc('diagram-done'),
      doneTaskBkgColor:       vc('diagram-done'),
      doneTaskBorderColor:    vc('diagram-done-mark'),
      critBkgColor:           vc('diagram-critical'),
      critBorderColor:        vc('diagram-critical-mark'),
      todayLineColor:         vc('diagram-today'),

      // Git graph
      git0: vc('cat-1-mark'),   git1: vc('cat-2-mark'),
      git2: vc('cat-3-mark'), git3: vc('cat-4-mark'),
      git4: vc('cat-5-mark'),   git5: vc('cat-6-mark'),
      git6: vc('cat-8-mark'),  git7: vc('cat-7-mark'),
      gitBranchLabel0: text, gitBranchLabel1: text,
      gitBranchLabel2: text, gitBranchLabel3: text,
      gitBranchLabel4: text, gitBranchLabel5: text,
      gitBranchLabel6: text, gitBranchLabel7: text,
      commitLabelColor:      text,
      commitLabelBackground: bgAlt,
      tagLabelColor:         bg,
      tagLabelBackground:    border,
      tagLabelBorder:        text,

      // Quadrant chart
      quadrant1Fill:                    vc('cat-1-fill'),
      quadrant2Fill:                    vc('cat-2-fill'),
      quadrant3Fill:                    vc('cat-3-fill'),
      quadrant4Fill:                    vc('cat-4-fill'),
      quadrant1TextFill:                vc('cat-1-mark'),
      quadrant2TextFill:                vc('cat-2-mark'),
      quadrant3TextFill:                vc('cat-3-mark'),
      quadrant4TextFill:                vc('cat-4-mark'),
      quadrantPointFill:                border,
      quadrantPointTextFill:            text,
      quadrantXAxisTextFill:            text,
      quadrantYAxisTextFill:            text,
      quadrantInternalBorderStrokeFill: slate,
      quadrantExternalBorderStrokeFill: border,
      quadrantTitleFill:                text,

      // State / class diagram
      altBackground: bgAlt,

      // XY chart
      xyChart: {
        backgroundColor: bg,
        titleColor:       text,
        xAxisTitleColor:  text,
        xAxisLabelColor:  text,
        xAxisLineColor:   border,
        xAxisTickColor:   slate,
        yAxisTitleColor:  text,
        yAxisLabelColor:  text,
        yAxisLineColor:   border,
        yAxisTickColor:   slate,
        plotColorPalette: [
          vc('cat-1-mark'),   vc('cat-2-mark'),
          vc('cat-3-mark'), vc('cat-4-mark'),
          vc('cat-5-mark'),   vc('cat-6-mark'),
        ].join(','),
      },

      // ER diagram
      attributeBackgroundColorOdd:  primary,
      attributeBackgroundColorEven: bgAlt,
    };

    // Tear down the probe element. Must happen AFTER the result object is
    // built — vc() reads from the live DOM each time, so the probe must
    // live until every value is materialized.
    if (probe.parentNode) probe.parentNode.removeChild(probe);
    return result;
  }

  // Trailing-edge debounce for Marp's re-render mutation bursts (typically
  // 5–10 mutations within ~30ms). 150ms coalesces them below the
  // perceptible-lag threshold. We don't section-scope: initAndRun filters on
  // data-mermaid-state="pending" so already-rendered diagrams are no-ops.
  const DEBOUNCE_MS = 150;
  let scheduledRunHandle = null;
  function scheduleRun() {
    if (scheduledRunHandle) clearTimeout(scheduledRunHandle);
    scheduledRunHandle = setTimeout(() => {
      scheduledRunHandle = null;
      initAndRun();
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

  function ensureConfigured(mermaid, { force = false } = {}) {
    // Guard: don't lock the config until the theme's CSS custom properties are
    // actually resolved. On the first tick in Marp's webview, getComputedStyle
    // may return empty strings for --diagram-* vars if the stylesheet hasn't
    // been applied yet. An empty primaryColor causes Mermaid to fall back to
    // its built-in base defaults (#fff4dd yellow), which cascades into yellow
    // clusters and wrong cScale values. Check one sentinel var — if it's empty,
    // skip initialization this tick (the rAF retry will catch it next frame).
    //
    // `force=true` bypasses the sentinel after the rAF retry budget is
    // exhausted. Some preview environments (notably marp-vscode's webview)
    // never expose theme CSS vars to JS — the themed `<section>` is loaded
    // but the cascade from a Marp scoped rule does not propagate to
    // `getComputedStyle` reads in the way the file:// browser preview does.
    // Without force, every diagram would stay forever in data-mermaid-state=pending.
    if (globalScope.__llMermaidConfigured) return true;
    const scopeEl = document.querySelector('section') ?? document.documentElement;
    const haveTheme = !!getComputedStyle(scopeEl).getPropertyValue('--cat-1-fill').trim();
    if (!haveTheme && !force) return false;
    if (!haveTheme && force && typeof console !== 'undefined') {
      console.warn('[lattice-runtime] theme CSS vars not resolved after retry budget; proceeding with Mermaid defaults');
    }

    mermaid.initialize({
      startOnLoad: false, // We orchestrate rendering ourselves via mermaid.render() so we can attribute success/failure per-fence and surface the parse error to the user.
      theme: "base",
      securityLevel: "loose",        // Required to allow HTML (e.g. <br/>) in node labels; htmlLabels:true alone is not sufficient.
      suppressErrorRendering: true,  // We use mermaid.render() with try/catch and inject our own themed error block — Mermaid's built-in error SVG (fixed 2412×512 viewBox) does not fit slide bounds.
      // NOTE: do NOT set `layout` here. Mermaid 11.x recognizes only "dagre" (built-in) and "elk" (separate package). Any other value (e.g. "tidy-tree") makes Mermaid throw "Unknown layout algorithm" mid-render, which `suppressErrorRendering:true` then swallows silently — leaving certain diagram types (state, ER, class) with `data-processed=true` but no SVG. Omitting the option lets each diagram pick its native layout.
      htmlLabels: true,
      markdownAutoWrap: false, // Marp doesn't support line breaks in code fences, so disable Mermaid's auto-wrapping to avoid unexpected formatting changes.
      themeVariables: buildMermaidThemeVars(),
      quadrantChart: {
        titleFontSize: 24,
        pointTextPadding: 20,
        pointLabelFontSize: 14,
        pointRadius: 6,
        quadrantLabelFontSize: 18,
        yAxisLabelFontSize: 22,
        xAxisLabelFontSize: 22,
      },
      flowchart: {
        // Render flowcharts at intrinsic size, not stretched to container.
        // useMaxWidth:true scales the SVG's viewBox to fit 100% width, which
        // makes small-viewBox diagrams blow up and large ones shrink — giving
        // visually inconsistent sizing across the deck. false = intrinsic
        // pixel size; the slide-level h2 handles the title (SVG title is
        // suppressed by CSS in the slide context but retained for exports).
        useMaxWidth: false,
        htmlLabels: true,
        // Adds internal breathing room between node border and label.
        // (Only used by Mermaid's newer flowchart renderer, but harmless otherwise.)
        padding: 15,
        subGraphTitleMargin: {
          top: 10,
          bottom: 100,
        },
        // Reduce aggressive label wrapping in flowcharts.
        // Default is 200; larger values keep short phrases on one line.
        wrappingWidth: 480,
      },
    });
    globalScope.__llMermaidConfigured = true;
    return true;
  }

  let renderCounter = 0;
  // Caches already-rendered Mermaid SVGs by their exact source string so that
  // fences whose source did not change between re-renders skip mermaid.render()
  // entirely and inject the cached SVG instead. Key benefit: when Marp replaces
  // a <section> wholesale on every keystroke (producing new, unmarked <pre>
  // elements for all fences in the deck), only the fence whose source actually
  // changed calls mermaid.render(); all others get their SVG from this cache.
  //
  // Cache key is the raw source string (trimmed). No size bound is needed for a
  // single editor session; the number of distinct diagrams in a deck is small.
  //
  // Not used when mermaid.render() fails — errors are never cached so that a
  // fix to a broken diagram is retried on the next edit.
  //
  // Theme-change caveat: themeVariables are baked into the SVG at render time.
  // If the author switches themes without reloading the preview, stale SVGs from
  // the cache would show the old theme colours. This is acceptable because theme
  // switches require a manual preview reload in marp-vscode anyway.
  const mermaidSvgCache = new Map();

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
    transformVerdictGridBadges();
    transformObligationMatrixBadges();
    transformChecklistItemStates();
    transformSlotLabels();
    // Registry-managed DOM transforms — split-panels, roadmap, journey,
    // word-cloud, chart-family. All five layout-transform groups
    // dispatch from one registry call; the runtime is no longer the
    // canonical home for any of them.
    sharedTransformerRegistry.applyAllToDom(document);
    // state-chart is browser-measured: chart-family emits HTML nodes + an
    // empty SVG overlay above; this measures the laid-out nodes and draws
    // the edges/markers. Idempotent (re-runs on each transform pass).
    try { stateChartLayout.installStateChartLayout(document); } catch (_e) { /* no-op */ }
  }

  function initAndRun({ force = false } = {}) {
    runAllContentTransforms();
    const mermaid = globalScope.mermaid;
    // Guard against stub `window.mermaid` (e.g. bierner.markdown-mermaid in
    // VS Code's plain markdown preview, which exposes a render-blocks-only
    // shim without .initialize/.render). Without this check, scheduleRun
    // from the MutationObserver could re-enter ensureConfigured with the
    // stub and throw "mermaid.initialize is not a function".
    if (!mermaid || typeof mermaid.initialize !== "function" || typeof mermaid.render !== "function") {
      return false;
    }

    wrapFences();
    if (!ensureConfigured(mermaid, { force })) return false;

    // A pre is "pending" until mermaid.render() resolves into its sibling
    // target or we attach an error sibling. Re-running initAndRun is a no-op
    // for handled fences because we filter on data-mermaid-state.
    const FENCE_SELECTOR = [
      'pre[data-mermaid-state="pending"]',
      'marp-pre[data-mermaid-state="pending"]',
    ].join(",");
    for (const preEl of document.querySelectorAll(FENCE_SELECTOR)) {
      const codeEl = preEl.querySelector(":scope > code");
      const target = preEl.nextElementSibling?.classList.contains("mermaid")
        ? preEl.nextElementSibling
        : null;
      if (!codeEl || !target) continue;
      // Reorient a LR/RL flowchart to TB/BT on a portrait slide so it flows down
      // the tall frame — matches the emulator's PDF path (lib/integrations/mermaid/
      // reorient.js). The section's data-orientation is stamped by
      // patchSectionGeometry; absent (landscape) → source is unchanged.
      const orientation = codeEl.closest('section')?.getAttribute('data-orientation') || 'landscape';
      const source = reorientMermaidForPortrait((codeEl.textContent || "").trim(), orientation);

      // Cache hit: same source was rendered earlier this session — reuse the
      // SVG directly and skip mermaid.render() entirely. This is the common
      // case when Marp replaces sections wholesale on every keystroke: only
      // the fence whose source actually changed gets a fresh render call.
      const cachedSvg = mermaidSvgCache.get(source);
      if (cachedSvg) {
        target.innerHTML = cachedSvg;
        preEl.dataset.mermaidState = "rendered";
        continue;
      }

      // Mark in-flight so a re-entrant scheduleRun does not double-dispatch.
      preEl.dataset.mermaidState = "rendering";

      const id = `lattice-mermaid-${++renderCounter}`;
      Promise.resolve()
        .then(() => mermaid.render(id, source))
        .then((result) => {
          // Mermaid may resolve with `undefined` if it failed silently in
          // older versions. Treat absence-of-svg as an error.
          const svg = result?.svg;
          if (!svg) {
            attachError(preEl, target, new Error("Mermaid produced no SVG"));
            return;
          }
          mermaidSvgCache.set(source, svg);
          target.innerHTML = svg;
          if (result.bindFunctions) {
            try { result.bindFunctions(target); } catch (_e) { /* non-fatal */ }
          }
          preEl.dataset.mermaidState = "rendered";
        })
        .catch((err) => attachError(preEl, target, err));
    }
    return true;
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
    const SELECTOR = 'section.compare-prose, section.decision, section.split-panel, section.split-compare, section.statute-stack, section.regulatory-update, section.authority-chain, section.redline, section.timeline, section.list-criteria, section.actors, section.kpi, section.stats';
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
   * Mirror of the engine's `deckClassPropagate` plugin for the preview
   * path. Marpit's spec is "spot replaces global", so a slide with a
   * `_class:` directive drops the deck-wide `class:` value entirely. The
   * The engine's plugin overrides that at token-rewrite time on the owned
   * render paths, but a previewer that renders the HTML without running our
   * plugins keeps only per-slide classes — so the runtime re-applies it.
   *
   * The runtime can't read front matter from the rendered DOM (it is
   * stripped cleanly). Instead we fetch the source `.md` opportunistically
   * — works for published HTML decks where the source is co-located, and
   * gracefully no-ops for any context where fetch fails (notably VS Code's
   * `vscode-webview://` sandbox, which doesn't have access to workspace
   * files via fetch). For the VS Code preview case the recommended path is
   * the `theme: cuoio-dark` / `theme: indaco-dark` variant themes; this
   * mirror is a complementary path for users who want `class: dark` to
   * keep working in browser-based previews of exported HTML.
   */
  /**
   * Convenience `logo:` front-matter directive — runtime mirror.
   *
   * Same shape as `applyDeckClassFromFrontMatter` above: fetch the
   * source `.md`, parse front matter, inject `<img class="deck-logo">`
   * as the first child of each section selected by the `logo-on`
   * rule. Real DOM (not a `::before` pseudo) so the logo composes
   * with `::before`-based decorations like `mark-orbit`.
   *
   * Sibling implementations:
   *   - the engine's `applyDeckLogoToHtml` (marp-cli path)
   *   - lattice-emulator.js's HTML post-process (emulator path)
   * All three must produce identical DOM injection so the rendered
   * output is consistent across renderers.
   *
   * Same vscode-webview limitation as `applyDeckClassFromFrontMatter`
   * — fetch can't reach workspace files in that sandbox, so this
   * gracefully no-ops there. Works for published HTML decks served
   * from a web origin, where the source `.md` is co-located.
   */
  function applyDeckLogoFromFrontMatter() {
    if (typeof document === 'undefined' || typeof fetch === 'undefined') return;
    if (typeof window === 'undefined' || !window.location || !window.location.href) return;
    const url = window.location.href.replace(/[?#].*$/, '');
    const mdUrl = url.replace(/\.html?$/i, '.md');
    if (mdUrl === url) return;

    fetch(mdUrl)
      .then((r) => (r.ok ? r.text() : null))
      .then((src) => {
        if (!src) return;
        const fmMatch = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
        if (!fmMatch) return;
        const fm = fmMatch[1];
        const logoMatch = fm.match(/^\s*logo:\s*["']?(.*?)["']?\s*$/m);
        if (!logoMatch?.[1].trim()) return;
        const logo = logoMatch[1].trim();
        const styleMatch = fm.match(/^\s*logo-style:\s*["']?(.*?)["']?\s*$/m);
        const onMatch    = fm.match(/^\s*logo-on:\s*["']?(.*?)["']?\s*$/m);
        const brand = styleMatch && styleMatch[1].trim().toLowerCase() === 'brand';
        const onTitle = onMatch && onMatch[1].trim().toLowerCase() === 'title';
        // Optional placement/size — logo-x/logo-y (0–100, the logo CENTER as %) and
        // logo-scale (a multiplier). Only finite, clamped numbers are applied, so a
        // crafted value can't inject a style. Mirrors deckLogoStyle in plugins.js.
        const num = (re) => { const m = fm.match(re); if (!m) return null; const n = Number(m[1]); return Number.isFinite(n) ? n : null; };
        const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
        const logoX = num(/^\s*logo-x:\s*["']?(-?[\d.]+)["']?\s*$/m);
        const logoY = num(/^\s*logo-y:\s*["']?(-?[\d.]+)["']?\s*$/m);
        const logoScale = num(/^\s*logo-scale:\s*["']?(-?[\d.]+)["']?\s*$/m);
        const applyLogoPlacement = (img) => {
          if (logoScale != null) img.style.setProperty('--logo-scale', String(clamp(logoScale, 0.2, 3)));
          if (logoX != null && logoY != null) {
            img.style.setProperty('--logo-x', `${clamp(logoX, 0, 100)}%`);
            img.style.setProperty('--logo-y', `${clamp(logoY, 0, 100)}%`);
            img.style.setProperty('--logo-anchor-right', 'auto');
            img.style.setProperty('--logo-nudge', 'translate(-50%, -50%)');
          }
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
          if (onTitle && !isFirst && !isTitle) continue;
          // Skip if already injected (idempotent — runtime may re-fire).
          if (section.querySelector(':scope > img.deck-logo')) continue;
          const img = document.createElement('img');
          img.className = 'deck-logo' + (brand ? ' deck-logo-brand' : '');
          img.src = logo;
          img.alt = '';
          img.setAttribute('aria-hidden', 'true');
          applyLogoPlacement(img);
          section.insertBefore(img, section.firstChild);
        }
      })
      .catch(() => { /* fetch blocked / 404 / sandbox — no-op */ });
  }

  // meta Tile — fetch the source `.md`, read `meta:`, and fill the masthead
  // bays built by the registry's masthead-lift pass. The reader + DOM mutation
  // are the meta Tile kernel (lib/forms/tile/meta); only the fetch wrapper lives
  // here (it no-ops in the vscode webview sandbox — fetch blocked — like the
  // deck-logo path).
  function applyMastheadMetaFromFrontMatter() {
    if (typeof document === 'undefined' || typeof fetch === 'undefined') return;
    if (typeof window === 'undefined' || !window.location || !window.location.href) return;
    const url = window.location.href.replace(/[?#].*$/, '');
    const mdUrl = url.replace(/\.html?$/i, '.md');
    if (mdUrl === url) return;

    fetch(mdUrl)
      .then((r) => (r.ok ? r.text() : null))
      .then((src) => {
        if (!src) return;
        // The meta Tile kernel owns the `meta:` front-matter reader, so the HTML
        // path and this fetch-wrapper parse it ONE way.
        metaTile.applyToDom(document, metaTile.readFrontMatter(src) || '');
      })
      .catch(() => { /* fetch blocked / 404 / sandbox — no-op */ });
  }

  function applyDeckClassFromFrontMatter() {
    if (typeof document === 'undefined' || typeof fetch === 'undefined') return;
    if (typeof window === 'undefined' || !window.location || !window.location.href) return;
    // Derive the source `.md` URL from the current `.html` URL.
    const url = window.location.href.replace(/[?#].*$/, '');
    const mdUrl = url.replace(/\.html?$/i, '.md');
    if (mdUrl === url) return; // not an .html→.md mapping (e.g. webview://)

    fetch(mdUrl)
      .then((r) => (r.ok ? r.text() : null))
      .then((src) => {
        if (!src) return;
        const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
        if (!fm) return;
        const cm = fm[1].match(/^\s*class:\s*["']?(.*?)["']?\s*$/m);
        const classTokens = cm ? cm[1].trim().split(/\s+/).filter(Boolean) : [];
        // Custom `finish:` (backdrop) register → its class tokens, appended the
        // same way (none / atrium / …). See lib/core/resolve-finish.js.
        const fmFinish = fm[1].match(/^\s*finish:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
        const finishTokens = finishClasses(fmFinish ? fmFinish[1] : '').split(/\s+/).filter(Boolean);
        // Custom `mode:` (rendering mode) register → boardroom / sketch / sketch-clean.
        // See lib/core/resolve-mode.js. Composes with finish (both apply).
        const fmMode = fm[1].match(/^\s*mode:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
        const modeTokens = modeClasses(fmMode ? fmMode[1] : '').split(/\s+/).filter(Boolean);
        // The nested `backdrop:` map's class-based axes (clearance → `backdrop-clear`).
        // Inert without a finish (the mask lives on `section.finish.backdrop-clear`).
        const backdropTokens = backdropClasses(src);
        const deckTokens = [...classTokens, ...finishTokens, ...modeTokens, ...backdropTokens];
        if (!deckTokens.length) return;
        const modeSet = new Set(modeTokens);
        for (const section of document.querySelectorAll('section')) {
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
          for (const t of deckTokens) {
            if (slideHasOwnFinish && t.startsWith('finish-')) continue;
            if (slideHasOwnMode && modeSet.has(t)) continue;
            if (!cur.includes(t)) { cur.push(t); changed = true; }
          }
          if (changed) section.className = cur.join(' ');
        }
        // Deck-wide finishes just landed — wrap them (per-slide finishes were
        // already wrapped synchronously in bootstrap).
        injectBackdrops();
        // Stamp the deck-wide backdrop controls (slice 2: strength) onto every
        // wrapper — the DOM mirror of applyBackdropToHtml's inline style.
        const strength = backdropStrength(readFrontMatterBackdrop(src));
        if (strength != null) {
          for (const bd of document.querySelectorAll('section.finish > .backdrop')) {
            bd.style.setProperty('--backdrop-strength', String(strength));
          }
        }
      })
      .catch(() => { /* fetch blocked / 404 / sandbox — no-op */ });
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
    applyDeckClassFromFrontMatter();
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
    // Run all content transforms immediately so glossary, chart family, and
    // layout slides render without waiting for the Mermaid library to load.
    // tick() calls initAndRun() once Mermaid is ready, which re-runs them
    // (idempotent) alongside Mermaid fence rendering.
    runAllContentTransforms();
    // The progress + watermark Tiles dock AFTER the content transforms (which
    // include the registry's masthead-lift pass) so the `.cell-stage`/`.cell-footer`
    // cells exist first — the rail docks INTO the footer Cell beside the page
    // number (flex cell-tree §6), and is never swept into the stage. Both are
    // idempotent, so the initAndRun re-run after Mermaid loads is a safe no-op.
    progressTile.applyToDom(document);
    watermarkTile.applyToDom(document);
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
      new MutationObserver(scheduleRun).observe(document.body || document.documentElement, {
        subtree: true,
        childList: true,
      });
    }
    patchSectionGeometry();
    startOverflowWatcher();
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
    // data-orientation is now derived from the SAME family classifier as
    // data-family (lib/adaptive/families.js) — landscape→unstamped, square,
    // portrait (tall ∪ strip) — so the leaf (component @container) and the frame
    // (data-family slicing) can't disagree on the box. See M1.
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
    };
    for (const s of document.querySelectorAll('section')) patch(s);
    if (typeof MutationObserver !== 'undefined') {
      let raf = 0;
      const schedule = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          for (const s of document.querySelectorAll('section')) patch(s);
        });
      };
      new MutationObserver(schedule).observe(document.body, {
        subtree: true, childList: true, attributes: true,
      });
      if (typeof window !== 'undefined') window.addEventListener('resize', schedule);
    }
  }

  // ── Overflow watcher ─────────────────────────────────────────────────
  // Tags any <section> whose content exceeds the slide frame (any @size) with
  // class `overflow`, which lattice.css renders as a loud red inset ring.
  // Re-checks on resize and whenever DOM mutations land (Marp preview
  // re-renders on every keystroke).
  function startOverflowWatcher() {
    if (typeof document === "undefined") return;
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
    const check = () => {
      // Scope to Marp's real slide sections — `<section>` literals
      // inside code blocks parse as nested DOM and would pollute the count.
      for (const s of document.querySelectorAll('section[data-lattice-slide]')) {
        // Cell-aware: a bounded content cell (overflow:clip) CONTAINS its
        // overflow, so the section's own scrollHeight reports zero — probe the
        // clipping cells too, else the ring goes silent on an over-stuffed cell
        // (lib/core/overflow-probe.js; 2026-06-26-frames-as-flex-cell-trees.md).
        const { over } = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL);
        // Idempotent: only mutate the class when the state actually flips. The
        // observer below watches attributes:true, so an unconditional write
        // lets it react to its own class change and churn every frame. `.overflow`
        // (inset box-shadow) and the tab never shift layout, so a stable
        // measurement means a stable class and the loop settles.
        if (s.classList.contains('overflow') !== over) {
          s.classList.toggle('overflow', over);
          // Labelled tab (AA: name the condition in text, not colour alone).
          let tab = s.querySelector(':scope > .overflow-tab');
          if (over && !tab) {
            tab = document.createElement('div');
            tab.className = 'overflow-tab';
            tab.textContent = 'Overflows';
            s.appendChild(tab);
          } else if (!over && tab) {
            tab.remove();
          }
        }
      }
    };
    check();
    if (typeof MutationObserver !== "undefined") {
      let raf = 0;
      const schedule = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; check(); });
      };
      new MutationObserver(schedule).observe(document.body, {
        subtree: true, childList: true, characterData: true, attributes: true,
      });
      if (typeof window !== "undefined") window.addEventListener('resize', schedule);
    }
  }

  // ── function-plot inflater ────────────────────────────────────────────
  // The Marpit plugin (functionPlotFences) emits
  //   `<div class="functionplot" data-fp-config="…base64 JSON…"></div>`
  // The emulator path (lattice-emulator.js) injects function-plot.js + an
  // inline inflater into the print HTML. For the VS Code marp-vscode
  // preview, the runtime is what makes it animate: if `window.functionPlot`
  // has been loaded by the preview's script-injection settings, we inflate
  // the placeholder divs here. If not, the divs render as empty boxes —
  // the rest of the slide is unaffected.
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
    else apply(window.innerHeight > window.innerWidth);
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
