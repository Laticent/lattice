/**
 * lib/plugins/mermaid/mermaid.hydrate.js — Mermaid's BROWSER half: the diagram pass every browser
 * surface draws through (the Studio preview and its capture frame, the Playground, the landing
 * previews, `--fluid`, a Marp preview that loads the runtime).
 *
 * A PASS, NOT A PER-PLACEHOLDER HYDRATE (`render.exec.hydrate: "pass"`,
 * engineering/decisions/2026-09-27-plugin-system.md §4.7). function-plot's `hydrate(el, ctx)` draws
 * one placeholder on its own; Mermaid cannot, because `mermaid.initialize` is GLOBAL and
 * `mermaid.render` takes no config — so per-slide palettes need every fence grouped by the palette
 * its slide resolves, and each band rendered on ONE serial queue (`renderDiagrams`, the kernel the
 * CLI's bake shares under HARD RULE #1). So this module exports `createPass(ctx)`, and the runtime
 * (lib/runtime/index.js) drives what it returns at three points, finding it through the registry
 * (lib/plugins/passes.generated.js), never by name:
 *
 *   boot()               once, from the runtime's bootstrap: tag every fence, ask the plugin host
 *                        for the library, and start the wait that gives up on it
 *   run({ force })       every content pass (the runtime's `initAndRun`): render what is pending;
 *                        false asks the boot wait to try again next frame
 *   onMutations(records) the observer's microtask, before its debounce: settle what the cache
 *                        already holds and keep the outgoing ink on screen (no render here)
 *   describe()           the fields the runtime's bootstrap breadcrumb logs
 *
 * The runtime hands it services and nothing that names Mermaid:
 *
 *   ctx.name, ctx.fences  the plugin's name and fence names (its manifest, through the registry)
 *   ctx.win               the window
 *   ctx.ownScript         the runtime's own <script> element, or null (see the fast give-up arm)
 *   ctx.host()            the plugin host (lib/plugins/host-browser.mjs): `ensureLibrary` loads
 *                         the manifest's payload beside the runtime
 *   ctx.schedule()        the runtime's debounced content pass
 *   ctx.runAll({ force }) the runtime's content pass, now — which calls `run` back
 *
 * NOT SERIALIZED, so it may require: the CLI export page carries no runtime and draws Mermaid with
 * the plugin's `bake` (mermaid.bake.js) instead, and the resolver requires one for a pass. In-tree
 * only — the zip channel refuses every script (§4.10).
 *
 * THE FIGURE GEOMETRY (§11): the host's markup (`data-lattice-hydrate`, `data-lattice-settle`) sits
 * on the fence's SOURCE `<pre>`, and the drawing goes in a sibling this pass owns (`.mermaid`), so a
 * capture reads every surface's figures one way.
 *
 * Moved here, unchanged in behavior, from lib/runtime/index.js. Several gates lift blocks of this
 * file by their banners and run them (diagram-queue, diagram-adoption, mermaid-per-slide-band,
 * diagram-theme-parity, init-config-parity, mermaid-give-up, mermaid-pane-orientation) — keep the
 * banners where they are.
 */

// THE diagram render kernel: it walks the deck, resolves each slide's palette from
// the shared 166-entry map, and calls this path back (#1332 step 4, HARD RULE #1).
// This path supplies a token reader, a scope key, and a renderer — no policy.
const { renderDiagrams } = require('../../core/render-diagrams');
// Which palette tokens are NOT colors, so the color-resolving `read()` must not touch
// them — see the `readToken` port below. Derived from MERMAID_VAR_MAP's own flags.
const { textValueTokens } = require('../../core/mermaid-theme-map');
const TEXT_VALUE_TOKENS = textValueTokens();
// The per-slide cascade-context key + the SVG cache key derived from it (#1332
// step 3). Pure and DOM-shape-agnostic, so what the grouping keys on is testable
// as behavior; see lib/core/diagram-scope.js for why it is a class signature and
// deliberately NOT a resolved band.
const { diagramScopeKey, diagramCacheKey, groupDiagramsBySlide } = require('../../core/diagram-scope');
// The look question (lib/core/diagram-look.js). Resolved HERE from the live
// section — the same port the band uses: the deck's `mode: sketch` is already
// propagated onto every section's class list, and the texture channel is a custom
// property that slide's cascade resolves. So the preview reads the DOM where the
// PDF path reads front matter, and both reach the same answer.
const { resolveDiagramLook } = require('../../core/diagram-look');
// THE shared non-palette Mermaid config — the config half of the port (#1347). This
// path builds its `mermaid.initialize` argument from it and adds only what is
// enumerated in DIVERGENT_CONFIG; before that, eight keys diverged with no gate.
const { engineInitConfig } = require('../../integrations/mermaid/init-directive');
const { reorientMermaidForPortrait } = require('../../integrations/mermaid/reorient');
// Tags a drawn diagram's parts with the chart motion roles, so `motion:` animates it like a chart.
const { tagMermaidMotion } = require('../../integrations/mermaid/motion-roles');

/**
 * Mermaid's pass over one document. See the header for what the runtime calls and supplies.
 * @param {{ name: string, fences: ReadonlyArray<string>, win: Window, ownScript: HTMLScriptElement | null,
 *           host: () => { ensureLibrary: Function }, schedule: () => void,
 *           runAll: (opts?: { force?: boolean }) => boolean }} ctx
 */
function createPass(ctx) {
  const globalScope = ctx.win;
  const OWN_SCRIPT = ctx.ownScript;
  const getPluginHost = ctx.host;
  const scheduleRun = ctx.schedule;
  // The runtime's whole content pass, which runs this pass's `run` in turn — what the library's
  // load and the boot wait call when they want a diagram drawn NOW rather than on the debounce.
  const initAndRun = ctx.runAll;
  const MERMAID_PLUGIN = ctx.name;
  const MERMAID_FENCES = ctx.fences;
  // A fence's <code>, at ANY state: `[class*=]` so the defanged `language-<fence>-source` still counts.
  const MERMAID_CODE = MERMAID_FENCES.map((f) => `code[class*="language-${f}"]`).join(', ');
  // Is this global the real Mermaid (see the note at `isRealMermaid` in `boot`)?
  const isRealMermaidLibrary = (m) => !!m && typeof m.initialize === 'function' && typeof m.render === 'function';

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

    // Color resolver. CSS custom properties returned via getPropertyValue come back
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
      // `raw` for a NON-COLOR token, `read` for everything else. `read` is the color
      // resolver (it probes `color: var(--token)` so `light-dark(...)` comes back flat);
      // handed a font stack that assignment is invalid and the probe returns its
      // INHERITED COLOR instead — measured, `rgb(31, 74, 110)` where the stack was
      // expected. Mermaid then had a color as its font family. It hid almost completely,
      // because `mermaid.css` sets `font-family` on most label elements regardless; the
      // gantt axis ticks were the one text it does not cover, and they rendered in
      // generic sans-serif on a hand-drawn slide.
      //
      // The set comes from the MAP's own `text` flags, so a second non-color token needs
      // no edit here.
      readToken: (sectionEl, name) => {
        const reader = sectionReaderFor(sectionEl);
        return TEXT_VALUE_TOKENS.has(name) ? reader.raw(name) : reader.read(name);
      },
      // NO `finishTheme` PORT (#1674). This is where the one sanctioned divergence
      // used to live: the export baked a monospace stack because mermaid's
      // `sanitizeDirective` allow-list has no hyphen, so `system-ui`/`sans-serif` was
      // blanked the moment it rode in a `%%{init}%%` directive — and a blank font makes
      // mermaid MEASURE labels in one font while the page RENDERS them in another,
      // clipping them mid-word. This path escaped it only because
      // `mermaid.initialize`'s `sanitize` is permissive.
      //
      // The export renders in an engine-owned page now and calls `initialize` too, so
      // it reads the same `--font-body` this path does, straight out of
      // `MERMAID_VAR_MAP`. The port is GONE rather than left empty: an empty override
      // hook is an invitation, and the parity gate now asserts the two paths' palettes
      // are equal with no exception set at all.
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

  function wrapFences() {
    // Mark each ```mermaid fence's <pre> with `data-lattice-settle="pending"`
    // and insert a sibling <div class="mermaid"> as the SVG render target.
    // We do NOT wrap the <pre> in any container — Marp's `<pre is="marp-pre">`
    // is a direct flex child of `<section>` and participates in Marp's
    // auto-scaling (`data-auto-scaling`); wrapping it broke that relationship.
    //
    // The <pre> is purely a conduit for mermaid.render() to read source from.
    // CSS hides it as soon as `data-lattice-settle` is set (any value), so it
    // is never shown to the author. Visibility transitions are:
    //   pending/hydrating → nothing visible (host is loading the diagram)
    //   rendered          → sibling .mermaid (the SVG) visible
    //   error             → sibling .mermaid-error (themed error block) visible
    //
    // The .mermaid-error sibling is created lazily by attachError() on
    // failure; we don't pre-create it here.
    // ONE derivation of "what is a fence", shared with the adoption walk
    // (FENCE_CODE_SELECTOR). This used to spell out four arms, two of which — the exact
    // `code.language-mermaid` pair — are strict subsets of the `[class*=]` pair beside
    // them and matched nothing extra.
    for (const codeEl of document.querySelectorAll(FENCE_CODE_SELECTOR)) {
      const preEl = codeEl.parentElement;
      if (!preEl) continue;
      // Already marked — skip.
      if (preEl.dataset.latticeSettle) continue;

      // Defang the language class so other extensions that target
      // `code.language-mermaid` (notably bierner.markdown-mermaid in the
      // plain VS Code markdown preview) stop trying to render the same
      // fence with their own bundled mermaid build. We keep the original
      // text in `data-original-class` for diagnostics; nothing else reads it.
      // We retain "language-mermaid-source" so syntax highlighting from
      // the engine (which scoped on `language-mermaid` at build time)
      // is untouched in exports — exports never run this runtime.
      for (const fence of MERMAID_FENCES) {
        if (!codeEl.classList.contains(`language-${fence}`)) continue;
        codeEl.dataset.originalClass = codeEl.className;
        codeEl.classList.remove(`language-${fence}`);
        codeEl.classList.add(`language-${fence}-source`);
      }

      // Check whether a previous render-cycle's sibling survived. Marp's
      // VS Code preview re-renders the <section> on every content change,
      // which produces a fresh <pre> (no data-lattice-settle) but leaves the
      // adjacent `.mermaid` div untouched. Without this reuse path, every
      // re-render would prepend a new EMPTY sibling, orphaning the SVG-bearing
      // one further down — making the diagram visually disappear after the
      // first successful render.
      let target = preEl.nextElementSibling;
      if (target?.classList.contains("mermaid")) {
        // THE HOST'S FIGURE MARKER, on a survivor too (one a pre-marker runtime drew): every
        // consumer outside the plugin finds the drawn figure by it, never by `.mermaid`.
        target.setAttribute("data-lattice-figure", MERMAID_PLUGIN);
        // Existing sibling. If it already holds an SVG, the diagram survived
        // intact — flag the pre as rendered and we're done.
        if (target.querySelector("svg")) {
          preEl.dataset.latticeHydrate = MERMAID_PLUGIN;
          preEl.dataset.latticeSettle = "rendered";
          continue;
        }
        // Empty leftover sibling — reuse as the target for this cycle.
      } else {
        target = document.createElement("div");
        target.className = "mermaid";
        // The host's figure marker (plugin-system phase D): what an export, a capture or a
        // layout selects to find a drawn figure, so none of them names this plugin's classes.
        target.setAttribute("data-lattice-figure", MERMAID_PLUGIN);
        target.setAttribute("aria-hidden", "true");
        preEl.insertAdjacentElement("afterend", target);
      }
      // The plugin host's markup (lib/plugins/host-browser.mjs): the plugin's name, and the ONE
      // settle state every capture waits on (`PENDING_FIGURES`) — so the Studio export's wait and
      // the host read this fence exactly as they read a plot, with no Mermaid selector of their own.
      preEl.dataset.latticeHydrate = MERMAID_PLUGIN;
      preEl.dataset.latticeSettle = "pending";
    }
  }

  // A ```mermaid fence's <code>, at ANY state. `[class*=]` rather than the exact class
  // because `wrapFences` defangs `language-mermaid` to `language-mermaid-source` the
  // first time it sees a fence, and both the adoption walk and the untagged probe below
  // have to keep recognizing one afterwards.
  const FENCE_CODE_SELECTOR = `:is(pre, marp-pre) > :is(${MERMAID_CODE})`;
  // A fence the runtime has not touched yet. One `querySelector` against this is the
  // cheap "is there anything to do?" for `replayCachedFences`, which now runs on every
  // content mutation rather than once per debounce.
  const UNTAGGED_FENCE_SELECTOR = `:is(pre, marp-pre):not([data-lattice-settle]) > :is(${MERMAID_CODE})`;
  // A fence that is tagged and still waiting for its SVG. Shared by the replay below
  // and by initAndRun, so the two can never disagree about what "pending" selects.
  const PENDING_FENCE_SELECTOR =
    `:is(pre, marp-pre)[data-lattice-hydrate="${MERMAID_PLUGIN}"][data-lattice-settle="pending"]`;
  // A fence this runtime tagged and then GAVE UP on, because Mermaid never became real
  // in this document. `mermaid.css` shows the source for this state, exactly as it does
  // for `error` — see releaseUnrenderableFences.
  /**
   * A fence the bootstrap deadline handed back to the author — reclaimable when Mermaid
   * finally turns up.
   *
   * EXCEPT WHEN AN EXPORT FINALIZED IT, which is what `[data-lattice-final]` marks. An export
   * releases its un-settled fences at the moment it gives up waiting, precisely so the capture
   * ships the author's source instead of a blank; taking that back would put the blank into a
   * downloaded file. And the window is real rather than theoretical: `bakeDeckSections`
   * releases, then `await`s a dynamic import before it reads `outerHTML`, and the capture frame
   * shares this thread — so a debounced pass scheduled during the wait can land in that gap,
   * reclaim the fence, re-hide it, and the capture takes the blank. It would be intermittent,
   * and it would look exactly like the defect the release exists to fix.
   *
   * The mark says "this fence's state is final for this document" and nothing else. The runtime
   * never sets it; only a consumer that is about to capture does.
   */
  const RELEASED_FENCE_SELECTOR =
    `:is(pre, marp-pre)[data-lattice-hydrate="${MERMAID_PLUGIN}"][data-lattice-settle="unavailable"]:not([data-lattice-final])`;

  /**
   * HAND EVERY STILL-PENDING FENCE BACK TO THE AUTHOR, because Mermaid is not coming.
   *
   * `wrapFences` tags every fence at boot, BEFORE it knows whether Mermaid will ever
   * arrive — deliberately, because that is the only way to cover the load window that
   * made the source flash (2026-09-05-diagram-fence-flash.md §4A). The tag is what
   * `mermaid.css` hides on. So on a document where Mermaid never becomes real — a 404 on
   * the script, a CSP that blocks it, VS Code's plain-markdown-preview stub, a host that
   * loads this runtime and no renderer — the fence stayed `pending` and hidden forever,
   * and the author's only signal that their diagram did not draw was an EMPTY SLOT. In a
   * file they downloaded, that is permanent (#2092).
   *
   * `unavailable` rather than removing the attribute, and the difference is load-bearing
   * three ways:
   *   · `[data-lattice-diagrams] …:not([data-lattice-settle])` withholds an UNTAGGED
   *     fence's ink, so removing the tag would hide the source again — invisibly — in
   *     exactly the documents that stamp (the watched preview frames, the Stage window);
   *   · `wrapFences` skips any tagged `<pre>`, and its selector matches the defanged
   *     `language-mermaid-source` class too, so an un-tagged fence would be re-tagged and
   *     re-hidden by the next pass;
   *   · a distinct value is what `waitForDiagrams` (the Studio's export capture) reads to
   *     know the fence is SETTLED, so a failed diagram stops burning the bake's whole
   *     12s budget.
   *
   * The empty `.mermaid` sibling is left in place — CSS collapses it, the same way it
   * collapses it for `error` — so `fenceJob` still finds its target if Mermaid turns up
   * late and `reclaimReleasedFences` puts these back.
   *
   * @returns {number} how many fences were handed back
   */
  function releaseUnrenderableFences() {
    if (typeof document === 'undefined') return 0;
    let released = 0;
    for (const preEl of document.querySelectorAll(PENDING_FENCE_SELECTOR)) {
      preEl.dataset.latticeSettle = 'unavailable';
      released++;
    }
    return released;
  }

  /**
   * Put released fences back in the queue, for a Mermaid that turns up after we gave up.
   *
   * Without it, a slow script landing after the deadline would leave the author looking at
   * source for the rest of the session on a host that does not replace its section DOM —
   * the give-up is one-shot, so `tick` has returned by then.
   *
   * RECLAIMING IS HIDING, WHICH IS WHY IT ASKS FIRST. `pending` is the state `mermaid.css`
   * hides on, so flipping a fence back to it on a pass that then declines to render is
   * strictly worse than leaving it alone: the author had their source, and now has a blank.
   * An independent checker drove exactly that — `initAndRun` reclaimed BEFORE its
   * `themeSettled` guard, and on a host whose theme vars never resolve (marp-vscode's
   * webview, by that guard's own docblock) the walk returned `false` every time while the
   * fence stayed hidden forever. The `force` that would break the deadlock only ever comes
   * from `tick`, which has already given up.
   *
   * So this runs AFTER the guard, and takes back only a fence the caller says it can
   * actually render — `fenceJob` returns null when the `.mermaid` target is not where it
   * expects, and the walk would `continue` past it, stranding it `pending` for good.
   *
   * @param {(preEl: Element) => boolean} canRender the caller's own renderability test
   */
  function reclaimReleasedFences(canRender) {
    if (typeof document === 'undefined') return;
    for (const preEl of document.querySelectorAll(RELEASED_FENCE_SELECTOR)) {
      if (canRender && !canRender(preEl)) continue;
      reclaimed.add(preEl);
      preEl.dataset.latticeSettle = 'pending';
    }
  }

  /**
   * The fences a reclaim took back, so a FAILED walk can put them where it found them.
   *
   * `canRender` answers "is this fence shaped right", which is not the same question as
   * "will this pass render it" — and a second checker drove the gap: a `window.mermaid`
   * real enough to clear `initAndRun`'s guard but whose `initialize` throws (the class of
   * host the bootstrap comment describes) sends the walk down its catch, and both catches
   * reset to `pending`. For an ordinarily pending fence that is right — mermaid is real,
   * the next pass should retry it. For a RECLAIMED one it is the pre-#2092 outcome
   * produced by the fix: the author had their source in a 446px box and now has a 0px
   * empty slot, permanently, because every retry re-fails the same way.
   *
   * So a reset asks where the fence came from. A WeakSet, because the entries are DOM
   * nodes a host may replace wholesale on every keystroke.
   */
  const reclaimed = typeof WeakSet === 'function' ? new WeakSet() : null;

  /**
   * Put one fence back after a failed walk — to `pending` if it was already waiting, and
   * to `unavailable` if a reclaim took it from the author. See `reclaimed`.
   */
  function resetFenceAfterFailure(preEl) {
    if (preEl.dataset.latticeSettle !== 'hydrating') return;
    // DROP ANY HELD INK ON THE WAY BACK. `adoptOutgoingDiagrams` can leave the PREVIOUS
    // source's SVG in the slot while the new one renders, and the two failure paths that
    // land here — a throw mid-walk, and a `mermaid.initialize` that throws inside a run —
    // reach `pending` WITHOUT passing through `attachError`, which is the only other thing
    // that clears the target. Left in place, an intermittently-throwing Mermaid retries
    // forever while the slide keeps displaying a diagram built from source the author has
    // already changed. A fence that never held anything has an empty target, so this is a
    // no-op for it.
    const target = preEl.nextElementSibling;
    if (target?.classList.contains('mermaid')) target.innerHTML = '';
    preEl.dataset.latticeSettle = reclaimed?.has(preEl) ? 'unavailable' : 'pending';
  }

  // Give a freshly written diagram its motion roles, so a deck's `motion:` animates it like a chart.
  // Runs BEFORE the fence flips to `rendered` and `markFenceDrawn` announces it, so the roles are
  // there when the live motion host looks. Attributes only — no markup — so this is not a #22
  // injection point. It must never throw: it runs inside the render queue's success path, where a
  // throw is caught as a RENDER failure and would swap a drawn diagram for its error box. A diagram
  // without roles is only a still picture.
  function tagDiagramMotion(target) {
    try {
      const svg = target.querySelector('svg');
      if (svg) tagMermaidMotion(svg);
    } catch (_e) { /* no roles → the diagram stays still; it still draws */ }
  }

  /**
   * This fence drew, so it is no longer the author's source on loan.
   *
   * Named rather than an inline `reclaimed?.delete(...)` because one of the two call sites
   * is INSIDE the render-queue block, which `diagram-queue.test.js` lifts and evaluates on
   * its own — a bare reference to `reclaimed` there is a ReferenceError, and an optional
   * chain does not save an undeclared identifier. Both touchpoints go through a function
   * the lift can inject.
   */
  function markFenceDrawn(preEl) {
    reclaimed?.delete(preEl);
    announceDiagramDrawn();
  }

  // Tell a same-origin host page that a diagram just drew. The live motion host (docs
  // anima-scenes.ts / DeckPreview.tsx) animates diagrams, but the runtime draws them AFTER the
  // render the host rebinds on, so without a signal the host never sees one. The event goes to
  // `window.frameElement` — the host's own <iframe> element — because that element SURVIVES a
  // srcdoc rewrite, while this document and anything registered on it do not; a host listens once.
  // Synchronous on purpose: the host pre-hides the diagram inside this call, before the browser
  // paints its still frame. `frameElement` is null outside a same-origin frame (a plain page, a
  // cross-origin host), so everywhere else this is a no-op. A listener's throw is reported by
  // dispatchEvent, never thrown into the render queue.
  function announceDiagramDrawn() {
    try {
      const host = window.frameElement;
      if (host && typeof host.dispatchEvent === 'function') host.dispatchEvent(new CustomEvent('lattice:diagram-drawn'));
    } catch (_e) { /* no host to tell */ }
  }

  /**
   * The (scope, source) pair a pending fence resolves to, or null when it is not a
   * fence this path can settle. Extracted so the SAME derivation feeds the debounced
   * walk and the same-task replay: a second copy would be free to drift on the two
   * details that decide a cache key — the trim, and the portrait reorientation.
   */
  function fenceJob(preEl) {
    const codeEl = preEl.querySelector(':scope > code');
    const target = preEl.nextElementSibling?.classList.contains('mermaid')
      ? preEl.nextElementSibling
      : null;
    if (!codeEl || !target) return null;
    const sectionEl = codeEl.closest('section');
    // Reorient a LR/RL flowchart to TB/BT on a portrait slide so it flows down the
    // tall frame — matches the emulator's PDF path (lib/integrations/mermaid/
    // reorient.js). The section's data-orientation is stamped by
    // patchSectionGeometry; absent (landscape) → source is unchanged. A fence in a PANE lays
    // out for the pane: its `<lat-pane>` carries the engine's stamp for its own box (a 35% side
    // pane is portrait on a landscape slide), as the CLI's Mermaid bake reads it.
    const orientation = (codeEl.closest('lat-pane') || sectionEl)?.getAttribute('data-orientation') || 'landscape';
    const source = reorientMermaidForPortrait((codeEl.textContent || '').trim(), orientation);
    return { preEl, target, source, sectionEl };
  }

  /**
   * Hand a fence the SVG this session already rendered for its (scope, source) pair.
   * Returns false when nothing is cached, leaving the fence pending for the render
   * queue. NEVER guesses: a miss is a re-render, not a near-enough SVG.
   */
  function settleFenceFromCache(job) {
    const cachedSvg = mermaidSvgCache.get(diagramCacheKey(diagramScopeKey(job.sectionEl), job.source));
    if (!cachedSvg) return false;
    // Destructured rather than written as `job.target.innerHTML`, so this stays the
    // SAME sink expression the #22 runtime-markup census counts (`target.innerHTML`).
    // The census is a text matcher; renaming the receiver would read to it as a brand
    // new, undeclared injection point.
    const { target, preEl } = job;
    target.innerHTML = cachedSvg;
    tagDiagramMotion(target);
    preEl.dataset.latticeSettle = 'rendered';
    markFenceDrawn(preEl);
    return true;
  }

  /**
   * SETTLE WHAT WE ALREADY HAVE, IN THE SAME TASK AS THE SWAP THAT BROUGHT IT IN.
   *
   * A MutationObserver callback is a MICROTASK: it runs after the host's `innerHTML`
   * write and BEFORE the frame that write produces. `scheduleRun` deliberately does
   * not run there — it debounces 150ms, because re-rendering a deck's diagrams on
   * every keystroke is exactly what the debounce exists to prevent.
   *
   * But the two things that decide what the NEXT FRAME PAINTS cost neither a render
   * nor a `mermaid.initialize`: tagging the fence (which is what the CSS hides on)
   * and handing it an SVG we are already holding. Paying those 150ms late is what an
   * author sees as the diagram blinking back to its source — measured at 10 painted
   * frames per keystroke on an idle machine, with the finished SVG in cache
   * throughout (engineering/decisions/2026-09-05-diagram-fence-flash.md §3).
   *
   * So the cheap half moves to the microtask and the expensive half stays debounced.
   * Every fence this cannot settle is left exactly as `wrapFences` left it — pending,
   * and hidden by CSS — for `initAndRun` to render on its own schedule.
   *
   * IT REUSES THE RUNTIME'S OWN CACHE AND KEY, which is the whole safety argument.
   * `diagramCacheKey(diagramScopeKey(section), source)` is the same pair the
   * debounced walk uses, so a slide whose palette differs misses here exactly as it
   * misses there. A replay keyed on source text alone would hand a `_class: dark`
   * slide the light slide's baked ink — the #1332 step-3 bug, reintroduced through
   * the fast path.
   *
   * The one case it silently declines: a PORTRAIT slide whose `data-orientation` has
   * not been stamped yet when the burst arrives reorients to nothing, so its key
   * misses and the fence waits for the debounced pass. A miss, never a wrong SVG.
   */
  // ── BEGIN ADOPTION PORT — lifted verbatim by test/unit/runtime/diagram-adoption.test.js.
  /**
   * HOLD THE INK THAT IS ALREADY ON SCREEN WHILE THE NEW SOURCE RENDERS.
   *
   * The Studio's typing hot path replaces a whole `<section>` (`patchSections` →
   * `lattice.replaceChild`), so the rendered `<svg>` for a diagram slide is
   * DESTROYED on every keystroke, cache or no cache. When the keystroke landed
   * inside the fence the source is new, so `settleFenceFromCache` has nothing to
   * hand back and the slot waits for a real `mermaid.render` — measured at 10–11
   * painted frames, ~200ms, per character on an idle machine.
   *
   * That window has only ever had two occupants and both are wrong: the raw
   * Mermaid source (what shipped before 2026-09-05) or an empty slot (what
   * replaced it). The third is the one an author expects — keep showing the
   * diagram they already have until its replacement is ready — and it is
   * available for free, because the outgoing `<svg>` is still reachable in the
   * MutationRecord's `removedNodes`.
   *
   * So: move the outgoing SVG into the fence that replaced it and leave the
   * `<pre>` `pending`. `replayCachedFences` has already run, so what reaches here
   * is only the fences a cached SVG could NOT answer; leaving them `pending` is
   * what guarantees the debounced pass still renders the new source over the top.
   * Nothing here shortens the render — it changes what the author looks at while
   * it runs.
   *
   * WHAT IT REFUSES TO DO, and why each guard is not optional:
   *
   * · Adopt across a DIFFERENT NUMBER OF FENCES. Positional matching is the only
   *   identity available (the source changed — that is why we are here), so a
   *   slide that gained or lost a diagram would shift every later one by a slot
   *   and show diagram N-1's ink in diagram N's box.
   * · Adopt across a DIFFERENT SCOPE. `diagramScopeKey` is the same key the cache
   *   uses; when it differs the slide's palette differs (an author typing
   *   `_class: dark` onto a diagram slide), and the held ink would be the old
   *   band's, beside freshly repainted surface chrome. A miss costs one blank
   *   render — exactly what every edit costs today.
   * · Adopt on a swap the HOST did not call `in-place` — the load-bearing refusal, and the
   *   one the structural guards cannot supply: both preview hosts replace slide DOM in one
   *   mutation, so navigating between two diagram slides is shaped exactly like an edit.
   *   See the gate at the top of this function.
   * · Run in a document with no Mermaid. Same guard, same reason, as the replay:
   *   a held SVG that is never replaced is a permanently stale diagram.
   *
   * The held SVG is TRANSIENT by construction — the fence stays `pending`, so the
   * only way it outlives the next pass is a render that fails, and `attachError`
   * clears the target before it shows the error. That is what separates this from
   * handing a CACHED SVG across a scope change (#1332 step 3): that would have
   * been a final answer, this is a placeholder with a render already queued.
   */
  /**
   * Every fence `<pre>` in a subtree, in document order. Both sides of an adoption are
   * indexed the same way so position means the same thing on each — which is the whole
   * basis of the match, and why the counts have to agree before any of it is trusted.
   */
  function fencePres(node) {
    if (!node || node.nodeType !== 1 || typeof node.querySelectorAll !== 'function') return [];
    const out = [];
    for (const codeEl of node.querySelectorAll(FENCE_CODE_SELECTOR)) {
      if (codeEl.parentElement) out.push(codeEl.parentElement);
    }
    return out;
  }

  function adoptOutgoingDiagrams(records) {
    if (typeof document === 'undefined') return;
    // ONLY A SWAP THE HOST CALLS `in-place`. Holding the outgoing diagram is correct exactly
    // when the arriving fence is the SAME fence, edited — and from inside the frame that is
    // not decidable. Both preview hosts replace slide DOM in one mutation, so an edit and a
    // navigation to another slide arrive identically: same node count, same fence count,
    // same scope key. Only the host knows which happened, and it now says so before the
    // write (`patchSlideBody`, `patchSections`).
    //
    // A TEXT HEURISTIC WAS TRIED HERE AND IS WRONG, which is worth the sentence because it
    // looked right: score the shared head and tail of the two sources and hold above a
    // threshold. It measures shared BOILERPLATE, not sameness of drawing. All twelve ordered
    // pairs of `examples/mermaid-init-merge.md` — four slides whose whole point is that the
    // SAME graph renders differently under different `%%{init}%%` lines — score 0.68 to 0.82
    // and would each have held the others' ink. Two `sequenceDiagram`s sharing participants
    // score 0.76. The threshold had been fitted to one pair in one bench deck.
    //
    // No stamp means no hold: a host that has not been taught this (marp-vscode, any
    // embedder) gets the pre-2026-09-06 behavior, an empty slot for the length of a render.
    const lattice = document.querySelector('.lattice');
    // READ IT ONCE, THEN CLEAR IT. The stamp describes the write the host is making right
    // now, and a host sets it immediately before writing — so leaving it behind lets a
    // LATER burst from some other source read an answer that was never about it. Nothing
    // reachable exploits that today (the runtime's own replacements all fail the
    // added/removed count check below), but an attribute that outlives its meaning is a
    // trap for whoever adds the next mutation source. This observer watches childList and
    // subtree only, never attributes, so removing it here cannot re-enter.
    const kind = lattice?.getAttribute('data-lattice-swap');
    if (lattice) lattice.removeAttribute('data-lattice-swap');
    if (kind !== 'in-place') return;
    // The Mermaid guard comes AFTER the read, not before it. It is the same guard
    // `replayCachedFences` opens with and it means the same thing — a held SVG nothing will
    // ever replace is permanently stale — but returning on it FIRST left the stamp standing
    // in exactly the documents where nothing consumes it, so the next burst read an answer
    // written for an earlier one. Clearing is unconditional; only the holding is guarded.
    const mermaid = globalScope.mermaid;
    if (!mermaid || typeof mermaid.render !== 'function' || typeof mermaid.initialize !== 'function') return;
    for (const record of records) {
      if (!record.addedNodes || !record.removedNodes) continue;
      // NODE FOR NODE, not flat across the record. `patchSections` has a second branch
      // (`lattice.innerHTML = next.join()`, when a slide is added or removed) whose single
      // record spans the WHOLE DECK, and pairing flat across that would let a fence match
      // one from a different slide whenever the counts happened to agree. Requiring the
      // node lists to be the same length and pairing index-for-index makes the ordinary
      // `replaceChild` exact and refuses a deck rebuild that reshaped the filmstrip.
      if (record.addedNodes.length !== record.removedNodes.length) continue;
      for (let n = 0; n < record.addedNodes.length; n++) {
        adoptWithinNode(record.removedNodes[n], record.addedNodes[n]);
      }
    }
  }

  /** One outgoing node's fences into the node that replaced it. See adoptOutgoingDiagrams. */
  function adoptWithinNode(outgoing, incoming) {
    // `null` where a fence had not rendered yet: it keeps the two lists aligned by
    // POSITION, so one un-rendered diagram on a multi-diagram slide costs only its own
    // hold instead of refusing the whole slide.
    const donors = fencePres(outgoing).map((preEl) => {
      // ANY FENCE WHOSE SLOT HOLDS INK MAY DONATE — including one THIS walk filled a
      // moment ago and left `pending`. That chaining is the difference between a feature
      // that works while an author types and one that does not, and the numbers are not
      // close: this rule was `rendered`-only until the adversarial trio measured it on the
      // built Studio, where typing 8 characters at 120ms showed an EMPTY slot for 62 of 71
      // painted frames — 87% of the burst. After the first keystroke the donor is the
      // placeholder the previous adoption left, `rendered`-only refused it, and the hold
      // covered exactly one character. At 250ms — slower than the debounce — the same
      // build held all 127 frames, which is why the single-keystroke bench arm reported a
      // clean sweep for an interaction nobody has.
      //
      // What made `rendered`-only necessary was cross-slide travel: an author clicking a
      // rail faster than the debounce carried one slide's diagram across every slide they
      // touched. That is now unreachable, and by a stronger guard than this one ever was —
      // a rail click is a `reflow` and this function has already returned. Chaining under
      // an `in-place` stamp stays on one slide by construction, so what travels forward is
      // the last ink this fence showed, which is exactly what the author should keep
      // seeing until their new source finishes rendering. The rule was never re-derived
      // after the stamp landed; re-deriving it is what this is.
      const sib = preEl.nextElementSibling;
      const svg = sib?.classList.contains('mermaid') ? sib.querySelector('svg') : null;
      if (!svg) return null;
      return { svg, sectionEl: preEl.closest?.('section') || null };
    });
    if (!donors.some(Boolean)) return;
    const arrivals = fencePres(incoming);
    if (arrivals.length !== donors.length) return;
    for (let i = 0; i < arrivals.length; i++) {
      const donor = donors[i];
      if (!donor) continue;
      const preEl = arrivals[i];
      // Only a fence the cache could not settle. `rendered` means `replayCachedFences`
      // just gave it the real SVG for this exact source; overwriting that with the
      // previous one would be a downgrade, and re-marking it would cost a re-render.
      if (preEl.dataset.latticeSettle !== 'pending') continue;
      const target = preEl.nextElementSibling;
      // A target that ALREADY holds an SVG is not this walk's to touch, and the
      // `pending` check above does not cover it: a host that replaces the <pre> while
      // leaving the `.mermaid` sibling in place (the marp-vscode shape wrapFences
      // describes) can present a live SVG beside an un-settled fence, and a runtime
      // transform that MOVES a fence and its target together arrives as one record
      // holding the same still-live nodes on both sides.
      if (!target?.classList.contains('mermaid') || target.querySelector('svg')) continue;
      if (diagramScopeKey(preEl.closest?.('section') || null) !== diagramScopeKey(donor.sectionEl)) continue;
      // `appendChild` MOVES the node. The donor's section is already detached, so this
      // is a transplant of the live element — no serialization, no re-parse.
      target.appendChild(donor.svg);
    }
  }

  // ── END ADOPTION PORT

  function replayCachedFences() {
    if (typeof document === 'undefined') return;
    // The SAME guard initAndRun opens with, and for the same reason: tagging a fence is
    // what hides it, so tagging one in a document that has no Mermaid to render it hides
    // the source permanently. A host can load this runtime without Mermaid — one whose
    // library load is still in flight or failed, or VS Code's plain markdown preview, whose
    // bierner.markdown-mermaid was believed to expose a render-blocks-only shim with no
    // `.render` — see the note at `isRealMermaid` in `boot`; at 1.32.1 it installs no
    // global at all, which this guard handles identically. The
    // replay runs on every content mutation, so without this it would reach fences that
    // arrive AFTER boot, which the guarded bootstrap pass never sees.
    const mermaid = globalScope.mermaid;
    if (!mermaid || typeof mermaid.render !== 'function' || typeof mermaid.initialize !== 'function') return;
    if (!document.querySelector(UNTAGGED_FENCE_SELECTOR)) return;
    wrapFences();
    for (const preEl of document.querySelectorAll(PENDING_FENCE_SELECTOR)) {
      const job = fenceJob(preEl);
      if (job) settleFenceFromCache(job);
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
  // in data-lattice-settle=pending.
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
    // EMPTY, and deliberately still here (#1674). `startOnLoad`, `securityLevel` and
    // `suppressErrorRendering` used to live in this block: all three are Mermaid SECURE
    // KEYS, which `sanitize` strips from anything that is not `mermaid.initialize`, so
    // the export — configured by `%%{init}%%` directive at the time — could not state
    // them and they were listed as sanctioned divergences. The export owns its render
    // page now and calls `initialize`, so all three moved into `engineInitConfig` and
    // are sent by both paths; the security reasoning for `securityLevel: 'strict'`
    // moved with them.
    //
    // The block and its sentinels stay because the parity gate lifts and EXECUTES this
    // source between them. Deleting it would delete the gate's subject, and the next
    // genuinely preview-only key would land with nothing watching. Add here, and add to
    // DIVERGENT_CONFIG in the same edit.
    //
    // NOTE: do NOT set `layout` here. Mermaid 11.x recognizes only "dagre" (built-in)
    // and "elk" (separate package). Any other value makes Mermaid throw "Unknown layout
    // algorithm" mid-render, which `suppressErrorRendering: true` then swallows silently
    // — leaving state / ER / class diagrams with `data-processed=true` but no SVG.
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
  // the cache would show the old theme colors. This is acceptable because theme
  // switches require a manual preview reload in marp-vscode anyway. (A per-slide
  // `_class:` EDIT is not that case and is handled: it changes the section's class
  // list, so it changes the scope key, so it misses the cache and re-renders.)
  const mermaidSvgCache = new Map();

  /**
   * LOAD MERMAID THROUGH THE PLUGIN HOST, when the document has a fence and nothing else will.
   *
   * The library is the plugin's declared `payload` (lib/plugins/mermaid/mermaid.manifest.json),
   * staged beside this runtime by its file name — so no host threads a Mermaid URL into the
   * frame it builds, and a frame that gains its first diagram by an edit (the Studio patches
   * sections into a live frame) loads the library then, instead of needing a rebuild that
   * injects a tag. A host that DID write its own Mermaid `<script src>` (the Export-to-Marp
   * kit) keeps it: bootstrap asks only when no such tag exists.
   *
   * One request per document, whatever calls it, and never in a document whose host wrote its
   * own Mermaid tag (`hostMermaidTag`, set at boot): there the host's script is the library, and
   * asking for ours too either 404s — releasing fences the host tag was about to draw — or loads
   * Mermaid twice (HARD RULE #25 checker, driven in Chromium). While the load is in flight every
   * fence is tagged `pending` (hidden, as at boot); a load that fails hands every tagged fence
   * back to its source HERE, not only through the bootstrap's give-up — which is one-shot, and has
   * usually fired already (with nothing to release) in a document that gained its first fence
   * after the deadline (same checker: that fence stayed hidden for good); a load that lands
   * schedules the pass that draws them.
   *
   * @returns {string} the host's answer: 'ready' | 'loading' | 'failed' | 'unavailable' | ''
   *   ('' — no fence, nothing asked)
   */
  let mermaidLibraryRequest = '';
  let mermaidLibraryFailed = null; // bootstrap's give-up (for its log line), once it is installed
  let hostMermaidTag = false; // bootstrap found a host-written Mermaid <script src>
  function requestMermaidLibrary() {
    if (typeof window === 'undefined' || typeof document === 'undefined' || hostMermaidTag) return '';
    if (mermaidLibraryRequest === 'loading' || mermaidLibraryRequest === 'failed') return mermaidLibraryRequest;
    if (!document.querySelector(FENCE_CODE_SELECTOR)) return '';
    const state = getPluginHost().ensureLibrary(MERMAID_PLUGIN, () => isRealMermaidLibrary(globalScope.mermaid), (ok) => {
      mermaidLibraryRequest = ok ? 'ready' : 'failed';
      if (ok) {
        // IN THE SCRIPT'S OWN `onload`, which fires strictly before the window's `load` — and
        // Mermaid registers its OWN `load` listener when it evaluates (`startOnLoad` defaults to
        // true), which runs `mermaid.run()` over every `.mermaid` element: our EMPTY render
        // targets, drawn as its "Syntax error in text" graphic. When the library came from a
        // parser-inserted host tag our first `initialize({ startOnLoad: false })` ran long before
        // `load`; loaded here it lands just before, so switch that pass off now and draw at once
        // rather than on the next frame or debounce, which an offscreen print may never reach
        // (HARD RULE #25 red team, driven in Chromium; mermaid-parse.ts guards the same hazard).
        try { globalScope.mermaid.startOnLoad = false; } catch (_e) { /* a frozen global: our initialize still sets it */ }
        try { if (!initAndRun()) scheduleRun(); } catch (_e) { scheduleRun(); }
        return;
      }
      releaseUnrenderableFences();
      if (mermaidLibraryFailed) mermaidLibraryFailed('the plugin host could not load its library');
    });
    if (state === 'loading' || state === 'failed') mermaidLibraryRequest = state;
    if (state === 'loading') wrapFences();
    return state;
  }

  function runPass({ force = false } = {}) {
    const mermaid = globalScope.mermaid;
    // Guard against a `window.mermaid` that is not the real library — a host may install
    // something else on that global (see the note at `isRealMermaid` in `boot` for what
    // bierner.markdown-mermaid actually does, which is not what this comment used to say).
    // Without this check, scheduleRun
    // from the MutationObserver could re-enter configureForScope with the
    // stub and throw "mermaid.initialize is not a function".
    if (!mermaid || typeof mermaid.initialize !== "function" || typeof mermaid.render !== "function") {
      // A fence that arrived after boot, in a document whose host injected no Mermaid, asks the
      // plugin host for the library; the load schedules this pass again when it lands.
      requestMermaidLibrary();
      return false;
    }

    wrapFences();
    if (!themeSettled({ force })) return false;

    // Mermaid is real AND the theme has landed, so this pass will genuinely walk. Only now
    // is it safe to take back what the bootstrap deadline handed to the author: reclaiming
    // re-hides the fence, and a pass that reclaims and then returns early leaves a blank
    // where the source was. See reclaimReleasedFences.
    reclaimReleasedFences((preEl) => !!fenceJob(preEl));

    // A pre is "pending" until mermaid.render() resolves into its sibling
    // target or we attach an error sibling. Re-running initAndRun is a no-op
    // for handled fences because we filter on data-lattice-settle — and the
    // same-task replay above has already settled every fence whose SVG was
    // cached, so what reaches this walk is only what genuinely needs rendering.
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
    for (const preEl of document.querySelectorAll(PENDING_FENCE_SELECTOR)) {
      const job = fenceJob(preEl);
      if (!job) continue;
      // Cache hit: this (scope, source) pair was rendered earlier this session —
      // reuse the SVG directly and skip mermaid.render() entirely. This is the
      // common case when a host replaces sections wholesale on every keystroke: only
      // the fence whose source actually changed gets a fresh render call. Handled
      // BEFORE the deck is built so an unchanged deck reaches the kernel empty and
      // never reconfigures mermaid at all. (The observer's same-task replay settles
      // most of these one microtask after the swap; this arm still earns its place
      // for the passes the observer does not drive — the bootstrap tick, and the
      // rAF retry after `themeSettled` was not yet true.)
      if (settleFenceFromCache(job)) continue;

      // Mark in-flight so a re-entrant scheduleRun does not double-dispatch. Set
      // BEFORE the queue drains, because the queue is async and the observer is not.
      preEl.dataset.latticeSettle = "hydrating";
      fences.push(job);
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
      // `hydrating` before the walk, and the pending-fence selector above only picks up
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
          resetFenceAfterFailure(job.preEl);
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
      // `hydrating` before the walk and the pending-fence selector only picks up
      // `pending`, so a run that failed HERE left those diagrams blank for the session
      // with nothing to retry them and no diagnostic. Hand them back to `pending` and say
      // so. (On the pre-#1332 path this could not happen: `ensureConfigured` threw
      // synchronously BEFORE any fence was marked, so the retry budget covered it.)
      .catch((err) => {
        for (const preEl of fences) resetFenceAfterFailure(preEl);
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
    // executed, stranding that fence at `hydrating`.
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
  // those fences stamped `hydrating`, which the pending-fence selector does not re-select,
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
      preEl.dataset.latticeSettle = "error";
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
          tagDiagramMotion(target);
          if (result.bindFunctions) {
            try { result.bindFunctions(target); } catch (_e) { /* non-fatal */ }
          }
          preEl.dataset.latticeSettle = "rendered";
          // The fence drew, so it is no longer the author's source on loan — a LATER,
          // unrelated failure must hand it back to `pending` for a retry, not to
          // `unavailable`. See `reclaimed`.
          markFenceDrawn(preEl);
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
    preEl.dataset.latticeSettle = "error";
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

  function boot() {
    // Detect whether `window.mermaid` is the real Mermaid library — a host may put
    // something else on that global, and calling `.initialize` on it throws.
    //
    // THE EXAMPLE THIS COMMENT USED TO GIVE IS WRONG AT THE CURRENT VERSION, and it took
    // opening a real VS Code to find out. It said `bierner.markdown-mermaid` installs a
    // STUB exposing only `renderMermaidBlocksInElement` and lacking `.initialize` /
    // `.render` / `.version`. Measured at 1.32.1, in both the plain markdown preview and
    // the marp-vscode one: `typeof window.mermaid` is `undefined` — there is no global to
    // stub-check. The guard is unaffected (an `undefined` fails `typeof … === 'function'`
    // the same way a stub does), so this is a correction to the STORY, not the code. It
    // may have described an older release; older ones were not tested. The extension does
    // still render `<pre><code class="language-mermaid">` fences with its own bundled
    // build, which is why `wrapFences` defangs the language class.
    // engineering/decisions/2026-09-05-diagram-fence-flash.md § 8.
    //
    // Our `<script src="…/mermaid.min.js">` UMD will overwrite that stub
    // unconditionally — but only once it finishes loading. Until then we
    // must keep waiting; using the stub yields TypeError on .initialize.
    const isRealMermaid = isRealMermaidLibrary;

    // ...existing comment about two distinct waits applies, with one tweak:
    //
    //   1. Waiting for the REAL `window.mermaid` (one with .initialize/.render),
    //      not just any object on the global. ...
    let mermaidWaitFrames = 0;
    let themeWaitFrames = 0;
    const MERMAID_WAIT_CAP = 600;   // ~10s @ 60fps
    const MERMAID_WAIT_MS = 10000;  // the same deadline, on a clock rAF cannot starve
    const THEME_WAIT_CAP = 30;      // ~500ms @ 60fps

    /**
     * GIVING UP IS AN EVENT WITH A CONSEQUENCE, so it happens in exactly one place.
     *
     * Before #2092 the give-up was a bare `return` out of `tick`: it logged, and left
     * every fence tagged `pending` — which is what `mermaid.css` hides on. So the author
     * got an empty slot instead of the source they wrote, on three export paths and on
     * every host where this runtime boots without a renderer.
     */
    let gaveUp = false;
    const giveUp = (why) => {
      if (gaveUp) return;
      gaveUp = true;
      const released = releaseUnrenderableFences();
      // IT DOES NOT TOUCH `data-lattice-diagrams`, AND THAT IS A DELIBERATE REVERSAL.
      // Dropping the stamp here looks right — the attribute is the document's promise that
      // something will draw a fence, and we have just concluded nothing will, so a fence the
      // author types AFTER this point would be hidden by the anti-flash rule rather than
      // merely un-drawn. It shipped that way for one commit. What an independent checker
      // then measured is that the rule cannot fire in any host that stamps: the preview
      // cascade scopes it to `article.lattice > section [data-lattice-diagrams] …`, which
      // wants the attribute INSIDE a slide, and it is on `<html>`. Read straight out of the
      // composed preview CSS, and reproduced here. So the removal protected against nothing,
      // and nothing restored it — `single-slide-render`'s patch path rewrites the body and
      // the resident `<style>`, never `<html>`'s attributes — leaving a permanent mutation
      // for no benefit. Tracked separately; whoever repairs that rule's scoping owns this
      // decision again, with the rule actually live to test against.
      if (typeof console === 'undefined') return;
      const line = `[lattice-runtime] real mermaid never loaded; giving up — ${why}. Handed ${released} fence(s) back to their source.`;
      // WARN only when a diagram actually lost, LOG otherwise. `tick` runs in every
      // document this runtime boots in, diagram or not, so warning unconditionally cried
      // wolf on every prose deck — and this change adds a second clock, which would have
      // doubled the noise. The breadcrumb stays either way: the bootstrap comment above
      // tells people to look for it.
      const say = released > 0 ? console.warn : console.log;
      say(line, 'window.mermaid =', globalScope.mermaid,
        '— check that the mermaid <script src> path resolves and that no other extension is shadowing window.mermaid.');
    };

    // TWO CLOCKS, BECAUSE ONE OF THEM STOPS. `tick`'s frame counter is the responsive
    // arm, but `requestAnimationFrame` is throttled in a backgrounded tab and does not
    // run at all in a document the compositor is not painting — and the two paths that
    // need this most are exactly those: the Studio's offscreen export capture frame and
    // its offscreen desktop print document. A frame budget that never advances never
    // gives up, so the wall clock is the arm that actually fires there. Whichever
    // reaches the deadline first wins; `giveUp` is idempotent.
    if (typeof setTimeout === 'function') {
      setTimeout(() => {
        if (isRealMermaid(globalScope.mermaid)) return;
        giveUp(`nothing real on window.mermaid after ${MERMAID_WAIT_MS}ms`);
      }, MERMAID_WAIT_MS);
    }

    /**
     * AND THE FAST ARM: THE DOCUMENT HAS ALREADY TOLD US, AND IT TOLD US SYNCHRONOUSLY.
     *
     * A host that injects Mermaid itself writes a PLAIN `<script src>` — no `async`, no
     * `defer` — BEFORE the runtime's own tag (marp-bundle.js assembles the pair in that
     * order; the docs-site builders once did too, and write no Mermaid tag now — the plugin
     * host loads the library, `requestMermaidLibrary`). A classic parser-inserted script that sits before ours has therefore
     * already had its turn by the time we execute: it ran, or it failed. So if one is there
     * and `window.mermaid` is still not real, waiting will not change the answer.
     *
     * That distinction earns its lines because of WHERE it is read. The Studio's desktop
     * print document waits `load` + 450ms and nothing else — no diagram wait at all — so a
     * ten-second deadline is far past the moment `print()` captures the page, and the fence
     * would still be hidden. This arm fires on the first tick, which is before `load`.
     *
     * IT ASKS DOCUMENT POSITION, NOT `readyState`, AND AN INDEPENDENT CHECKER IS WHY. The
     * first version tested `!el.async && (!el.defer || document.readyState !== 'loading')`,
     * which is wrong twice, and both were driven in a real browser rather than argued:
     * `readyState` flips to `interactive` BEFORE deferred scripts run, so a `defer` mermaid
     * tag that had not executed yet was reported settled; and a dynamically inserted script
     * with `async = false` carries neither flag, so it read as settled too. In both, Mermaid
     * WAS coming — and the runtime released the fences to raw source and, in an export,
     * baked that source into the artifact.
     *
     * `OWN_SCRIPT` makes the question exact FOR A TAG THE PARSER OWNED: the parser reached
     * our element, so every markup-authored classic script before it has run. A second
     * checker drove the residual and it is worth stating rather than implying — a script
     * inserted BY JAVASCRIPT with `async = false` into `<head>` also sits before our tag
     * and has NOT run, and no platform signal distinguishes the two. Measured: same
     * document, insert into `<head>` releases the fence, insert into `<body>` does not. No
     * caller in this repo inserts one that way, and the damage when one does is bounded
     * WITHOUT adding anything here: driven on that exact document, the give-up fires and
     * the diagram still lands (`gaveUp=true`, `state=rendered` at 1577ms for a Mermaid
     * served at 900ms), because the runtime already re-runs on later DOM activity. A
     * `load` listener that reclaimed directly was written, measured against that same
     * arm, changed nothing, and was deleted rather than shipped unproven — the recovery
     * path itself was not chased further. Three narrowings, each falling back to the
     * deadline rather than guessing:
     *   · no `OWN_SCRIPT` (the runtime inlined or eval'd) — no anchor, no claim;
     *   · `async` or `defer` — the parser does not own its timing, so position says nothing;
     *   · no mermaid tag at all — the document never promised a renderer, and may still
     *     install one by a route we cannot see (VS Code's plain markdown preview stub).
     *
     * The tag is matched on its FILE NAME rather than its whole resolved URL, which is the
     * same checker's finding: `el.src` resolves against the document, so a deck served from
     * a folder with "mermaid" in its path made EVERY script in the document a mermaid tag —
     * including ours — and gave up on the first tick in a document that had no mermaid
     * script at all. Driven at `/mermaid-demo/`; the cell that pins it carries an unrelated
     * third-party script in that folder, because with only our own tag there the
     * `el !== OWN_SCRIPT` exclusion rescues the case on its own and this fix goes untested.
     */
    const scriptFileName = (el) => {
      const raw = el.src || el.getAttribute('src') || '';
      try { return new URL(raw, document.baseURI).pathname.split('/').pop() || ''; }
      catch { return raw.split(/[?#]/)[0].split('/').pop() || ''; }
    };
    const mermaidScripts = typeof document !== 'undefined' && document.querySelectorAll
      ? [...document.querySelectorAll('script[src]')]
        .filter((el) => el !== OWN_SCRIPT && /mermaid/i.test(scriptFileName(el)))
      : [];
    const hasHadItsTurn = (el) => !el.async && !el.defer && !!OWN_SCRIPT
      && !!(el.compareDocumentPosition(OWN_SCRIPT) & 4 /* DOCUMENT_POSITION_FOLLOWING */);
    const mermaidPromiseBroken = () =>
      mermaidScripts.length > 0 && mermaidScripts.every(hasHadItsTurn);

    const tick = () => {
      if (!isRealMermaid(globalScope.mermaid)) {
        if (mermaidPromiseBroken()) {
          giveUp(`every <script src> naming mermaid has had its turn and none installed it (${mermaidScripts.length} tag(s))`);
          return;
        }
        if (++mermaidWaitFrames > MERMAID_WAIT_CAP) {
          giveUp(`${MERMAID_WAIT_CAP} frames elapsed`);
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
    // Mark every Mermaid fence pending immediately. Combined with the CSS rule
    // that hides <pre> for any data-lattice-settle except "error", this prevents
    // raw Mermaid source from being visible during the Mermaid library load and
    // on full webview reloads (where the SVG cache is cold and tick() takes
    // time to fire).
    wrapFences();
    // No host wrote a Mermaid tag, so the plugin host loads the library (the plugin's payload);
    // a load that fails gives up at once rather than at the deadline. A host that did write one
    // keeps the fast arm above, and a runtime with no `<script src>` to load beside keeps the
    // deadline.
    mermaidLibraryFailed = giveUp;
    hostMermaidTag = mermaidScripts.length > 0;
    if (!isRealMermaid(globalScope.mermaid) && !hostMermaidTag) {
      if (requestMermaidLibrary() === 'failed') giveUp('the plugin host could not load its library');
    }
    tick();
  }

  function onMutations(records) {
    replayCachedFences();
    adoptOutgoingDiagrams(records);
  }

  function describe() {
    return {
      mermaidLoaded: typeof globalScope.mermaid !== 'undefined',
      mermaidVersion: globalScope.mermaid?.version,
      fenceCount: document.querySelectorAll(`:is(pre, marp-pre) > :is(${MERMAID_CODE})`).length,
    };
  }

  return { boot, run: runPass, onMutations, describe };
}

module.exports = { createPass };
