/* Lattice runtime — esbuild entry, bundled to dist/lattice-runtime.js
   (see tools/build-runtime.js). One of the three render paths.

   It began as the Mermaid bootstrap for Marp previews and grew into the browser half of every
   content transform. Mermaid's diagram pass is no longer here: it is the Mermaid plugin's own
   (lib/plugins/mermaid/mermaid.hydrate.js), which this file drives through the plugin registry
   (`PASSES`) without naming it — see "Plugin passes" below.
*/

/**
 * OUR OWN `<script>` ELEMENT, captured while it is still executing.
 *
 * `document.currentScript` is only non-null during the synchronous execution of the script
 * that set it, so this has to be read at module top level — by the time `bootstrap()` runs
 * it is null. It is the anchor for the ONE question a plugin pass's give-up asks synchronously
 * (Mermaid's, handed it as `ctx.ownScript`):
 * has a given `<script src>` already had its turn? A classic, parser-inserted script that
 * sits BEFORE this one in document order has, because the parser ran it to get here.
 *
 * Null when the runtime is inlined, evaluated, or loaded as a module (the `--fluid` viewer
 * inlines the bundle). That is not a problem — it simply turns the synchronous arm off and
 * leaves the deadline, which is the conservative answer.
 */
const OWN_SCRIPT = typeof document !== 'undefined' ? document.currentScript : null;

// Shared transformer registry — bundled by esbuild from lib/transformers/.
// Currently dispatches split-panels.applyToDom (all six layouts including
// split-panel + split-compare). Chart-family,
// roadmap, journey, word-cloud migrate into this registry in follow-up PRs.
const sharedTransformerRegistry = require('../../lib/transformers/registry');
// The prose-with-code mark (#2308) — the same kernel the markdown-it plugin calls.
const proseCode = require('../../lib/core/prose-code');
// DAGRE IS NOT IMPORTED HERE, and that absence is the point.
//
// The state-chart's browser pass reaches a layout engine only through
// `globalThis.__latticeDagre` — it is serialized through `.toString()`, so it
// carries no imports. This bundle used to install that global by requiring
// `../core/dagre-layout.js`, which esbuild inlined; because this bundle has no
// externals, that put the whole library on the EAGER path — 25.9 KiB gzipped
// (10.9% of lattice-runtime-min.js) fetched by every reader of every deck,
// including the ones with no state chart at all, for an engine that only earns
// its bytes on a machine that BRANCHES. None of the 9 drawn machines in the shipped
// galleries does.
//
// It is now `dist/lattice-dagre-min.js`, a sibling script the host emits BEFORE
// this bundle's tag when the document holds a state chart — the shape Mermaid
// and the KaTeX provider already use, and the one
// `2026-09-03-self-hosted-runtime-deps.md` names as the rule ("must never drift
// onto an eager path"). Classic scripts run in document order, so the global is
// there by the time the pass below reads it. Nothing is fetched from here.
const { installStateChartLayout } = require('../../lib/components/chart/state-chart/state-chart.layout');
// The flowchart's adapter, and Trama's layout kernel both graph charts lay out with (the
// graph-chart library, docs/src/lib/trama). Same delivery as the state chart above: dagre
// arrives as `globalThis.__latticeDagre`, from the sibling script, never from this bundle;
// without it a chart with no groups lays out on the reading-order grid (a branch drawn as
// a skip line), and a chart with groups or composite states keeps its harness tiles up.
const { installFlowchartLayout } = require('../../lib/components/chart/flowchart/flowchart.layout');
const { graphLayoutKernel } = require('@laticent/trama');

/**
 * Load dagre BESIDE THIS RUNTIME when a figure needs it and the host did not load it.
 *
 * A host gates the dagre `<script>` on what the document holds WHEN IT BUILDS THE FRAME
 * (single-slide-render.ts reads the sanitized HTML for `data-sc-model` /
 * `data-fc-model`). The Studio then PATCHES later edits into that same frame, so a deck
 * that gains its first flowchart by a paste never gets the engine: the flowchart stayed
 * as its measuring tiles until a reload rebuilt the frame (owner report on #2385). This
 * closes that the way the plugin host does for a plot's library: the sibling file, one filename
 * over from this script's own URL, fetched once, then every pass redraws; a load that
 * fails warns as a missing tag does. A runtime with no
 * `<script src>` (inlined) has no sibling to ask for and keeps the old behavior.
 */
let dagreLoad = ''; // '' | 'loading' | 'loaded' | 'failed'
function ensureDagre(onReady) {
  if (globalThis.__latticeDagre || globalThis.__latticeDagreNotNeeded || dagreLoad) return;
  // Mid-parse, a host's own dagre tag further down may not have run yet; the pass repeats.
  if (document.readyState === 'loading') return;
  try {
    if (!document.querySelector('.flowchart-figure[data-fc-model], .state-chart-figure[data-sc-model]')) return;
  } catch (_e) { return; }
  const src = OWN_SCRIPT?.src;
  if (!src) return;
  // Both names, the likelier first: `dist/` ships only `lattice-dagre-min.js`, and the docs
  // site stages that same file as `lattice-dagre.js` beside its `lattice-runtime.js`.
  const names = /-min\.js(\?|#|$)/.test(src) ? ['lattice-dagre-min.js', 'lattice-dagre.js'] : ['lattice-dagre.js', 'lattice-dagre-min.js'];
  let urls;
  try { urls = names.map((n) => new URL(n, src).href); } catch (_e) { return; }
  dagreLoad = 'loading';
  const attempt = (i) => {
    const tag = document.createElement('script');
    tag.src = urls[i];
    // A host that answers a missing file with its HTML fallback "loads" without the
    // engine, so a load that defines nothing falls through to the next name like an error.
    const next = () => {
      tag.remove();
      if (i + 1 < urls.length) attempt(i + 1);
      else { dagreLoad = 'failed'; warnMissingDagre(); }
    };
    tag.onload = () => {
      if (!globalThis.__latticeDagre) { next(); return; }
      dagreLoad = 'loaded';
      if (typeof onReady === 'function') { try { onReady(); } catch (_e) { /* the next pass redraws */ } }
    };
    tag.onerror = next;
    (document.head || document.documentElement).appendChild(tag);
  };
  attempt(0);
}

// A state chart whose engine did not arrive falls back to the READING-ORDER GRID —
// a different layout, not a blank diagram, so nothing on the page says it
// happened. That is the one real cost of splitting dagre out of this bundle, and
// it is the difference between a host that forgot the sibling tag and one that
// deliberately ships chains only. Say it once per document, on the console, and
// name the file: a consumer who copied `lattice-runtime-min.js` alone gets an
// answer instead of a mystery.
//
// Keyed on `[data-sc-model]`, which only the DEFAULT variant emits — the
// `inline` variant renders chips and is never drawn by the pass, so it is not a
// missing engine when dagre is absent.
let dagreWarned = false;
function warnMissingDagre() {
  if (dagreWarned || globalThis.__latticeDagre) return;
  // The CLI export sets this when it looked at the deck's own machines and found
  // none that branches, so the engine was withheld deliberately rather than
  // forgotten. Without it, every chain-only `--fluid` viewer we ship would warn its
  // recipient about a fallback that cannot happen to it.
  if (globalThis.__latticeDagreNotNeeded) return;
  try {
    // Every flowchart needs the engine; a state chart only when it branches.
    if (!document.querySelector('.state-chart-figure[data-sc-model], .flowchart-figure[data-fc-model]')) return;
    dagreWarned = true;
    console.warn(
      '[lattice] a state chart or flowchart is present but lattice-dagre-min.js did not load — a state chart '
      + 'or flowchart that branches will fall back to the reading-order grid, drawing each branch as a skip, and a '
      + 'chart with groups or composite states shows its shapes as tiles with no lines. Load it with a <script src> before '
      + 'lattice-runtime-min.js.');
  } catch (_e) { /* no document, or a host that blocks console — never fatal */ }
}
const { finishClasses, sectionIsFinish } = require('../../lib/core/resolve-finish');
const { resolveLogoRef } = require('../../lib/core/logo-builtins');
const { fromBase64 } = require('../../lib/core/base64-utf8');
const { installHydrateHost, releaseFigure } = require('../plugins/host-browser.mjs');
const { HYDRATORS } = require('../plugins/hydrate.generated.js');
// The plugins whose browser half is a document PASS this runtime drives (`render.exec.hydrate:
// "pass"` — Mermaid's diagram pass, lib/plugins/mermaid/mermaid.hydrate.js), from the registry, so
// this file names none of them; and each one's fence names and library, as plain data, for the
// plugin host below.
const { PASSES } = require('../plugins/passes.generated.js');
const { RUNTIME_DRAWN } = require('../plugins/drawn.generated.mjs');
const { markPluginsOff } = require('../plugins/mark-off.mjs');
const {
  overflowMarkerPolicy,
  sweepOverflowMarkers,
  legibilityTabText,
  legibilityTabHint,
} = require('./fluid-view-policy');
const {
  AUTHORING_DEFAULT_MARKER, EXPORT_DEFAULT_MARKER, resolveOverflowMarker,
} = require('../../lib/core/resolve-overflow-marker');
const { readExportSettings } = require('../../lib/core/export-settings');
const matrixGridCells = require('../../lib/core/matrix-grid-cells');
const tableRowLabel = require('../../lib/core/table-row-label.js');
const { slotLayoutSelector } = require('../../lib/core/slot-label-lift');
const glossarySlide = require('../../lib/core/glossary-slide');
const bgImage = require('../../lib/core/bg-image');
const { ROUGH_INK_STRUCTURES, pathsForPlan } = require('../../lib/core/rough-ink');
const { measureRoughInk, paintRoughInk, roughInkFingerprint } = require('../../lib/core/rough-ink-dom');
const { readFrontMatterBlock, readBakedFrontMatter } = require('../../lib/core/deck-front-matter');
const { deckLogoPlacement } = require('../../lib/integrations/markdown-it/plugins');
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
const { cornersClass, isCornersToken } = require('../../lib/core/resolve-corners');
const { fitClassFromFrontMatter, isGuardsToken, guardsEnabled } = require('../../lib/core/resolve-guards');
const { measureTrim, planTrim, applyTrim, clearTrim, verifyTrim, FIT_EPSILON: TRIM_FIT_EPSILON } = require('../../lib/core/guards-trim');
const { stateClassesFor } = require('../../lib/core/state-marks.js');
const { readLeadingMarker, leadingMarkerPrefix } = require('../../lib/core/leading-marker.js');
const {
  renderElement: inlineDirectiveElement,
  escapedText: inlineEscapedText,
  ESCAPED_ATTR: INLINE_ESCAPED_ATTR,
  OFF_ATTR: INLINE_OFF_ATTR,
} = require('../../lib/core/inline-code-directives.js');
const { isLiteralElement: isLiteralInlineCode, isOwnedElement: isOwnedInlineCode, inlineCodeClass } = require('../../lib/core/resolve-inline-code');
const { ruleClass, RULE_TOKENS } = require('../../lib/core/resolve-rule');
const { eyebrowClass, EYEBROW_TOKENS } = require('../../lib/core/resolve-eyebrow');
const { headlineClass, HEADLINE_TOKENS } = require('../../lib/core/resolve-headline');
const { liftClass } = require('../../lib/core/resolve-lift');
const { backdropClassesFromFrontMatter, isBackdropStrengthToken, isBackdropMaskToken } = require('../../lib/core/resolve-backdrop');
const { cardTagClassesFromFrontMatter, cardTagTokenAxis, slideCardTagAxes } = require('../../lib/core/resolve-card-tag');
// Every AXIS register — `spark:` and each one a plugin declares (`icon:`) — through one factory.
const { axisRegisterClassesFromFrontMatter, axisRegisterTokenAxis } = require('../../lib/core/axis-registers');
const { equalizeCardTags } = require('../../lib/core/card-tag-equalize');
const { venueClass, isVenueToken } = require('../../lib/core/resolve-venue');
const { chartFinishClass, isChartFinishToken } = require('../../lib/core/resolve-chart-finish');
const { cardsClass, CARDS_TOKENS, resolveCardsAlign } = require('../../lib/core/resolve-cards');

/**
 * CARD-ROW composition, runtime mirror of plugins.js's `stampCardsAlign`. The COMPONENT
 * declares it (manifest `cards`, baked into cards-catalog.generated.js) and the kernel
 * resolves it against whatever the author asked for; the answer is stamped as `data-cards`
 * and base.tokens.css turns it into `--cards-align`. Ungoverned components resolve to null
 * and are left alone.
 *
 * It writes BOTH attributes exactly as the exporter does, and deliberately does NOT inspect
 * the coda cell even though the browser could see it: resolving the arm here and riding it
 * along there would make the two paths disagree the moment a slide gained or lost a coda
 * after stamping. Byte-identical output on both paths IS the contract (#1), so the shape
 * test stays in CSS for both — `:has(> .cell-coda)` in base.tokens.css.
 */
function stampCardsAlign(section) {
  if (!section || typeof section.getAttribute !== 'function') return;
  const classes = (section.className || '').split(/\s+/).filter(Boolean);
  const family = section.getAttribute('data-family');
  const resolved = resolveCardsAlign({ classes, family });
  if (!resolved) {
    section.removeAttribute('data-cards');
    section.removeAttribute('data-cards-coda');
    return;
  }
  if (section.getAttribute('data-cards') !== resolved) section.setAttribute('data-cards', resolved);
  const withCoda = resolveCardsAlign({ classes, family, hasCoda: true });
  if (withCoda && withCoda !== resolved) {
    if (section.getAttribute('data-cards-coda') !== withCoda) section.setAttribute('data-cards-coda', withCoda);
  } else section.removeAttribute('data-cards-coda');
}
const { COLOR_MODE_TOKENS: COLOR_MODE_TOKEN_LIST, slidePinEvictsDeckToken } = require('../../lib/core/color-mode');
const { deckColorModeToken } = require('../../lib/core/resolve-color-mode');
const { deckClassTokensFromFrontMatter } = require('../../lib/core/deck-class-register');
const { withDefaultComponent } = require('../../lib/core/resolve-component');
const {
  CLIP_CELL_SELECTOR,
  IGNORED_CLIP_SELECTOR,
  IGNORED_BEARER_SELECTOR,
  probeSectionOverflow,
  probeContentClipped,
  probeFigureLegibility,
  FIGURE_TEXT_FLOOR_RATIO,
  FRAME_TOLERANCE,
} = require('../../lib/core/overflow-probe');
// WHEN the fit probes run and over WHICH slides — the scheduling policy that
// replaced `schedulePostMutation(check)`. Pure and DOM-free, so the decision is
// unit-testable without a browser; see lib/core/fit-sweep.js for why a
// generation counter and a viewport band beat a per-frame full-document scan.
const { planFitSweep, COMPLETE: COMPLETE_SWEEP } = require('../../lib/core/fit-sweep');
// The marker's chrome, emitted WITH the slide instead of created by this
// watcher. `berth()` is how the watcher reaches an element it no longer owns.
const fitBerth = require('../../lib/core/fit-berth');
const sectionIndex = require('../../lib/core/section-index');
// The three berths PLUS the capsule that holds two of them, attribute-qualified — the one
// subtree this runtime's own writes land in, and therefore the one the content observer
// must ignore. `RAIL_CLASS` is not in `BERTHS` (it is the container, not a register), so
// spreading `BERTHS` alone stopped naming the element that actually sits at section level
// once the clip and type-floor markers were railed together. Benign while every use here
// is a `closest()` from a write INSIDE a segment — but the docblock below claimed this was
// the same set `overflow-probe.js` excludes, and it was not.
const MARKER_CHROME_SELECTOR = [...fitBerth.BERTHS, fitBerth.RAIL_CLASS]
  .map((c) => `.${c}[${fitBerth.BERTH_ATTR}]`).join(', ');
const { settleFonts, settleLaidOutFonts } = require('../../lib/core/font-settle');
// A PREVIEW document (the docs builders stamp `data-lattice-preview`, deck-preview.js) waits for
// the faces its laid-out text uses and re-measures when a later one lands; everything else — an
// export, a static page — force-loads every declared face, as it always has (font-settle.js).
function isPreviewFonts() {
  try { return typeof document !== 'undefined' && !!document.documentElement && document.documentElement.hasAttribute('data-lattice-preview'); } catch (_e) { return false; }
}
function settleDocumentFonts(timeoutMs) {
  return isPreviewFonts() ? settleLaidOutFonts(document, document.fonts, timeoutMs) : settleFonts(document.fonts, timeoutMs);
}
/** In a preview, `fn` again whenever a face finishes loading after the settle — the face a
 *  slide mounted later brought with it. A no-op anywhere else. */
function onLateFonts(fn) {
  if (!isPreviewFonts()) return;
  try { document.fonts.addEventListener('loadingdone', () => { try { fn(); } catch (_e) { /* best-effort */ } }); } catch (_e) { /* no FontFaceSet events */ }
}
const { familyFor, orientationFor: deckOrientation } = require('../../lib/adaptive/families');
const { canvasWideFactor } = require('../../lib/engine/sizes');
// Self-contained Form Tiles (issue #356): each owns BOTH its adapters
// (HTML-string + DOM) in one kernel under lib/forms/tile/<id>. The runtime uses
// the DOM adapter (applyToDom). This replaced the old lib/runtime/form-dom.js
// mirror file, which is gone now that every Tile owns its own DOM injector.
const metaTile = require('../../lib/forms/tile/meta/meta.transform');
const progressTile = require('../../lib/forms/tile/progress/progress.transform');
const watermarkTile = require('../../lib/forms/tile/watermark/watermark.transform');
const paginationTile = require('../../lib/forms/tile/pagination/pagination.transform');
// Form is the DEFAULT composition model (design/forms.md; on by default since
// 2026-06-26). Marp runs none of the render-time form-toggle, so the runtime
// reproduces the default on the live DOM through this shared kernel — one source
// for the sovereign skip set across all render paths
// (HARD RULE #1). See lib/forms/form-default.js for the full rationale.
const { applyFormDefaultToDom } = require('../../lib/forms/form-default');
// Accessibility (CVD) categorical texture <defs> — the shared kernel both
// render paths are meant to call (HARD RULE #1); lattice-emulator.js already
// injects these into every export, but the runtime never did ("the runtime
// follows" in the module's own header comment was never actually done), so
// an a11y-* theme's chart/diagram fills referenced a nonexistent pattern id
// in live preview. See lib/core/accessibility-textures.js.
const {
  texturePatternDefs, texturePrefixesReferencedIn, TEXTURE_SENTINEL_PREFIX,
} = require('../../lib/core/accessibility-textures');

(() => {
  const globalScope = typeof window !== "undefined" ? window : globalThis;
  if (globalScope.__llLatticeRuntimeLoaded) return;
  globalScope.__llLatticeRuntimeLoaded = true;

  // Marp preview often re-renders slide DOM on edit without a full page reload.
  // A one-shot DOMContentLoaded init can miss newly inserted content, making a
  // drawn figure appear to "randomly" stop rendering. We keep a lightweight
  // observer that schedules the content pass (and every plugin pass) on change.

  // ── Plugin passes (`render.exec.hydrate: "pass"`, lib/plugins/<name>/<name>.hydrate.js) ──────
  //
  // A plugin whose browser half walks the whole document rather than one placeholder at a time —
  // Mermaid's: it groups every fence by the palette its slide resolves and renders each band on
  // one serial queue — ships that walk as a PASS, and this runtime drives it at three points:
  // `boot` (once, from bootstrap), `run` (every content pass, from initAndRun) and `onMutations`
  // (the observer's microtask, before the debounce). The plugin owns everything else: its
  // selectors, its library test, its render queue, its settle states on the host's markup.
  // Created lazily and once, with the runtime services a pass needs and nothing that names it.
  //
  // EACH PASS IS ON ITS OWN, so a second pass (phase F's charts) cannot disturb the first: a pass
  // runs only once it has BOOTED (bootstrap boots them in order, and a pass's boot wait calls the
  // content pass synchronously — without the gate, pass B would `run` before its own `boot`); its
  // `runAll` answers whether THAT pass walked, and only that pass is forced (one pass's library
  // still loading must not make another's boot wait spin, or force it); and a throw in one pass's
  // boot or mutation hook is caught there, so it cannot stop the runtime's own bootstrap or the
  // other passes (HARD RULE #25 inversion and red-team lenses).
  let drawPassList = null;
  function drawPasses() {
    if (!drawPassList) {
      drawPassList = PASSES.map((p) => {
        const entry = { name: p.name, booted: false, pass: null };
        entry.pass = p.createPass({
          name: p.name,
          fences: p.fences,
          win: globalScope,
          ownScript: OWN_SCRIPT,
          host: getPluginHost,
          schedule: () => scheduleRun(),
          runAll: (opts) => initAndRun(opts, entry),
        });
        return entry;
      });
    }
    return drawPassList;
  }
  function warnPass(entry, what, err) {
    if (typeof console !== 'undefined') console.warn(`[lattice-runtime] plugin pass "${entry.name}" failed in ${what}`, err);
  }

  // Trailing-edge debounce for Marp's re-render mutation bursts (typically
  // 5–10 mutations within ~30ms). 150ms coalesces them below the
  // perceptible-lag threshold. We don't section-scope: initAndRun filters on
  // data-lattice-settle="pending" so already-rendered diagrams are no-ops.
  const DEBOUNCE_MS = 150;
  // ONE DELAY, deliberately. A second, shorter delay for a diagram that had "just
  // appeared" used to live here. It was cut after the adversarial trio measured what it
  // actually bought and cost: 236ms -> 207ms navigating onto a cold diagram slide, with
  // the blank-frame count UNCHANGED at 10 — nothing a viewer can see — against an
  // un-coalesced render for every diagram slide reached from a non-diagram slide, because
  // the trigger was never gated on the swap kind. Clicking a rail faster than the debounce
  // therefore dispatched a render per slide touched, on a strictly serial queue, and the
  // one the author landed on queued BEHIND them. That is the same failure the first design
  // of this policy shipped (8 keystrokes, 8 renders, finishing later than a plain
  // debounce); a mechanism that reintroduces it through a second door for 29 imperceptible
  // milliseconds is not worth its own risk. Neither the delay nor its reset had a test.
  let scheduledRunHandle = null;
  // Listeners for "a mutation burst has settled and the content pass has run".
  //
  // The overflow sweep rides this rather than installing an observer of its own,
  // and which observer it rides is the whole point: THIS one watches `childList`
  // and `subtree` only (see the observer installed at the end of bootstrap),
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
  // A state chart the host has just written arrives UNDRAWN: its measuring column of
  // HTML boxes, with the SVG that replaces it still empty. Left to the debounced pass,
  // that column paints for at least a frame and then the drawn chart snaps over it —
  // the "delay, then snap" the Playground and Studio showed on every edit. Same fix
  // and same place as `replayCachedFences` above it: settle it in this microtask, so
  // the first frame the write produces is the drawn chart. The host writes finished
  // engine HTML (the section already carries its `--_sec-1cqi` stamp and its
  // composed stage), so the measurement here is the one the pass would make.
  // The cheap selector check keeps this off every burst without an undrawn chart.
  function drawFreshStateCharts() {
    try {
      // A figure with no box (a slide not laid out yet) cannot draw, and would keep
      // this check true on every burst — so only a figure that has a box counts.
      // And each figure gets ONE attempt here: one whose draw bails (a live reveal
      // tilt, a degenerate canvas) never gains `data-sc-drawn`, and without the mark
      // every later burst would redraw the whole deck in this microtask. The
      // debounced pass still owns every retry.
      const fresh = document.querySelectorAll('.state-chart-figure[data-sc-model]:not([data-sc-drawn])');
      let drawable = false;
      for (const f of fresh) {
        if (f.offsetWidth > 0 && !f.__scMicrotaskTried) { f.__scMicrotaskTried = true; drawable = true; }
      }
      if (drawable) installStateChartLayout(document, graphLayoutKernel, { onlyFresh: true });
    } catch (_e) { /* the debounced pass still draws it */ }
    // A flowchart arrives undrawn the same way; same microtask, same one attempt per figure.
    try {
      const freshFc = document.querySelectorAll('.flowchart-figure[data-fc-model]:not([data-fc-drawn])');
      let drawableFc = false;
      for (const f of freshFc) {
        if (f.offsetWidth > 0 && !f.__fcMicrotaskTried) { f.__fcMicrotaskTried = true; drawableFc = true; }
      }
      if (drawableFc) installFlowchartLayout(document, graphLayoutKernel, { onlyFresh: true });
    } catch (_e) { /* the debounced pass still draws it */ }
  }
  const burstIsMarkerChromeOnly = (records) => {
    for (const r of records) {
      const t = r.target;
      const el = t && (t.nodeType === 1 ? t : t.parentElement);
      if (!el || typeof el.closest !== 'function') return false;
      if (!el.closest(MARKER_CHROME_SELECTOR)) return false;
    }
    return true;
  };
  /**
   * Trailing-edge debounce for the content pass.
   *
   * Called once per mutation BURST (the observer callback receives the whole batch), not
   * once per record. Re-arming restarts the full delay, which is what coalescing MEANS: a
   * burst that keeps arriving keeps pushing the render out, so a run of keystrokes costs
   * one `mermaid.render` rather than one each on a strictly serial queue.
   */
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
  // Did `applyCachedDeckClass` change a section's class list since the last
  // transform pass STARTED? That is the precise question the re-run gate needs:
  // a transform that keys on a deck-wide token read a stale list, and only a
  // re-run can correct it. Set by `applyCachedDeckClass` on a real change and
  // cleared by `runAllContentTransforms` the moment it has applied the classes
  // for the pass it is about to run — so a stamp the pass ITSELF made (the baked
  // path, where the block primes synchronously) does not bill for a second pass,
  // while a stamp that lands after the pass (the fetch fallback) does. See the
  // gate at the `afterDeckFrontMatter` call site.
  let deckClassStampedSincePass = false;
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
  // stamped can read it without waiting on a promise. `form: off` was that
  // register and is retired (Form is not optional); `mode:` is the one left, read
  // this way at applyCachedDeckClass below. Stays null on the fetch path, where
  // nothing is knowable that early.
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
   * shape the shared readers that take a whole deck source expect
   * (`metaTile.readFrontMatter`), so they parse it exactly as they parse a real deck.
   */
  function latticeFrontMatterDoc(fm = bakedFrontMatter) {
    return fm ? `---\n${fm}\n---\n` : '';
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

  function exportSettingsOnce() {
    if (exportSettings === undefined) {
      exportSettings = typeof document !== 'undefined' ? readExportSettings(document) : null;
    }
    return exportSettings;
  }

  /**
   * An exported bundle's `pluginsOff` (lib/core/marp-bundle.js `withRuntimeScripts`): the plugins
   * the producer's admission left off for this deck. Marp rendered the page, so nothing carries the
   * engine's `data-lattice-off` marker; write it here, before any pass or transform, so a Mermaid
   * fence the deck did not load stays source and a chart the family did not draw stays a list.
   * Absent on every page but such a bundle, where this is one memoized read.
   */
  function markExportPluginsOff() {
    const off = exportSettingsOnce()?.pluginsOff;
    if (!Array.isArray(off) || !off.length || typeof document === 'undefined') return;
    markPluginsOff(document, off, { drawn: RUNTIME_DRAWN, owners: sharedTransformerRegistry.TRANSFORMERS });
  }

  function deckOverflowMarker(fallback) {
    exportSettingsOnce();
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
  // True only while the observer runs a host swap's same-task pass (see the observer in bootstrap):
  // that pass skips the whole-document chart redraw. A flag rather than a parameter, so the
  // signature stays the anchor test/integration/parity/runtime-mode-geometry.test.js finds.
  let swapMicrotaskPass = false;
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
    // pass. It no longer gates the Form stamp (Form is not optional, so there is
    // nothing to read before stamping); it still has to run here because it takes
    // the consumed block out of the document before anything copies or serializes
    // slide HTML, and because applyCachedDeckClass / applyDefaultComponent below
    // read it.
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
    // The classes for THIS pass are now on the sections, so any stamp recorded
    // above belongs to the pass about to run, not to a pass that already ran with
    // a stale list. Clearing here is what keeps the re-run gate free on the baked
    // path (where the block primes synchronously inside the call above) while
    // still firing on the fetch fallback (where the stamp lands after pass 1).
    deckClassStampedSincePass = false;
    if (deckFrontMatterSettled) applyDefaultComponent();
    applyFormDefaultToDom(document);
    transformVerdictGridBadges();
    transformObligationMatrixBadges();
    transformTableRowLabels();
    // matrix-grid's bracket-marker cells — the third member of the badge/state/
    // cell family, and the one that had no mirror until #1256, so its swatches
    // came out of a Marp render as literal `[x]` / `[-]` / `[ ]` text. Kernel:
    // lib/core/matrix-grid-cells.js (shared with the markdown-it plugin).
    matrixGridCells.applyToDom(document);
    // The glossary slide's list→table conversion + range pill. Engine-only until
    // #1256, so an exported deck's generated Glossary arrived as a bare bullet
    // list. Kernel: lib/core/glossary-slide.js (shared with the two plugins).
    glossarySlide.applyToDom(document);
    // NOT DEFERRED, and the measurement is why. This ran behind "has the deck's front
    // matter settled" for three commits, because the transform replaces a `<code>` with a
    // `<span>` and a later pass cannot put it back. Every path that actually carries a deck
    // today already has the answer here synchronously: the ENGINE reads the source, the
    // STUDIO renders through the engine first (so the pills are already right and this
    // mirror finds nothing to convert), and an EXPORT bakes its front matter into the
    // document (lib/core/marp-bundle.js:222). The only path that does not is an `.html`
    // served beside its `.md` whose export PREDATES the bake — the legacy fallback this
    // file's own `deckFrontMatterSource` docblock describes.
    //
    // Deferring for that one path cost every other path a full extra transform pass:
    // measured 1 pass -> 3 on a 40-slide deck with no register at all, 61-170ms -> 769-1078ms,
    // because pass 1 skipped, a latch forced pass 2, and pass 2's own mutation echoed back
    // through the observer as pass 3. It also needed a wall-clock deadline, which was a
    // guess that produced a wrong render at 3.2s, then at 10.2s after the guess was
    // enlarged. A legacy deck re-exports and bakes; that is the fix for it.
    transformInlinePills();
    // AFTER the pills, for the engine's reason: a span that became a pill is no longer code.
    transformProseCode();
    transformChecklistItemStates();
    transformSlotLabels();
    // Registry-managed DOM transforms — split-panels, roadmap, journey,
    // word-cloud, chart-family. All five layout-transform groups
    // dispatch from one registry call; the runtime is no longer the
    // canonical home for any of them.
    markExportPluginsOff();
    sharedTransformerRegistry.applyAllToDom(document);
    // RE-INJECT AFTER THE REGISTRY, not only before it. `injectBackdrops` also runs
    // at the top of this pass (inside applyCachedDeckClass), and that used to be the
    // only call — which was fine only while no registry transform replaced a
    // section's children. chart-family now can (it rebuilds a chart whose class list
    // changed, #1673), and `innerHTML = …` takes the `.backdrop` div with it, since
    // the wrapper is the section's FIRST CHILD rather than part of the transform's
    // own output. The section then painted with no finish backdrop until the
    // MutationObserver's 150ms debounce brought the next pass around — visible as a
    // finish popping in late on chart slides only.
    //
    // Idempotent (`:scope > .backdrop`), so the ordinary pass pays one guarded query
    // per finish section. Placed here rather than inside chart-family because the
    // hazard belongs to the ORDERING, not to charts: any future transform that
    // rebuilds a section's children would lose the backdrop the same way, and a
    // transformer has no business knowing what a finish is.
    injectBackdrops();
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
    // Same family, different SOURCE: the texture `<defs>` are keyed off the
    // document's CSS rather than the deck front matter (which is unreadable on a
    // `vscode-webview://` preview — no `.html`→`.md` URL to fetch). A live
    // `theme:` edit changes which pattern sets the page references, so the
    // injection has to be re-derived or the new theme's fills dangle. #1863.
    refreshA11yTextureDefs();
    // The deck-wide CLASS and the DEFAULT-component rule are the other two members of this
    // family, and they are applied at the TOP of this function instead of here — see the
    // comment there. They have to precede every class-keyed transform, not follow them.
    // The graph charts are browser-measured: chart-family emits each one's measuring
    // harness and an empty SVG above; these passes measure it, lay it out and paint.
    // Idempotent (re-runs on each transform pass).
    // NOT IN THE SWAP MICROTASK. Both installs redraw every chart in the document (100–175ms
    // on the 14-chart stress deck, engineering/decisions/2026-09-24-state-chart-fit-and-paint.md),
    // which is why the observer's `drawFreshStateCharts` draws only fresh figures, once. A host
    // swap's same-task pass (the observer, in bootstrap) leaves them to that and to the
    // debounced pass. Before this guard it added ~25ms per swap on the 116-slide gallery.
    if (!swapMicrotaskPass) {
      try { installStateChartLayout(document, graphLayoutKernel); } catch (_e) { /* the harness tiles stay up */ }
      try { installFlowchartLayout(document, graphLayoutKernel); } catch (_e) { /* the harness tiles stay up */ }
      // A figure that arrived by a patch into a frame built without the engine fetches it here
      // and redraws on arrival; warn only once that load has actually failed or cannot happen.
      ensureDagre(() => {
        try { installStateChartLayout(document, graphLayoutKernel); } catch (_e) { /* the harness tiles stay up */ }
        try { installFlowchartLayout(document, graphLayoutKernel); } catch (_e) { /* the harness tiles stay up */ }
      });
      if (dagreLoad !== 'loading' && document.readyState !== 'loading') warnMissingDagre();
    }
    // LAST, and that position is the requirement rather than a preference: the
    // marker berth has to be a DIRECT CHILD of the section, and the Form
    // composition above sweeps everything from the masthead band to the end of
    // the slide into `.cell-stage`. Berthing earlier would bury the marker inside
    // the very box it reports on. Mirrors the engine's own call site, which sits
    // after the same transforms for the same reason (lib/engine/index.js).
    // The page number as a REAL element on every paginated frame (#2206) — mirrors
    // the engine's call site, immediately before the berth and for the same reason:
    // the span has to be a DIRECT CHILD, and the Form sweep above moves everything
    // else into a cell. No-op where a footer Cell already holds one.
    paginationTile.applyToDom(document);
    fitBerth.applyToDom(document);
    // Section numbers for `divider numbered`. On the Marp path this is the ONLY
    // producer — there we ship a stylesheet and marp-core writes the HTML — and a
    // CSS counter cannot count across its per-slide containers (section-index.js).
    sectionIndex.applyToDom(document);
  }


  function initAndRun({ force = false } = {}, only = null) {
    runAllContentTransforms();
    // Then every BOOTED plugin pass. True when each one walked — or, when a pass's own boot wait
    // called (`only`), when THAT pass walked; false tells the wait to try again next frame (its
    // library or the theme has not landed yet). `force` reaches only the pass that asked for it.
    let walked = true;
    for (const entry of drawPasses()) {
      if (!entry.booted) continue;
      const ok = entry.pass.run({ force: only && entry !== only ? false : force });
      if ((!only || entry === only) && !ok) walked = false;
    }
    return walked;
  }


  /**
   * Universal state-token marker decoder — shared by transformVerdictGridBadges,
   * transformObligationMatrixBadges, and transformChecklistItemStates. The marker
   * grammar is lib/core/leading-marker.js (readLeadingMarker, leadingMarkerPrefix: the
   * Segno list-text grammar) and its meaning lib/core/state-marks.js (stateClassesFor),
   * the same kernels the engine imports, so the two paths cannot disagree about which
   * characters are markers or what each one means.
   */

  /**
   * A `<span class=…>label</span>` built with DOM APIs rather than an HTML string.
   *
   * WHY NOT `innerHTML`, and it is not style — it was a LIVE XSS (#1246, found by an
   * independent review of the census that had declared these two sites "ours"). Both callers
   * read their label out of `element.textContent`, which DECODES entities: markup that
   * `sanitizeSlideHtml` deliberately left inert as escaped text (`&lt;img src=x
   * onerror=…&gt;`) comes back as `<img src=x onerror=…>`, and assigning that to `innerHTML`
   * re-parses it as MARKUP in the live preview frame. Demonstrated end to end on the real
   * Playground: `top.__pwned = 1`, i.e. script in the origin HARD RULE #24 puts the visitor's
   * OpenRouter key in.
   *
   * The sanitizer is not at fault and cannot help here — this is a decode/re-parse round trip
   * ENTIRELY DOWNSTREAM of it, which is precisely the post-sanitize injection class #1246 is
   * about. `textContent` on the span closes it by construction: there is no parse step. It is
   * also more faithful, since the label was already flattened to text by the read.
   */
  function badgeSpan(className, label) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = label;
    return span;
  }

  /**
   * Transforms verdict-grid badge items in VS Code preview (no Marp plugin).
   * Finds state-marker prefixed li items inside section.verdict-grid (and
   * section.pricing, which shares the nested-card-with-badges shape — per-tier
   * feature rows), strips the prefix, and wraps the label in
   * <span class="badge {sem} {shape}">. Idempotent — skips li items that
   * already contain a .badge span.
   */


  function transformVerdictGridBadges() {
    if (typeof document === 'undefined') return;
    for (const section of document.querySelectorAll('section.verdict-grid, section.pricing')) {
      // BOTH list types, at BOTH levels. The engine's rule is list-kind-agnostic —
      // `plugins.js` counts `bullet_list_open` OR `ordered_list_open` and fires at
      // any depth >= 2 — while this side used to select `ul` only. So a numbered
      // card list, or a card whose criteria are numbered, badged on the engine and
      // printed raw `[x]` to the reader through the runtime: measured 2 badges
      // against 0 for each of `1. **Option one.**` with bullet criteria and
      // `- **Option one.**` with numbered ones. Same class as #1858 and invisible
      // for the same reason — no committed deck numbers a verdict-grid card.
      for (const outerLi of section.querySelectorAll(':scope > ul > li, :scope > ol > li')) {
        // EVERY nested item is a candidate; the MARKER decides, not the position.
        // This used to be `.slice(0, -1)` on the assumption that the last item is
        // always body prose. That assumption is the card CONVENTION, not the
        // card GRAMMAR, and the engine never shared it — `plugins.js`'s
        // `verdictGridBadges` tests each item against the same regex used below.
        // Where the convention holds the two agree, which is why every committed
        // deck rendered correctly and the divergence stayed invisible. Where an
        // author simply ends a card on a marker row, the engine badged it and the
        // runtime printed `[-] Criterion B` to the reader as literal markdown
        // (#1858) — measured 4 badges against 2, and 3 against 0 on a card with a
        // single marker and no prose line, where `slice(0, -1)` empties the list.
        // The non-marker prose line is already skipped by the `!m` guard below, so
        // dropping the slice costs nothing and removes the disagreement by
        // construction rather than by convention.
        // EVERY descendant item, not just the first nested level. The engine fires on
        // any inline token at `listDepth >= 2` with no upper bound, while this side
        // read one level: a criterion carrying its own sub-criteria badged the parent
        // and printed the child raw. For the depth-2-only shape every committed deck
        // uses, this selects the same set the old `innerUl.children` did.
        //
        // IT IS NOT THE ENGINE'S RULE, and the gap is narrower than it looks but real.
        // The engine counts `listDepth` over the whole slide token stream; this side
        // requires the OUTER list to be a direct child of the section, so a card list
        // inside a blockquote is depth >= 2 to the engine and invisible here (measured:
        // engine 2 badges, runtime 0). That divergence is PRE-EXISTING — the old code
        // has the same blind spot — and is not fixed here; it is written down so the
        // next reader does not take this walk for the engine's rule.
        for (const li of outerLi.querySelectorAll('li')) {
          if (li.querySelector('.badge')) continue; // already transformed
          // The item's OWN text, not `textContent`. The engine reads the `<li>`'s
          // inline token, which stops at a nested list; `textContent` swallows one,
          // so a criterion carrying a sub-list read as `[x] Crit A[-] Sub crit` and
          // either failed the anchored regex outright or captured the sub-item's
          // text into the badge label.
          //
          // NECESSARY, NOT SUFFICIENT. The engine joins per-INLINE-TOKEN content (one
          // token per block, a softbreak contributing nothing); this joins every
          // non-list child node's textContent, which keeps newlines and merges sibling
          // blocks. So a criterion carrying a SECOND PARAGRAPH, or a hard line break,
          // still reads differently and still fails the anchored regex here while the
          // engine badges it (both measured). PRE-EXISTING — the old code diverges
          // identically — and deliberately not fixed here; matching the engine on those
          // shapes means parsing blocks, not filtering nodes.
          const text = [...li.childNodes]
            .filter((n) => !(n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')))
            .map((n) => n.textContent || '')
            .join('')
            .trim();
          const m = readLeadingMarker(text);
          if (!m) continue;
          const { sem, shape } = stateClassesFor(m.marker);
          // KEEP any nested list. `replaceChildren(badge)` alone deletes it, which
          // silently drops every sub-criterion from the slide — and, because the walk
          // above is a static NodeList, would then go on to badge items already
          // detached from the document. The engine has no such problem: it rewrites the
          // inline token and never touches the list tokens after it. Badge first, then
          // the sublists, which is the order the engine emits.
          const sublists = [...li.childNodes].filter(
            (n) => n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL'),
          );
          li.replaceChildren(badgeSpan(`badge ${sem} ${shape}`, m.rest), ...sublists);
        }
      }
    }
  }

/**
 * DOM MIRROR of the `inlinePills` markdown-it plugin (HARD RULE #1) — same kernel,
 * `lib/core/inline-pills.js`, so a Marp render and an engine render agree.
 *
 * `<code>` ONLY, and only when its text still parses: the engine path has already
 * replaced qualifying tokens with the span, so on that path this finds nothing and
 * does nothing. It earns its keep on the Marp/export path, where the markdown never
 * went through our ruler and a `{LIVE}` would otherwise sit on the slide as literal
 * `<code>{LIVE}</code>`.
 *
 * THE ESCAPE IS HANDLED HERE, not inherited. An earlier version of this comment claimed
 * the double-backtick escape "survives here for free" — it did not: the DOM has no record
 * of the backtick run, so this mirror converted an escaped span on both paths. It is a
 * backslash now, resolved here and stamped with `data-lat-escaped` so neither a later pass
 * nor a document the engine already rendered can re-read the literal as a directive.
 */
function transformInlinePills() {
  for (const code of document.querySelectorAll('section code')) {
    if (code.closest('pre')) continue; // a fenced block is not inline code
    // `inline-code: literal` — the deck turned the grammar off. Gated on the CLASS, not on
    // front matter, because the class is the one signal present on all three render paths:
    // the engine stamps it from the register, and a raw-Marp deck can carry it through
    // marp-core's own `class:` directive, which is the surface no Lattice code can read
    // front matter on. See lib/core/resolve-inline-code.js.
    if (isLiteralInlineCode(code)) continue;
    if (code.hasAttribute(INLINE_ESCAPED_ATTR)) continue; // engine already resolved it, or we did
    if (code.hasAttribute(INLINE_OFF_ATTR)) continue; // its plugin is not loaded (spec/LPM.md § 3.2.1)
    const text = code.textContent || '';
    const unescaped = inlineEscapedText(text);
    if (unescaped !== null) {
      code.textContent = unescaped; // stays a <code>, backslash removed
      code.setAttribute(INLINE_ESCAPED_ATTR, ''); // and cannot be re-read as a directive
      continue;
    }
    // A list row on a slide whose component owns those spans (flowchart) is the component's
    // to read — the engine path skips the same spans (lib/core/resolve-inline-code.js). After
    // the escape, as there, so an escaped span is text everywhere.
    if (isOwnedInlineCode(code)) continue;
    const el = inlineDirectiveElement(document, text);
    if (el) code.replaceWith(el);
  }
}

/**
 * DOM MIRROR of the `proseCodeMark` markdown-it plugin (HARD RULE #1) — same kernel,
 * `lib/core/prose-code.js`. Marks a `<p>`/`<li>` that is prose with inline code in it, so the
 * `:has(> code:only-child)` eyebrow/subtitle rules stop matching an ordinary sentence (#2308).
 * On the engine path the attribute is already there and this finds nothing new; it earns its
 * keep on a Marp render, where our ruler never ran.
 */
function transformProseCode() {
  if (typeof document === 'undefined') return;
  proseCode.applyToDom(document);
}

  /**
   * Transforms state-marker table cells in VS Code preview (mirrors
   * the Marp plugin). Finds a state marker in <td> cells inside
   * section.obligation-matrix OR a slide carrying the universal `state-cells`
   * opt-in, strips the marker, and wraps any trailing
   * label in <span class="state {sem} {shape}">. CSS draws the universal
   * state token (colored disc + shape mask). Idempotent — skips cells
   * already containing a .state span.
   */
  function transformObligationMatrixBadges() {
    if (typeof document === 'undefined') return;
    // Both classes, mirroring the markdown-it decoder: the obligation-matrix
    // layout and the universal `state-cells` opt-in (HARD RULE #29).
    for (const section of document.querySelectorAll('section.obligation-matrix, section.state-cells')) {
      for (const td of section.querySelectorAll('td')) {
        if (td.querySelector('.state')) continue; // already transformed
        const text = td.textContent.trim();
        const m = readLeadingMarker(text);
        if (!m) continue;
        const { sem, shape } = stateClassesFor(m.marker);
        td.replaceChildren(badgeSpan(`state ${sem} ${shape}`, m.rest));
      }
    }
  }


  /**
   * Stamps `lat-row-label` on a table whose FIRST COLUMN holds row labels.
   *
   * The whole implementation is `lib/core/table-row-label.js`'s `applyToDom`,
   * moved there so it sits beside the decision it feeds and can be tested without
   * booting this file. It is still the DOM MIRROR of the markdown-it
   * `table_row_labels` plugin — the two read the same table out of different
   * representations and ask the same kernel, which is what keeps the paths from
   * disagreeing (HARD RULE #1). An engine caller over the assembled HTML was
   * written and reverted; a previous version of this comment said it had landed.
   *
   * The wrapper stays for the `typeof document` guard and the single call site
   * above. (Not, as this comment once claimed, because the fidelity ledger needs a
   * bare symbol here — `marp-fidelity.test.js` accepts the dotted
   * `kernel.applyToDom` form, and `matrixGridCells.applyToDom` already ships that
   * way.)
   */
  function transformTableRowLabels() {
    if (typeof document === 'undefined') return;
    tableRowLabel.applyToDom(document);
  }

  /**
   * Transforms checklist items in VS Code preview (mirrors the Marp plugin).
   * For each top-level <li> in section.checklist whose text starts with
   * a state marker, strips the marker and adds
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
        const m = leadingMarkerPrefix(firstText.nodeValue);
        if (!m) continue;
        const { sem, shape } = stateClassesFor(m.marker);
        firstText.nodeValue = firstText.nodeValue.slice(m.length);
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
      // Same resolution as the string path's `readDeckLogoFrontMatter`: a built-in
      // NAME becomes a data URI, so `logo: lattice` paints here too (HARD RULE #1 —
      // one kernel, three sibling injectors).
      const logo = resolveLogoRef(frontMatterValue(fm, 'logo'));
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
    // these lived in the img's own style no section rule and no sibling could read
    // them (#1404). The img still reads them by inheritance.
    //
    // The clamps and the both-axes rule come from `deckLogoPlacement` in plugins.js —
    // the SAME function the build path uses — rather than a hand-kept copy here. Two
    // copies agreeing by inspection is what HARD RULE #1 exists to prevent, and nothing
    // failed when one drifted (the docs asserted the invariant; no gate held it).
    const placement = deckLogoPlacement({ scale: cfg.logoScale, x: cfg.logoX, y: cfg.logoY });
    const applyLogoPlacement = (section) => {
      for (const [prop, value] of placement) section.style.setProperty(prop, value);
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
  /**
   * Derive the deck-wide class config from a front-matter body — the token
   * derivation, lifted OUT of the promise continuation it used to live inside so
   * both callers can share it: the async resolve below, and the SYNCHRONOUS prime
   * in applyCachedDeckClass (which the baked-export path needs before the first
   * transform pass). Pure: reads only `fm`, returns null when the deck names no
   * deck-wide register at all.
   */
  function deckClassConfigFrom(fm) {
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
      // Deck-wide CORNERS (`corners: rounded` → corners-rounded) — the slide's own corner.
      // `square`/unknown → no token, the pre-register baseline. See resolve-corners.js.
      const cornersName = frontMatterName(fm, 'corners') || '';
      const cornersTokens = cornersClass(cornersName) ? [cornersClass(cornersName)] : [];
      // Deck-wide FIT register (`fit: report|heal|trim`, old spelling `guards:`). `heal`/
      // unknown → no token, the pre-register baseline. Same entry point as plugins.js.
      const fitToken = fitClassFromFrontMatter(fm);
      const guardsTokens = fitToken ? [fitToken] : [];
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
      // Deck-wide VENUE (`venue: conference` → venue-conference): where the deck is seen,
      // which sets the font scale and the label lift. laptop/unknown → no token (the
      // designed size). A per-slide `venue-*` overrides it. See lib/core/resolve-venue.js.
      const venueName = frontMatterName(fm, 'venue') || '';
      const venueTokens = venueClass(venueName) ? [venueClass(venueName)] : [];
      // Deck-wide CHART FINISH (resolve-chart-finish.js) — mirrors plugins.js.
      const chartFinishName = frontMatterName(fm, 'chart-finish') || '';
      const chartFinishTokens = chartFinishClass(chartFinishName) ? [chartFinishClass(chartFinishName)] : [];
      // Deck-wide CARD-ROW alignment (resolve-cards.js) — mirrors plugins.js.
      const cardsName = frontMatterName(fm, 'cards') || '';
      const cardsTokens = cardsClass(cardsName) ? [cardsClass(cardsName)] : [];
      // Deck-wide INLINE-CODE register (resolve-inline-code.js) — mirrors plugins.js.
      // ABSENT UNTIL A CHECKER FOUND IT: the engine list gained this token and this one
      // did not, so on the path where the runtime is the ONLY implementation — an
      // `.html` served beside its `.md`, where `deckFrontMatterSource` fetches the deck —
      // `inline-code: literal` never became a class, `isLiteralElement` stayed false, and
      // the preview drew the pills the deck had turned off. The sibling `eyebrow: dot`
      // landed on both sides in the same measurement, which is what proved it was this
      // register and not the fetch. Nothing in the tree could see it: 8,235 unit tests,
      // lint and build:check were all green with the line missing.
      const inlineCodeName = frontMatterName(fm, 'inline-code') || '';
      const inlineCodeTokens = inlineCodeClass(inlineCodeName) ? [inlineCodeClass(inlineCodeName)] : [];
      // Deck-wide BACKDROP restraint (resolve-backdrop.js) — mirrors plugins.js.
      const backdropTokens = backdropClassesFromFrontMatter(fm);
      // Deck-wide CARD TAG style (resolve-card-tag.js) — mirrors plugins.js.
      const cardTagTokens = cardTagClassesFromFrontMatter(fm);
      // Deck-wide SPARK style (resolve-spark.js) — mirrors plugins.js.
      const sparkTokens = axisRegisterClassesFromFrontMatter(fm);
      const deckTokens = [...classTokens, ...colorModeTokens, ...finishTokens, ...modeTokens, ...claimTokens, ...stampTokens, ...toneStyleTokens, ...spectrumTokens, ...spectrumEdgeTokens, ...spectrumCardTokens, ...spectrumCardEdgeTokens, ...spectrumTrimTokens, ...cornersTokens, ...guardsTokens, ...ruleTokens, ...eyebrowTokens, ...inlineCodeTokens, ...headlineTokens, ...liftTokens, ...cardsTokens, ...backdropTokens, ...cardTagTokens, ...sparkTokens, ...venueTokens, ...chartFinishTokens];
      return deckTokens.length ? { deckTokens, modeTokens } : null;
  }

  function applyDeckClassFromFrontMatter() {
    if (typeof document === 'undefined') return;
    withDeckFrontMatter((fm) => {
      const cfg = deckClassConfigFrom(fm);
      if (!cfg) return;
      // Cached so applyCachedDeckClass can re-apply on every later
      // runAllContentTransforms pass without re-resolving the front matter.
      cachedDeckClassConfig = cfg;
      applyCachedDeckClass();
    });
  }

  // Re-applies the cached deck-wide class tokens — idempotent (only appends a
  // token a section doesn't already carry, same per-slide-override rules as
  // the fetch above), so safe to call on every transform pass. A no-op until
  // the fetch above has resolved at least once.
  function applyCachedDeckClass() {
    // PRIME SYNCHRONOUSLY FROM THE BAKED BLOCK. `applyDeckClassFromFrontMatter`
    // fills the cache inside a promise continuation, so on the FIRST transform pass
    // the cache is still empty and every class-keyed transform in that pass reads a
    // section without its deck-wide tokens. The bootstrap comment calls that out and
    // leans on a later re-run to converge the two render paths — but that re-run is
    // gated on `applyDefaultComponent()` reporting a change, so a deck whose every
    // slide names its own component never gets one, and chart-family's `chart-frame`
    // guard makes it a no-op for charts even when it fires.
    //
    // That went from latent to real when the gantt tick's LAYOUT MATH started keying
    // on the `sketch` token (#1663): a `mode: sketch` export built its axis with mono
    // advances and then painted it in the hand face — the CSS and the measurement
    // naming different faces, which is the exact desync that feature exists to
    // prevent. `mode:` is the surface that breaks, because Marp stamps a native
    // `class:` itself but has never heard of `mode:`.
    //
    // The baked block is in the DOM and `readBakedFrontMatter` is synchronous, so on
    // the export path there is nothing to wait for. Only the `.md` FETCH fallback
    // genuinely cannot
    // answer this early, and deferring first paint behind a network round trip is what
    // the bootstrap deliberately refuses to do.
    if (!cachedDeckClassConfig && bakedFrontMatter) {
      cachedDeckClassConfig = deckClassConfigFrom(bakedFrontMatter);
    }
    const cfg = cachedDeckClassConfig;
    if (!cfg || typeof document === 'undefined') return;
    const { deckTokens } = cfg;
    // The suppression set is the deck's mode tokens from EITHER spelling, read off
    // `deckTokens` because that list already unions them (and, in the runtime, is the only
    // one the cached config carries — deriving from `classTokens` there referenced a
    // variable from a different function and threw at bootstrap). `modeTokens`
    // holds what `mode:` stamped; a legacy deck-wide `class: sketch` puts the same token
    // in the deck's plain class list, and leaving it out meant a per-slide opt-out took the
    // slide out everywhere EXCEPT the CSS — the section kept `sketch`, so it still wore the
    // hand face while `resolveDiagramLook` / `resolveDiagramHandType` (which read the
    // slide's own tokens) said boardroom. `mode: sketch` evicted correctly and the legacy
    // spelling did not, which is how the asymmetry stayed invisible: nothing in the corpus
    // pairs a legacy `class:` deck with a per-slide mode opt-out. Surfaced by #1674's
    // export-vs-cascade font gate (test/integration/mermaid/diagram-font-parity.test.js).
    const modeSet = new Set(deckTokens.filter((t) => MODE_TOKENS.includes(t)));
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
      // A per-slide corners token (`corners-rounded`/`corners-square`) wins over the
      // deck-wide `corners:`. Mirrors lib/integrations/markdown-it/plugins.js.
      const slideHasOwnCorners = cur.some((c) => isCornersToken(c));
      // A per-slide guards token wins over the deck-wide `guards:`. Mirrors
      // lib/integrations/markdown-it/plugins.js.
      const slideHasOwnGuards = cur.some((c) => isGuardsToken(c));
      // A per-slide `rule-*` / `eyebrow-*` accent token wins over the deck-wide one.
      const slideHasOwnRule = cur.some((c) => RULE_TOKENS.includes(c));
      const slideHasOwnEyebrow = cur.some((c) => EYEBROW_TOKENS.includes(c));
      // A per-slide `head-*` alignment token wins over the deck-wide one.
      const slideHasOwnHeadline = cur.some((c) => HEADLINE_TOKENS.includes(c));
      // A per-slide lift choice (`lifted`/`flat`) wins over deck-wide `lift: on`.
      const slideHasOwnLift = cur.some((c) => c === 'lifted' || c === 'flat');
      // A per-slide backdrop token wins on ITS axis only. Mirrors plugins.js.
      const slideHasOwnBackdropStrength = cur.some(isBackdropStrengthToken);
      const slideHasOwnBackdropMask = cur.some(isBackdropMaskToken);
      // A per-slide card-tag word wins on ITS axis only. Mirrors plugins.js.
      // (`banner-tag` counts as the slide's own placement, so a deck placement cannot undo it.)
      const slideTagAxes = slideCardTagAxes(cur);
      // A per-slide spark (or plugin register, `icon-*`) word wins over the deck's on ITS axis only.
      const slideSparkAxes = new Set(cur.map(axisRegisterTokenAxis).filter(Boolean));
      // A per-slide venue wins over the deck-wide `venue:`.
      const slideHasOwnVenue = cur.some((c) => isVenueToken(c));
      // A per-slide chart finish (or `chart-finish-off`) wins. Mirrors plugins.js.
      const slideHasOwnChartFinish = cur.some((c) => isChartFinishToken(c));
      // A per-slide `cards-*` choice wins over deck-wide `cards:` — `cards-stretch`
      // is how one slide opts back out. Mirrors plugins.js.
      const slideHasOwnCards = cur.some((c) => CARDS_TOKENS.includes(c));
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
        if (slideHasOwnCorners && isCornersToken(t)) continue;
        if (slideHasOwnGuards && isGuardsToken(t)) continue;
        if (slideHasOwnRule && RULE_TOKENS.includes(t)) continue;
        if (slideHasOwnEyebrow && EYEBROW_TOKENS.includes(t)) continue;
        if (slideHasOwnHeadline && HEADLINE_TOKENS.includes(t)) continue;
        if (slideHasOwnLift && t === 'lifted') continue;
        if (slideHasOwnBackdropStrength && isBackdropStrengthToken(t)) continue;
        if (slideHasOwnBackdropMask && isBackdropMaskToken(t)) continue;
        if (cardTagTokenAxis(t) && slideTagAxes.has(cardTagTokenAxis(t))) continue;
        if (axisRegisterTokenAxis(t) && slideSparkAxes.has(axisRegisterTokenAxis(t))) continue;
        if (slideHasOwnVenue && isVenueToken(t)) continue;
        if (slideHasOwnChartFinish && isChartFinishToken(t)) continue;
        if (slideHasOwnCards && CARDS_TOKENS.includes(t)) continue;
        // `print` survives a slide's own scheme pin — see slidePinEvictsDeckToken.
        if (slideHasOwnColorMode && slidePinEvictsDeckToken(t)) continue;
        if (!cur.includes(t)) { cur.push(t); changed = true; }
      }
      if (changed) { section.className = cur.join(' '); deckClassStampedSincePass = true; }
      stampCardsAlign(section);
    }
    // Deck-wide finishes just landed — wrap them (per-slide finishes were
    // already wrapped synchronously in bootstrap). Backdrop restraint is BAKED into
    // the finish CSS (`--fin-backdrop-*`) now, so the wrapper needs no inline stamp.
    injectBackdrops();
  }

  // Inject the `.backdrop` wrapper as the first child of every finish section —
  // the DOM mirror of applyBackdropToHtml (lib/core/backdrop.js).
  // The finish compositor lives on this wrapper (base.finish.css) so strength +
  // the mask overlay address the whole finish as one layer. Idempotent (a
  // `:scope > .backdrop` guard) — safe to re-run after deck-wide classes land.
  // slice 1 of the backdrop-controls work.
  function injectBackdrops() {
    if (typeof document === 'undefined') return;
    for (const section of document.querySelectorAll('section')) {
      // Top-level only, as applyBackdropToHtml walks them: a finish is a slide's surface,
      // and a `<section>` an author nests inside a slide is not a slide.
      if (section.parentElement?.closest('section')) continue; // nested — not a slide
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

  // Inject the accessibility categorical texture pattern `<defs>` as a hidden
  // `<svg>` in `<body>` — the diagram/chart fills reference them by id
  // (`url(#latt-a11y-tex-N)`, themes/a11y-base/a11y-base.css). Mirrors
  // lattice-emulator.js's injection at the top of `<body>`, and calls the same
  // kernel to decide WHICH sets to emit (HARD RULE #1).
  //
  // This USED to be deck-independent static markup — every set, every page,
  // 28,490 B — and its comment said, correctly at the time, that it needed no
  // recurring re-fire. Selective emission (#1863) makes it deck-DEPENDENT, and
  // that changes both halves: it now has to read the document, and it has to
  // re-read it when a live edit swaps the theme. A deck edited from `indaco` to
  // `onyx` in a preview would otherwise keep the a11y-only `<defs>` it was born
  // with, and every onyx `--cat-N-texture` would dangle — an unresolvable
  // paint-server ref renders as SVG default BLACK.
  //
  // WHERE THE ANSWER COMES FROM: the `<style>` elements' own text, not CSSOM.
  // Every surface that reaches this code inlines its theme as a `<style>` (Marp
  // packs the themeSet, including the `@import 'lattice'` that carries
  // base.print-textures.css's `section.print` overrides). Reading `.textContent`
  // is cheaper than walking `document.styleSheets`, and it cannot throw the way
  // `cssRules` does on the one cross-origin sheet these surfaces can carry (the
  // KaTeX CDN link).
  //
  // WHEN WE CANNOT SEE ANY CSS we emit everything. Over-emitting is waste;
  // under-emitting is a black fill. The fallback is always "emit more".
  //
  // TWO ways we decide we cannot see the whole picture, and neither was reasoned
  // out — both came from driving the built bundle in a real Chromium:
  //
  //   (a) a `<link rel=stylesheet>` — its text is not in the DOM at all, and on a
  //       `file://` or cross-origin surface even CSSOM would refuse it.
  //   (b) the scan came back without the SENTINEL set. base.print-textures.css
  //       re-points all 12 print slots at `latt-a11y-tex-*` and ships inside the
  //       engine sheet, so ANY document carrying Lattice's CSS references it — on
  //       every theme. Not finding it does not mean "this deck needs no
  //       textures", it means we are not looking at the deck's real stylesheet.
  //       The first cut of this function read it the other way and emitted 0 of
  //       92 patterns on such a document.
  //
  // (b) reuses the scan we already ran rather than testing for the id a second
  // way: a hand-rolled sentinel regex here would be a second copy of the kernel's
  // matching rules, which is the drift HARD RULE #1 exists to stop.
  function referencedTextureSets() {
    if (document.querySelector('link[rel~="stylesheet"]')) return null;
    let css = '';
    for (const el of document.querySelectorAll('style')) css += el.textContent || '';
    // A deck may also carry inline SVG of its own with `fill="url(#latt-…)"`. An
    // attribute selector finds those directly; serializing the whole body to
    // search it would cost far more on a large deck.
    for (const el of document.querySelectorAll('[fill*="#latt-"],[stroke*="#latt-"],[style*="#latt-"]')) {
      css += `${el.getAttribute('fill') || ''}${el.getAttribute('stroke') || ''}${el.getAttribute('style') || ''}`;
    }
    const refs = texturePrefixesReferencedIn(css);
    return refs.indexOf(TEXTURE_SENTINEL_PREFIX) === -1 ? null : refs;
  }

  // Called from bootstrap AND from runAllContentTransforms() on every live edit.
  //
  // There is deliberately NO cheap change-detector in front of this. The first
  // version gated on a `<style>`-length signature and it was unsound three ways,
  // all of them found by an independent check rather than by testing: it could
  // not see a reference that arrived through slide MARKUP (a different input to
  // the same scan); the set prefixes are not length-distinct, so retargeting
  // `--cat-N-texture` from `latt-a11y-tex` to `latt-onyx-tex` — 13 characters
  // each — moved no signature at all; and an early return on an unchanged
  // signature never noticed that a live edit had destroyed the element outright.
  // Each one ends the same way: a `url(#…)` with no matching `<pattern>`, which
  // SVG paints BLACK.
  //
  // So the gate IS the answer. The scan is one pass over the document's CSS —
  // 1.2 ms against a 1.7 MB inlined engine sheet, under 1% of the 150 ms debounce
  // this pass already waits out — and comparing it to `data-latt-tex-sets` on the
  // standing element is one attribute read. A proxy that costs a black fill is
  // not worth the milliseconds it saves.
  function refreshA11yTextureDefs() {
    if (typeof document === 'undefined' || !document.body) return;
    const wanted = referencedTextureSets();
    const existing = document.querySelector('.latt-a11y-defs');
    // `null` means we could not read the CSS. Leave a standing injection alone —
    // it is at worst over-broad, which paints correctly.
    if (wanted === null && existing) return;
    const sets = wanted === null ? null : wanted.join(' ');
    if (existing && existing.getAttribute('data-latt-tex-sets') === sets) return;
    if (existing) existing.remove();
    document.body.insertAdjacentHTML(
      'afterbegin', texturePatternDefs(wanted === null ? undefined : wanted),
    );
  }

  function bootstrap() {
    // Diagnostic breadcrumb. Visible in the host's DevTools console.
    // In VS Code: "Developer: Open Webview Developer Tools" while the Marp
    // preview pane has focus. If you don't see this log at all, the script
    // tag never executed (CSP block, src 404, or HTML filter stripped it).
    if (typeof console !== 'undefined') {
      try {
        // Each pass's fields under its own name, nested under `passes`: merged flat, a second pass's
        // keys — or a pass named like a field below — would overwrite (plugin-system §11).
        console.log('[lattice-runtime] bootstrap', Object.assign({ passes: Object.fromEntries(drawPasses().map((e) => [e.name, e.pass.describe()])) }, {
          readyState: document.readyState,
          host: location?.href,
        }));
      } catch (_) { /* swallow */ }
    }
    // Mark the document so we can verify script execution from the inspector
    // (look for `<html data-lattice-runtime="loaded">`).
    if (document.documentElement) {
      document.documentElement.setAttribute('data-lattice-runtime', 'loaded');
    }

    // Before any pass boots and tags a fence (an exported bundle's admission, above).
    markExportPluginsOff();
    refreshA11yTextureDefs();
    applyDeckClassFromFrontMatter();
    // Sequenced, not merely written after: deck-class propagation is async, so a
    // bare call here would run BEFORE it and read a class list the deck-wide
    // registers had not yet contributed to (#1292).
    //
    // That deferral has a consequence worth stating, because it is the ONE place
    // this mirror is not a mirror: `runAllContentTransforms()` below is a plain
    // synchronous call, so the FIRST transform pass sees sections without
    // `content`, while the engine's plugin runs before every transform and they
    // always see it with. So the transforms re-run inside the same continuation,
    // and the two paths converge regardless of what a transform keys on
    // (HARD RULE #1).
    //
    // THE GATE IS TWO SIGNALS, and for a while it was only one. It used to read
    // `if (applyDefaultComponent()) …` — a change to the DEFAULT-COMPONENT stamp,
    // which is unrelated to whether the deck's own registers landed in time. A
    // deck whose every slide names its own component (`_class: gantt` on each)
    // makes that return false, so it never re-ran at all, and the convergence this
    // paragraph claims was simply false there (#1673). It is now gated on the
    // union: the default-component stamp, OR a deck-wide class landing after the
    // pass that should have seen it (`deckClassStampedSincePass`, cleared by
    // runAllContentTransforms once it has applied the classes for its own pass).
    //
    // STILL GATED, not unconditional: on the baked-export path the block primes
    // synchronously inside pass 1, so a deck pays exactly nothing — which is the
    // property the old gate was reaching for and the reason not to simply drop it.
    // Only the FETCH FALLBACK, where the answer genuinely cannot arrive before
    // first paint, buys another pass — measured at 2 for a plain deck and 3 for one
    // carrying a chart, the third being the chart rebuild's own mutation returning
    // through the observer below.
    //
    // And the initial pass below is NOT deferred to cover this, though that would
    // collapse the two into one — `deckFrontMatterSource()` falls back to a
    // `fetch` when the document carries no baked front-matter block, so deferring
    // first paint behind it would leave the preview blank for a network round
    // trip. Immediate paint, then correct. Setting the flag here (rather than
    // inside `deckFrontMatterSource`) keeps the "settled" signal on the same
    // continuation that already sequences the first stamp, so the re-stamp in
    // runAllContentTransforms can never start earlier than this did.
    afterDeckFrontMatter(() => {
      deckFrontMatterSettled = true;
      // BOTH calls, every time — `||` would short-circuit and skip the default
      // stamp whenever a deck class had landed.
      const stamped = applyDefaultComponent();
      if (stamped || deckClassStampedSincePass) runAllContentTransforms();
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
    // A plugin pass's boot wait calls initAndRun() once its library is ready, which
    // re-runs them (idempotent) alongside the pass.
    runAllContentTransforms();
    // Every plugin pass boots after the first content pass: it tags its figures at once (so their
    // source never shows while the library loads), asks the plugin host for that library, and
    // starts its own wait, which runs initAndRun once the library is real.
    for (const entry of drawPasses()) {
      entry.booted = true;
      try { entry.pass.boot(); } catch (err) { warnPass(entry, 'boot', err); }
    }
    // Re-run the content pass and every plugin pass when the slide DOM changes (e.g.
    // marp-vscode re-renders a slide on edit). scheduleRun() debounces the mutation burst and initAndRun()
    // is idempotent — already-rendered fences (data-lattice-settle) are skipped,
    // so this settles instead of looping on Mermaid's own SVG insertion. The
    // previous startObserver() call referenced a function dropped in the registry
    // migration (690835d), so this observer was silently lost.
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver((records) => {
        // The watcher's own berth fills are childList mutations too (see
        // burstIsMarkerChromeOnly). Dropping a burst that is ENTIRELY marker chrome
        // is what keeps this observer from scheduling the pass that fed it.
        if (burstIsMarkerChromeOnly(records)) return;
        // BEFORE the debounce, and in this microtask, so the first frame the host's
        // write produces carries a diagram rather than its source or an empty slot.
        // `replayCachedFences` hands back the SVG for a fence whose source did not
        // change; `adoptOutgoingDiagrams` then holds the OUTGOING diagram in the
        // fences it could not settle — the ones the author is actually editing.
        // Cache first, deliberately: it produces the right SVG for this source,
        // where adoption produces the previous one. Everything neither settles
        // stays pending for the debounced pass below.
        // A HOST SWAP GETS ITS LAYOUT IN THIS MICROTASK, not 150ms later. The host writes
        // engine HTML, and the content transforms (the Form stamp, masthead-lift's cells,
        // the image-text column, the cards wrappers) are what place its text. Left to the
        // debounce, the swap paints the raw slide for a frame or more and then the heading
        // jumps into its cell: measured in WebKit at iPhone size on the Studio preview, an
        // `image` slide's heading at x=102 width 563 on the first frame and x=205 width 294
        // ~110ms later, on every slide change. This pass skips the whole-document chart
        // redraw (`swapMicrotaskPass` in runAllContentTransforms; `drawFreshStateCharts` below draws
        // only fresh figures), Mermaid stays on the debounce, and the transforms are
        // idempotent, so the debounced pass re-running them is a no-op. Gated on the stamp so
        // the runtime's own writes, and hosts that do not stamp, keep the old schedule. Read
        // off the element `adoptOutgoingDiagrams` clears it from, and BEFORE it clears it.
        // Guarded: a harness that closes its window can still deliver one last burst, with no
        // document left to read.
        let hostSwap = false;
        try { hostSwap = !!document.querySelector('.lattice')?.hasAttribute('data-lattice-swap'); } catch (_e) { /* no document, no swap */ }
        for (const entry of drawPasses()) {
          if (!entry.booted) continue;
          try { entry.pass.onMutations(records); } catch (err) { warnPass(entry, 'onMutations', err); }
        }
        if (hostSwap) {
          swapMicrotaskPass = true;
          try { runAllContentTransforms(); } catch (_e) { /* the debounced pass still runs it */ }
          finally { swapMicrotaskPass = false; }
        }
        drawFreshStateCharts();
        scheduleRun();
      }).observe(document.body || document.documentElement, {
        subtree: true,
        childList: true,
      });
    }
    patchSectionGeometry();
    startCardTagEqualizer();
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
    startRoughInk();
  }

  // ── Rough ink — the sketch finish's drawn lines ────────────────────────
  // Measures every enrolled structure, generates rough.js paths, paints one
  // SVG overlay per slide. The same three calls the export path makes in
  // lattice-emulator.js, in the same order (HARD RULE #1) — the difference is
  // only that rough.js runs in-page here and in Node there.
  //
  // Runs LAST in bootstrap, after applyAllToDom and after the geometry stamp,
  // because it measures LAID-OUT boxes: a structure measured before
  // `--_sec-1cqi` is stamped is measured at the wrong type scale, and every
  // line lands where the box used to be.
  function startRoughInk() {
    if (typeof document === 'undefined') return;

    let last = null;
    const draw = () => {
      // The finish is checked on EVERY pass, not once at bootstrap. A live preview (the
      // Studio, the Playground) boots with no deck and swaps one in afterward, so a
      // bootstrap-only check found no `section.sketch`, installed nothing, and a sketch deck
      // typed into the Studio never got its ink — tables and sparks alike. A non-sketch deck
      // pays one querySelector per pass and paints nothing; a deck that STOPS being sketch
      // loses its overlays here rather than keeping the last render's lines.
      if (!document.querySelector('section.sketch')) {
        if (last !== null) { paintRoughInk([]); last = null; }
        return;
      }
      const plans = measureRoughInk(ROUGH_INK_STRUCTURES);
      // The loop guard. Painting mutates the DOM, the shared dispatcher is
      // driven by a MutationObserver, so an unconditional repaint spins a
      // permanent rAF loop — the same trap `patchSectionGeometry` documents
      // on its `--_sec-1cqi` write. Compare BEFORE painting, not after.
      const print = roughInkFingerprint(plans);
      if (print === last) return;
      last = print;

      const bySection = new Map();
      for (const plan of plans) {
        const paths = pathsForPlan(plan);
        if (!paths.length) continue;
        const prev = bySection.get(plan.sectionIndex);
        if (prev) prev.push(...paths);
        else bySection.set(plan.sectionIndex, paths.slice());
      }
      paintRoughInk([...bySection].map(([sectionIndex, paths]) => ({ sectionIndex, paths })));
    };

    try { draw(); } catch (_e) { /* ink is decorative — never block the preview */ }
    schedulePostMutation(() => {
      try { draw(); } catch (_e) { /* as above */ }
    });
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
    if (aspect > 1.05) return; // landscape — no scaling (a wider-than-16:9 canvas is handled by its design unit, patchSectionGeometry)
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
    // only centers the default flex-column layouts.
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
    // CARD-ROW composition, resolved from the component's manifest declaration. UNCONDITIONAL,
    // and both halves of that matter.
    //   · It cannot hang off the deck-token pass: `applyCachedDeckClass` returns early when a
    //     deck contributes no tokens of its own, which is the common case and exactly when the
    //     component's own declaration is the only thing to apply. That is the same early-return
    //     the exporter hit, fixed there with a dedicated ruler (plugins.js `cards_align_stamp`);
    //     the runtime kept the broken shape until a checker drove the export-to-Marp path.
    //   · It cannot hang off a family CHANGE either: at the wide family `data-family` is
    //     removed, so `before` and after are both null and a change-guard never fires — which
    //     left every wide section on a runtime-only surface (export-to-Marp, where Lattice's
    //     engine never runs) with no `data-cards` at all, `--cards-align` unset, and
    //     `align-content` computing `normal`. An explicit `_class: cards-spread` was ignored
    //     there too.
    // stampOrientation runs for every section at bootstrap and on every geometry pass, so
    // this is the one hook nothing can skip. It is idempotent — each write is read-guarded —
    // so re-running it costs nothing. See resolve-cards.js and the note's §11c.
    stampCardsAlign(s);
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
      // The DESIGN unit, not always the physical 1%: on a canvas wider than 16:9 it is the 1% of a
      // 16:9 canvas of the same height, the value orientationCss() in lib/engine/css.js emits, so the
      // live preview lays a phone-landscape deck out as the export does. 1 at 16:9 or narrower, and
      // 1 for a box that is not a registered wide canvas's shape (a section at its content's height).
      const wf = canvasWideFactor(w, s.offsetHeight || 0);
      const v = ((w * wf) / 100).toFixed(3) + 'px';
      // …and its gutter (half the extra width), which the slide's insets add; cleared otherwise.
      const gut = wf < 1 ? ((w * (1 - wf)) / 2).toFixed(1) + 'px' : '';
      if (s.style.getPropertyValue('--_wide-gutter') !== gut) {
        if (gut) s.style.setProperty('--_wide-gutter', gut);
        else s.style.removeProperty('--_wide-gutter');
      }
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

  // Every boxed card tag on a slide takes one size — the widest width, the tallest height
  // (lib/core/card-tag-equalize.js, the same kernel the export injects). On the shared
  // post-mutation dispatch, so a venue, register or content change re-measures; the kernel
  // writes only on a real change, so its own writes settle rather than loop. Fonts change a
  // label's width without any mutation, hence the settle hook.
  function startCardTagEqualizer() {
    if (typeof document === 'undefined') return;
    const run = () => { try { equalizeCardTags(document); } catch (_e) { /* best-effort */ } };
    run();
    schedulePostMutation(run);
    if (typeof document.fonts !== 'undefined') {
      try { settleDocumentFonts(2000).then(run, run); } catch (_e) { /* fonts API unusable */ }
      onLateFonts(run);
    }
  }

  // ── Fix-Me overlay (Case A — clip-cell overflow) ────────────────────────
  // Highlights the SPECIFIC bounded content cell (`.cell-stage` /
  // `.panel-right` / `.compare-right`) responsible for an overflowing slide —
  // or, when the cell holds a known repeated-item collection, drills down
  // further to the specific item within it. Unlike a grow-to-fit grid card —
  // which grows and pushes a NEIGHBOR past the frame, so pinpointing "the
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
  // genuine culprit from an innocently-stretched neighbor. What DOES
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
    // A clipped PANE's component is the pane's, not the host slide's: the host of a panes slide
    // carries no component class (lib/core/panes.js), so reading it tagged the whole pane stage
    // instead of the item that overflowed.
    const name = componentNameFor(cell.closest('lat-pane') || section, axisDomCatalog);
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
    // scrollHeight a few px past clientHeight even when content visually fits, so
    // the verdict is read against a noise budget rather than against zero. The
    // number, and the measured window it leaves silent, live with the constant —
    // this comment used to justify it with "the smallest real bug observed in the
    // gallery was a 211px overshoot", which a 335-deck sweep has since disproved
    // (lib/core/overflow-probe.js § FRAME_TOLERANCE).
    const TOL = FRAME_TOLERANCE;
    // Overflow is detected at the SLIDE level (content exceeds the slide
    // frame). Per-box "which cell" pinpointing was prototyped and dropped: in a
    // grow-to-fit grid (`1fr` = minmax(auto,1fr)) an oversized card doesn't clip
    // its own box — it grows and pushes its NEIGHBORS past the frame, so a
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
        // TRIM (`guards: strict`) runs BEFORE the probe, so every channel below
        // measures what the reader will actually see rather than the pre-trim
        // geometry. Clear first: a clamp computed for the PREVIOUS text is not a
        // measurement of the current one, and leaving it in place makes each pass
        // trim what the last pass already trimmed (lib/core/guards-trim.js).
        //
        // The trim STAMPS ITS OWN RECORD (`data-lattice-trim`) because the probe
        // below cannot see it: `probeContentClipped` reads Range client rects, a
        // clamp leaves its lines laid out, and anything removed from layout has no
        // rects at all. Inheriting the alarm was this feature's original design and
        // it was false — see the design note §3.
        if (guardsEnabled(s.className)) {
          clearTrim(s);
          // A per-SLIDE id namespace, matching the export. Synthetic ids only need to
          // be unique where they are resolved, and the Studio resolves them across a
          // whole deck's DOM. Derived from the slide's POSITION rather than a loop
          // counter: `check` is called with a subset on an incremental sweep, so a
          // counter would rename the same slide's blocks between passes and orphan
          // the `data-trim-prior` an earlier apply saved.
          const trimNs = 's' + (s.parentNode ? Array.prototype.indexOf.call(s.parentNode.children, s) : 0) + 'tb';
          const trimModel = measureTrim(s, CLIP_CELL_SELECTOR, TOL, trimNs);
          if (trimModel.boxes.length) {
            const plan = planTrim(trimModel);
            if (plan.actions.length) {
              applyTrim(s, plan);
              // VERIFY, then revert if the cut did not buy the fit — THROUGH THE KERNEL,
              // so this path and the export cannot answer differently. `planTrim`'s
              // fit-or-nothing guarantee holds over its MODEL, a prediction about the DOM
              // rather than a reading of it; trusting it shipped a slide that was trimmed
              // AND still overflowed, the exact outcome rule 5 exists to prevent.
              //
              // This used to run ONLY the per-box arm — no frame check, no whole-plan
              // revert — while the export ran both. Two independent reviews reproduced
              // the consequence on the same deck: the export said "TRIM REVERTED … they
              // clip unchanged" and the `--fluid` artifact built from this runtime shipped
              // the clamp anyway, on a slide still carrying the overflow ring. The kernel
              // was single-sourced and the POLICY was not, which is verbatim the HARD
              // RULE #1 failure the previous fix here was written to close — moved one
              // function along. `verifyTrim` is now the only place that policy exists.
              verifyTrim(s, plan, {
                clipSel: CLIP_CELL_SELECTOR,
                ignoreSel: IGNORED_CLIP_SELECTOR,
                ns: trimNs,
                eps: TRIM_FIT_EPSILON,
                tol: TOL,
                probe: probeSectionOverflow,
              });
            }
          }
        }
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
        // The labeled tab (AA: name the condition in text, not color alone)
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
        // reader cannot resize a figure, so an amber alarm reading "Text too small · 3pt"
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
        // The HINT rides in `title`, the same carrier `drawFitLabel` already uses for the
        // Fix-Me register's culprit hint — so the corner keeps ONE mechanism for "the
        // label had no room for this" rather than growing a second tab or a second line.
        // Guarded-write and cleared on the way out, because `sweepOverflowMarkers` only
        // reaches a berth when the level drops to `off`; a slide that simply stops being
        // illegible is cleared here or not at all, and a stale hint on a passing slide is
        // exactly the silent-wrong-state the berth model exists to prevent.
        if (legTab) {
          const legHint = under ? legibilityTabHint(leg) : '';
          if (legHint) {
            if (legTab.getAttribute('title') !== legHint) legTab.setAttribute('title', legHint);
          } else if (legTab.hasAttribute('title')) {
            legTab.removeAttribute('title');
          }
        }
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
        settleDocumentFonts(2000).then(
          () => { invalidate(); sweep(); armBackstop(); },
          () => { invalidate(); sweep(); armBackstop(); },
        );
        onLateFonts(() => { invalidate(); sweep(); });
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

  // ── Plugin figures (lib/plugins/, the browser half) ────────────────────
  // A plugin whose fence the engine renders as a placeholder (```functionplot today) is drawn
  // here, by the plugin host's browser half (lib/plugins/host-browser.mjs) running each plugin's
  // own `hydrate` (lib/plugins/<name>/<name>.hydrate.js) — the SAME functions the CLI export page
  // runs serialized, so the two surfaces can no longer drift (they had: only this copy used to
  // mark an error settled or release a missing library's config).
  //
  // NOT on any Marp surface: no Marp surface runs Lattice's markdown-it plugins, so the
  // placeholder is never created there and there is nothing to draw — measured on a real marp-cli
  // render of a `functionplot` fence (0 placeholders; the fence stays a code block), which is
  // what `lib/core/marp-fidelity.js` records and what the manifest's `render.surfaces.marp:
  // "source"` declares. Shipping function-plot.js in the Export-to-Marp bundle would fix nothing:
  // the test for whether a LIBRARY belongs in a hand-off artifact is whether the DOM node it needs
  // survives a PLAIN parse, and only Mermaid's does.
  //
  // THE LIBRARY LOADS ON DEMAND, BESIDE THIS RUNTIME, when the host did not load it. The CLI
  // export page injects it itself; the docs-site hosts (the Studio preview and its capture frame,
  // the Playground, the landing previews) load only this runtime, and
  // `docs/scripts/sync-playground-assets.mjs` stages each plugin's library (the version
  // package-lock.json locks) as a SIBLING of lattice-runtime.js, named by its file — so the URL is
  // this script's own, one filename over. A deck without a plot never fetches it. A runtime with no
  // `<script src>` (inlined, as `--fluid` does) has no sibling to ask for, so a missing library
  // settles `unavailable` and the author sees their config.
  //
  // THE SETTLE STATE is markup (`data-lattice-settle`, written `pending` by the engine), so the
  // Studio capture waits on it without a handle on this code (deck-export.js `waitForDiagrams`).
  //
  // A PLUGIN PASS RIDES THE SAME HOST as a runtime-drawn plugin (`runtimeDrawn` — Mermaid's): its
  // fences carry the host's markup, so `run` leaves them to the pass instead of releasing them as
  // an unknown plugin's, and its library loads through the host's one loader (`ensureLibrary`,
  // which the pass calls through `ctx.host()`), staged beside this runtime like a plot's.
  let pluginHost = null;
  function getPluginHost() {
    if (!pluginHost) {
      pluginHost = installHydrateHost(window, HYDRATORS, {
        fromBase64,
        releaseFigure,
        baseUrl: OWN_SCRIPT?.src || '',
        runtimeDrawn: Object.keys(RUNTIME_DRAWN).map((name) => ({ name, payload: RUNTIME_DRAWN[name].payload })),
      });
    }
    return pluginHost;
  }
  function hydratePluginFigures() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    getPluginHost().run();
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
      startCardTagEqualizer();
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
      // The sketch finish's drawn lines. Named here as well as in bootstrap()
      // because this branch deliberately runs ONLY what the fluid view needs —
      // and the fluid view needs this more than any other surface, not less: a
      // fluid slide reflows to portrait on a phone, so every box the ink was
      // measured against moves. The overlay is rebuilt from the shared
      // post-mutation dispatcher, which the resize listener already drives.
      // Without this line a fluid viewer would fall back to the tiled wave on
      // the one surface where geometry changes under the reader's hands.
      try { startRoughInk(); } catch (_e) { /* ink is decorative */ }
      return;
    }
    bootstrap(); hydratePluginFigures();
  }
  // Section numbers, stamped BEFORE the boot pass and again inside it.
  //
  // The number depends on nothing but document order and two class names, so it
  // does not need a single transform to have run — and running it early is what
  // makes it survive a consumer that captures the page sooner than our heavy pass
  // finishes. Measured: marp-cli's PDF conversion took its snapshot before the
  // transform-tail call landed, so the numeral was absent from the PDF while the
  // same deck's HTML output carried 01/02/03 correctly. The pass inside
  // `runAllContentTransforms` stays, because it is what renumbers after a
  // re-render (auto-split, a preview edit) — this one is for the first paint.
  try { sectionIndex.applyToDom(document); } catch (_e) { /* numbering is not worth a boot failure */ }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try { sectionIndex.applyToDom(document); } catch (_e) { /* as above */ }
      boot();
    }, { once: true });
  } else {
    boot();
  }
  // Re-inflate as the preview re-renders slides on edit.
  if (typeof MutationObserver !== 'undefined') {
    let raf = 0;
    new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; hydratePluginFigures(); });
    }).observe(document.body || document.documentElement, { subtree: true, childList: true });
  }
})();
