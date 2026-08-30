/**
 * lattice-engine — owned markdown→slide engine. THE canonical render path.
 *
 * Status: SHIPPING. Born as the P1 core from
 * engineering/decisions/2026-06-10-marp-replacement-proposal.md, it now IS the
 * render path on every first-party surface. It renders Lattice markdown to the
 * same `<section>` HTML contract marp-core produced, by running the Lattice
 * markdown-it plugins (lib/integrations/markdown-it/plugins.js) and the shared
 * transformer registry (lib/transformers/) UNCHANGED on a plain markdown-it
 * instance whose core rulers reproduce Marpit's slide/directive token contract
 * (lib/engine/slides.js).
 *
 * The proposal's migration is COMPLETE: lattice-emulator.js and
 * lib/playground/index.js (browser) both render through this module, and the old
 * marp-cli render path (marp.config.js) is retired/deleted. The one remaining
 * Marp surface is export-TO-Marp (lib/core/marp-bundle.js) — a one-way recipient
 * bundle, not a render path of ours (see engineering/marp-independence.md).
 *
 * Parity scope: the HTML pipeline — slide splitting, the in-use directive set,
 * `class`/pagination/background-color attribute application, GFM body via
 * markdown-it 14 (the version marp-core pins), `![bg]` backgrounds (basic mode),
 * header/footer DOM, and the full plugin + registry composition. The visual CSS
 * ships separately as the built `lattice.css` + themes/ (the engine's own `css`
 * field is a minimal stub — callers supply the stylesheet); Marpit
 * advanced-background split containers for `![bg left|right]` use the dedicated
 * inline-SVG PDF path.
 *
 * Façade: render(markdown, theme) → { html, css, width, height }; geometry;
 * addThemes; hasTheme — the shape lib/playground/index.js consumes.
 */



const MarkdownIt = require('markdown-it');
// Pinned to ^11.11.1 to match the highlight.js marp-core bundles, so fenced-code
// (and ```mermaid source) token spans are byte-identical to the marp path —
// without it the engine emitted plain, uncoloured code (the 2026-06 parity sweep
// caught `code` / `compare-code` rendering monochrome against marp's hljs spans).
const hljs = require('highlight.js');
const { resetRenderIds } = require('../core/render-ids');
const { readClassAttr } = require('../core/section-walk');
const { installSlidePipeline } = require('./slides');
const { installBackgroundImage } = require('./background-image');
const { installMath } = require('./math');
const { ThemeStore } = require('./themes');
const { orientationFor } = require('./css');
const { familyFor } = require('../adaptive/families');
const { parseFrontMatter } = require('./directives');
const { deckClassValue } = require('../core/deck-class-register');
const { deckColorModeToken, frontMatterBody } = require('../core/resolve-color-mode');
const watermarkTile = require('../forms/tile/watermark/watermark.transform');
const metaTile = require('../forms/tile/meta/meta.transform');
const progressTile = require('../forms/tile/progress/progress.transform');

const {
  addHeadingPeriods,
  applyDeckLogoToHtml,
  applyBackdropToHtml,
  headingSplit,
  focusSteps,
  applyFormToggleToHtml,
  checklistItemStates,
  deckClassPropagate,
  defaultComponent,
  glossaryListToTable,
  glossaryRange,
  functionPlotFences,
  animaSceneFences,
  obligationMatrixBadges,
  matrixGridCells,
  registerMermaidHljs,
  slotLabelLift,
  stripHeadingPeriods,
  verdictGridBadges,
} = require('../integrations/markdown-it/plugins');
const { applyAllToHtml } = require('../transformers/registry');
const bgImage = require('../core/bg-image');
const { withoutExportSettingsBlock } = require('../core/export-settings');
const imageScrim = require('../transformers/image-scrim');
const fitBerth = require('../core/fit-berth');
const svgA11yNames = require('../core/svg-a11y-names');
const fenceLanguagesKernel = require('../core/fence-languages');

// Build the image component's split DOM (the lattice-bg panel + .image-text wrap
// + scrim) on the ENGINE path, so the playground/runtime render `image` like the
// emulator's PDF path (the deferred P1.1 split). Idempotent — wrapImageText and
// the scrim both check for their own output — so it no-ops on the emulator's
// pre-lifted markup. See engineering/decisions/2026-06-17-image-rearchitecture.md.
function applyImageStructure(html) {
  return html.replace(/<section\b[^>]*>[\s\S]*?<\/section>/g, (sec) => {
    let s = bgImage.wrapImageText(sec);
    // `readClassAttr`, not an inline `\bclass="…"`: `\b` matches the boundary inside
    // `data-class=` too, so the inline form only landed on the resolved list by the
    // accident of greedy backtracking picking the rightmost match (#1358).
    const cls = readClassAttr((s.match(/<section\b[^>]*>/) || [''])[0]);
    if (imageScrim.needsScrim(cls) && s.indexOf('class="image-scrim') === -1) {
      s = s.replace(/(<div class="lattice-bg[\s\S]*?<\/div>)/, `$1${imageScrim.SCRIM_HTML}`);
    }
    return s;
  });
}

// The Lattice markdown-it plugins, in the exact order the engine and the
// playground apply them. They bind to the slide-pipeline token contract.
const LATTICE_PLUGINS = [
  // `split: headings` divider — injects `hr` tokens before the slide-split
  // ruler, so it must compose first (it registers `.before('lattice_slide')`,
  // which installSlidePipeline has already created by the time this runs).
  headingSplit,
  // Expands `_focusSteps` into one slide per step. After headingSplit so the
  // `hr` slide boundaries it groups on are all present; before lattice_slide so
  // the copies become real slides.
  focusSteps,
  deckClassPropagate,
  // The catch-all layout, applied to any section that named no component.
  // AFTER deckClassPropagate so every deck-wide token is already on the section
  // when the rule reads the resolved list (#1292).
  defaultComponent,
  verdictGridBadges,
  obligationMatrixBadges,
  matrixGridCells,
  checklistItemStates,
  slotLabelLift,
  glossaryListToTable,
  glossaryRange,
  stripHeadingPeriods,
  addHeadingPeriods,
  functionPlotFences,
  // `anima` fence → a `data-scene-spec` placeholder div (Stage 6). Registered AFTER
  // functionPlotFences so its fence-rule wrapper chains onto (not over) it.
  animaSceneFences,
];

/**
 * The engine's LANGUAGE CAPABILITY — which fenced-code grammars this build can
 * actually color, and how to teach it one more.
 *
 * It lives here, on the engine, because it is a property of the product rather
 * than of whoever bundled it. Before this existed the answer was decided by an
 * esbuild `onResolve` hook in tools/build-playground.js that swapped highlight.js
 * for its 36-language `common` build, and nothing downstream could see that it had
 * happened: the `highlight` option below guards with `hljs.getLanguage(lang)` and
 * silently emits plain text on a miss, so a `powershell` fence rendered 11 token
 * spans in a CLI export and 0 in the Playground with nothing logged anywhere. The
 * capability makes the shortfall answerable — `missing(markdown)` names exactly
 * what a deck asks for that this build cannot serve — which is what lets the
 * preview fetch the few grammars it needs instead of shipping all 192 (measured:
 * 53 KB gzipped for `common` against 312 KB for the full build).
 *
 * Every engine instance shares one highlight.js singleton, so registering here
 * reaches all of them. `buildMd`'s memo caches the markdown-it INSTANCE and the
 * `highlight` closure reads the singleton at call time, so a language registered
 * after a render is picked up by the next one with no cache to invalidate.
 */
const languages = {
  /** Can this build color `name` (canonical or alias)? */
  has(name) {
    return Boolean(name && hljs.getLanguage(name));
  },
  /** Every language this build can color, canonical names only. */
  list() {
    return hljs.listLanguages();
  },
  /** Distinct fence tags a deck asks for, in first-appearance order. */
  needed(markdown) {
    return fenceLanguagesKernel.fenceLanguages(markdown);
  },
  /** The subset of `needed()` this build cannot serve — what to go and fetch. */
  missing(markdown) {
    return fenceLanguagesKernel.missingLanguages(markdown, hljs);
  },
  /**
   * Teach the singleton one grammar. Returns whether it took.
   *
   * Never throws: the caller is a preview loading a fetched file, and a grammar
   * that fails to register should cost that one fence its color, not the render.
   */
  register(name, definition) {
    if (!name || typeof definition !== 'function' || hljs.getLanguage(name)) return false;
    try {
      hljs.registerLanguage(name, definition);
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * Build a fresh engine. Each engine owns its markdown-it instance and a
 * ThemeStore. `globalBase` is reserved for front-matter directives, which
 * render() supplies per call (see below) — the instance is rebuilt per render
 * so front-matter globals seed the pipeline correctly, matching marp-core's
 * per-render directive resolution.
 */
function createEngine(opts = {}) {
  const themes = new ThemeStore();

  // `geom` is passed in rather than resolved here: it is the ONLY thing this function reads from the
  // mutable ThemeStore, so the parser memo has to resolve it anyway to key on it (see `memoizedMd`),
  // and resolving it twice per miss would be pure waste.
  function buildMd(globalBase, geom) {
    // 'commonmark' preset to match Marpit (lib/marpit.js: new MarkdownIt(
    // 'commonmark')). The default preset leaves empty edge text tokens around
    // emphasis that the commonmark preset's inline post-processing removes —
    // the plugins' `children[0].type === 'strong_open'` guards depend on the
    // clean shape. Then re-enable the GFM surface marp-core uses.
    // The `highlight` option drives markdown-it's default fence renderer; the
    // shared highlight.js singleton ships with the common languages registered
    // (an `hljs.newInstance()` would start EMPTY — getLanguage → undefined → no
    // spans). This top-level highlight.js is lattice-exclusive (marp-core bundles
    // its own copy), so it is safe for registerMermaidHljs to teach it the
    // Mermaid grammar via `md.highlightjs`, matching marp's ```mermaid coloring.
    const md = new MarkdownIt('commonmark', {
      html: true,
      // marp-core sets `breaks: true` — soft line breaks render as <br>. The
      // commonmark preset defaults it off, which dropped the <br> on multi-line
      // blockquotes/paragraphs (the parity sweep caught a math `stats` slide
      // whose CI/p-value lines collapsed onto one line vs marp's two).
      breaks: true,
      highlight: (str, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
          } catch {
            /* unhighlightable — fall back to markdown-it's default escaping */
          }
        }
        return '';
      },
    });
    md.highlightjs = hljs;
    md.enable(['table', 'strikethrough']);
    // Resolve the deck's orientation once (deck-wide @size) and hand it to the
    // slide pipeline, which stamps `data-orientation` on each <section> so
    // portrait/square layouts can reflow the landscape grids (lib/components/…).
    // Landscape stays unstamped → byte-identical. Same orientationFor the
    // scaffold + emulator + runtime use, so every path agrees.
    const orientation = orientationFor(geom).name;
    // The 4-value family from the SAME geometry — components key their reflow
    // tier off `data-family` (Frames already did), so the leaf and the frame read
    // one stamp derived from one measurement of the DECK box (#1218).
    const w = parseFloat(geom.width); const h = parseFloat(geom.height);
    const family = familyFor(Number.isFinite(w) && Number.isFinite(h) && h > 0 ? w / h : 16 / 9);
    installSlidePipeline(md, globalBase, {
      isThemeKnown: (name) => themes.has(name),
      orientation,
      family,
    });
    installBackgroundImage(md);
    if (opts.math !== false) installMath(md, { output: opts.mathOutput });
    registerMermaidHljs(md);
    for (const plugin of LATTICE_PLUGINS) md.use(plugin);
    return md;
  }

  // ── Parser memo — the markdown-it instance, reused across renders ──────────────────────
  // `buildMd` is a pure function of `globalBase` (plus this engine's fixed `opts`), and it is not
  // cheap: a fresh markdown-it, a geometry/orientation/family resolution, the slide pipeline, the
  // background-image and math plugins, the Mermaid highlight grammar, and 15 LATTICE_PLUGINS —
  // rebuilt on EVERY render. It is a roughly FIXED cost, so what it is worth scales inversely with
  // deck size. Measured by forcing a miss without changing the render — alternate two theme names of
  // identical geometry, so the key moves and nothing else does (Node, 1x CPU, p50 of 80 renders):
  // one slide 2.07 -> 1.73ms (saves 0.35ms, 17% of the render); 10 slides saves 0.20ms (8%); 40
  // prose slides saves 0.11ms (3%); the 117-slide gallery is within noise at ~44ms. Reproduce with
  // .scratch/memo-saving.mjs.
  //
  // This is the ONE lever that makes the preview's typing path faster than it was before the
  // deck-context change rather than merely level with it: typing must re-render the edited slide,
  // so no caching design can do less work than one slide render — the only way to win is to make
  // that render cheaper. It pays on every path (CLI, export, Playground, Studio), not just here.
  //
  // SOUNDNESS. Reuse is only safe if a markdown-it instance carries no state across renders.
  // `md.render()` builds a fresh `state` per call, and the plugins' core rulers reset per document
  // (`glossaryRange` resets on `lattice_slide_open`), but "no cross-render state" is a property to
  // VERIFY, not to assume — and it was unverifiable until the `<defs>` id sequences became
  // render-scoped, because the renderer was not deterministic in the first place. It is now, so
  // the guard is a byte-comparison over every committed deck: see
  // test/unit/engine/parser-memo.test.js.
  //
  // ONE entry, keyed on the full input set, replaced on any miss — a deck-switch or a theme change
  // rebuilds. Keeping one entry (rather than a map) bounds memory to a single parser and matches
  // the access pattern: a preview or a CLI run renders the same deck repeatedly.
  let mdMemo = null;
  function memoizedMd(globalBase) {
    // The key must cover everything `buildMd` reads, and that includes MUTABLE STATE OUTSIDE
    // `globalBase`: `buildMd` bakes the deck's orientation + family into the slide pipeline, and
    // both are pure functions of `themes.geometryFor(theme, size)` — a resolution against a store
    // that live surfaces RE-REGISTER before every render (`addThemes` overwrites by name so an
    // edited theme takes effect at once — single-slide-render.ts, theme-studio.js). Without the
    // geometry in the key, a theme whose `@size` changed hits a memo holding a parser built for the
    // OLD box: width/height update while `data-orientation`/`data-family` do not, silently
    // disabling every family-keyed reflow rule.
    //
    // Keyed on the RESOLVED GEOMETRY, not on a store mutation counter, and the difference is the
    // whole value of the memo. A counter invalidates on every `add`, and the live-theme surfaces
    // re-register the SAME bytes on every render — so a counter key misses 100% of the time on
    // exactly the surface this memo exists for (measured: ~1.3ms of parser rebuild handed straight
    // back). The geometry is what `buildMd` actually consumes, so it invalidates precisely when the
    // baked stamps would change and stays warm through a no-op re-registration. Resolving it costs
    // ~0.03ms and is not extra work on a miss: `buildMd` takes it as an argument.
    //
    // The store's other input, `isThemeKnown`, is a live closure evaluated during parse, so it
    // reads current state and needs no key coverage.
    // Found by the adversarial trio; regression-tested in test/unit/engine/parser-memo.test.js.
    const geom = themes.geometryFor(globalBase.theme || 'lattice', globalBase.size);
    const key = `${JSON.stringify(globalBase)}|${opts.math}|${opts.mathOutput}|${geom.width}x${geom.height}`;
    if (mdMemo && mdMemo.key === key) return mdMemo.md;
    mdMemo = { key, md: buildMd(globalBase, geom) };
    return mdMemo.md;
  }

  function renderHtml(body, globalBase, source, baseUrl, stats, page) {
    // Start this render's `<defs>` id space (lib/core/render-ids.js). The chart kernels mint
    // gradient ids from shared sequences whose purpose is uniqueness WITHIN a document; they
    // used to be module-level, i.e. process-scoped, which made render() non-deterministic
    // across calls — rendering one deck twice produced different bytes on 24 of 112 committed
    // decks. Byte-determinism is the precondition for any render cache's
    // `incremental === whole` guard, so it is fixed at the source rather than normalized away.
    // A single-render process (CLI, export) is byte-identical: its first render started at 1
    // and still does.
    //
    // The source goes in because predictable ids are squattable ids: raw HTML in the deck can
    // declare `<radialGradient id="pie-wedge-1">` on an earlier slide and SVG's first-def-wins rule
    // then repaints the real chart. `resetRenderIds` shifts the whole namespace behind a probed
    // prefix when — and only when — the source mentions a minting family, so ordinary decks keep
    // their exact bytes. See lib/core/render-ids.js.
    // `page?.offset` scopes the minted ids to the shown slide's ABSOLUTE deck position, so a slide
    // rendered alone emits the same ids as that slide inside its deck. Absent on every export and
    // CLI render (none supplies a position), where the offset is 0 and a whole-deck render numbers
    // its slides 1..N off its own sections — the case that was already right.
    resetRenderIds(source || body, page?.offset);
    // Opt-in per-stage timing (stats truthy → the perf overlay asked for it).
    // Every timing read is guarded by `stats`, so a normal render is unchanged.
    const tAll = stats ? performance.now() : 0;
    const md = memoizedMd(globalBase);
    // Lift `![bg]` to the lattice-bg split panel for image-class slides BEFORE
    // parsing, so the half-canvas split survives (the engine's basic-mode bg
    // ruler would otherwise collapse it to a full-bleed section background).
    // Class-aware + idempotent: a no-op for non-image `![bg]` and for the
    // emulator's pre-lifted markup.
    const tParse = stats ? performance.now() : 0;
    // An EXPORT-SETTINGS block belongs to whoever produced the deck we were handed,
    // not to this render — strip it before anything else sees it.
    //
    // This is the half the block's first cut missed. It fixed RE-EXPORT inheritance
    // (withRuntimeScripts rebuilds the trailer) but not RENDER inheritance, and the
    // block rides in the SOURCE TEXT: open a bundle's own `.md` — which its README
    // invites, and which "a deck a recipient sent back" describes — and every future
    // render of that text inherited the old export's level. Measured on a real
    // `--fluid` viewer built from an `off` bundle: the emulator printed
    // "⚠ OVERFLOW … is CLIPPED" and the artifact drew NOTHING, because a Marp export
    // nobody re-ran had said `off`. At the default it is just as wrong the other way
    // — a live preview silently downgrades from `author` to `reader` and loses the
    // Fix-Me overlays and the type-floor alarm.
    //
    // Same shape as `stripDebugAttrs` below: a marker from one context must not ride
    // into another. lib/core/export-settings.js.
    body = withoutExportSettingsBlock(body);
    body = bgImage.liftImageBgImages(body, baseUrl);
    // env.markdown carries the ORIGINAL source (front matter included) so the
    // front-matter readers — deckClassPropagate, applyDeckLogoToHtml — see it
    // even though the body we parse has the front matter stripped. Matches the
    // env marp-cli/marpit populate.
    // `page` rides the ENV, not the pipeline's install options: the markdown-it instance is
    // MEMOIZED across renders (memoizedMd), so anything baked into a plugin closure would be
    // served stale on a hit — a preview would keep printing the first slide's number for every
    // slide it later showed. The env is rebuilt per `md.render` call, so it is the only correct
    // home for per-render state.
    let html = md.render(body, { markdown: source, page });
    // Parse bucket = the source lift + the markdown-it pass (all 12 ruler plugins
    // + math + fence rendering run opaquely inside md.render).
    if (stats) stats.parseMs = performance.now() - tParse;
    // HTML-stage transforms — identical order to the engine's render path.
    // Form toggle runs FIRST so the registry's masthead-lift + the Tile
    // injectors below all see the resolved `form` class.
    html = applyFormToggleToHtml(html, source);
    // `baseUrl` lets the logo-marks transform resolve a mark's relative mask URL
    // against the asset base (web preview); other transforms ignore the ctx.
    const tTransforms = stats ? performance.now() : 0;
    html = applyAllToHtml(html, { baseUrl }, stats);
    if (stats) stats.transformsMs = performance.now() - tTransforms;
    html = metaTile.applyToHtml(html, source);
    // `deckSection` is the caller-supplied SECTION position ({ index, total }) of a document
    // holding only part of the deck — which divider-delimited section the shown slide sits in,
    // and how many the deck has. Both tiles derive that by walking every section, which is why a
    // preview showing ONE slide of a deck with dividers had to re-render the WHOLE deck on every
    // keystroke. Supplying it is the same trade the page number makes. Undefined on every
    // full-deck and export path, where the walk is correct and stays byte-identical.
    const deckSection = page?.deckSection;
    html = progressTile.applyToHtml(html, { deckSection });
    html = watermarkTile.applyToHtml(html, { deckSection });
    // Wrap image prose in .image-text + inject the scrim, per section (runs after
    // the tile injectors so it sees the resolved section structure).
    html = applyImageStructure(html);
    // Inject the `.backdrop` wrapper as the first child of every finish section
    // (matches on the `finish` class), and stamp the deck-wide `backdrop:` controls
    // inline (strength). MUST run AFTER applyImageStructure: wrapImageText folds
    // any non-header/bg/footer child into `.image-text`, which would bury a
    // `.backdrop` injected earlier and break `section.finish > .backdrop` on
    // image+finish slides. Backdrop-controls work (#669).
    html = applyBackdropToHtml(html, source);
    // The deck logo (`logo:`), LAST of the section-level chrome injectors, so it lands
    // as the section's FIRST child — the position the runtime's DOM mirror produces
    // (`insertBefore(img, section.firstChild)`), the one the docs and the parity test
    // state, and the one the marker-tab reserve was measured against. Running it before
    // `applyImageStructure` would fold the mark into `.image-text` on an image slide;
    // running it before `applyBackdropToHtml` would bury it under the finish wrapper.
    // (This call used to sit above `metaTile`, where it silently no-oped: it selected
    // slides by `data-lattice-slide`, which this engine never writes — #1652.)
    html = applyDeckLogoToHtml(html, source);
    // Resolve relative inline `<img>` srcs (a logo-wall mark, any prose image)
    // against the asset base — same as `![bg]` backgrounds. A no-op without a
    // baseUrl (the CLI/emulator path), so exported bytes are untouched; the web
    // preview passes the staged samples/ base so marks load in the srcdoc iframe.
    html = bgImage.resolveInlineImageSrcs(html, baseUrl);
    // Make every named chart graphic RELIABLY announced: reference each `role="img"`
    // svg's own <title>/<desc> by id. A bare child <title> is a correct name per spec
    // but the least reliable one in practice (VoiceOver/Safari and older JAWS drop it),
    // and `aria-labelledby` needs DOCUMENT-unique ids — which a per-slide kernel cannot
    // mint. Runs here, once, over the assembled document, so all three render paths
    // inherit it and the eight chart kernels stay ignorant of the id space.
    html = svgA11yNames.applyToHtml(html, page?.offset);
    // The overflow marker's berth — three empty, hidden, out-of-flow tabs per
    // slide, so no watcher has to create one (lib/core/fit-berth.js explains why
    // that matters). LAST, because the berth must be a DIRECT CHILD of the
    // section and every transform above moves slide content into cells: the Form
    // composition sweeps from the masthead band to the end of the slide into
    // `.cell-stage`, and `applyImageStructure` folds loose children into
    // `.image-text`. Anything berthed before those runs gets swallowed into the
    // box it is supposed to be reporting on.
    html = fitBerth.applyToHtml(html);
    // Assemble bucket = everything else in renderHtml (parser build, form toggle,
    // tile injectors, image structure, backdrop, src resolution) — the total minus
    // the two measured buckets above.
    if (stats) stats.assembleMs = performance.now() - tAll - stats.parseMs - stats.transformsMs;
    return html;
  }

  // Strip every `data-debug[="…"]` (incl. the bare-flag `data-debug=""`) plus its
  // leading whitespace, so an exported section tag is byte-identical to a deck that
  // never set `debug`. The outline CSS + label overlay live only in the previewers,
  // so removing the now-inert attribute is all that's needed to keep exports clean.
  function stripDebugAttrs(html) {
    return html.replace(/\s+data-debug(?:="[^"]*")?/g, '');
  }

  /**
   * render(markdown, theme) → { html, css, width, height }. `theme` (a
   * registered palette name) overrides the deck's own `theme:` directive,
   * matching the playground. `width`/`height` are the resolved `@size` geometry
   * in px (numbers): the browser hosts fit-scale and export against them, so a
   * `size: 4K` deck is scaled by its true 3840-wide box, not a hardcoded 1280
   * (the bug where 4K previews rendered 3× oversized + exported a cropped page).
   */
  function render(markdown, theme, opts) {
    // LINE ENDINGS: LF, normalized HERE because this is the engine's public door and callers
    // hand it raw source. `\r\n?` covers Windows CRLF and classic-Mac lone CR. It is a no-op on
    // LF, so no already-correct deck changes a byte — measured across all 119 committed example
    // decks. CRLF already rendered identically to LF (0 of 119 differed); a lone CR did NOT
    // (118 of 119 differed), so this closes a real gap rather than being belt-and-braces.
    // See test/unit/core/line-endings.test.js, which asserts the property against THIS entry
    // point with raw un-normalized fixtures.
    //
    // ONLY A STRING IS TOUCHED — every other input reaches the rest of this function exactly as
    // it did before, so this line changes nothing but line endings. A blanket
    // `String(markdown ?? '')` was tried and reverted: it turned a caller passing a Buffer, an
    // array, or an object from a LOUD `TypeError` into a silent render of `[object Object]` as a
    // slide. That is the exact failure shape this whole change exists to remove — a wrong render
    // instead of a crash — so widening it here to save a coercion would have been self-defeating.
    if (typeof markdown === 'string') markdown = markdown.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const { directives, body } = parseFrontMatter(markdown);
    const globalBase = { ...directives };
    // SANITIZE THE DECK-WIDE REGISTER AT THE DOOR. `globalBase.class` is what the
    // engine's native directive application joins onto every section
    // (lib/engine/slides.js `lattice_directives_apply`), so this is the earliest
    // point at which a token the register refuses can be kept off a slide — a
    // color-axis token superseded by `color-mode:`, or a component name, which
    // would claim every slide's layout. Filtering HERE is what lets every
    // propagation kernel downstream stay purely additive; see
    // lib/core/deck-class-register.js for the four regressions the subtract-
    // afterwards shape produced instead.
    if (globalBase.class) {
      const admitted = deckClassValue(globalBase.class, deckColorModeToken(frontMatterBody(markdown)));
      if (admitted) globalBase.class = admitted;
      else delete globalBase.class;
    }
    if (theme) globalBase.theme = theme;
    // Opt-in per-stage timing for the perf overlay. Undefined unless the caller
    // sets `opts.stats` (the docs overlay does so only while it's subscribed), so
    // the CLI / export / overlay-off paths run exactly as before.
    const stats = opts?.stats ? { transforms: {} } : undefined;
    // `opts.page` ({ offset, total }) is the caller-supplied DECK POSITION of a document that
    // holds only part of the deck. Set only by a surface that renders slides one at a time and
    // knows where the shown slide sits; absent everywhere else, including every export.
    let html = renderHtml(body, globalBase, markdown, opts?.baseUrl, stats, opts?.page);
    // `debug`/`_debug` is a PREVIEW-ONLY flag: the engine stamps `data-debug` on
    // each section so the previewers' debug-overlay agent can read it, but it must
    // never reach an exported artifact (no debug marker shipped in a boardroom deck).
    // render() is export-safe by default — only a preview caller (`{ preview: true }`,
    // set by lib/playground) keeps the attribute; every other caller (the emulator's
    // export/PDF path, the CLI) gets it stripped, so exported bytes are identical
    // whether the deck says `debug: on-hover` or not. See
    // engineering/decisions/2026-07-01-debug-bounding-boxes.md.
    if (!opts?.preview) html = stripDebugAttrs(html);
    const themeName = globalBase.theme || directives.theme || 'lattice';
    const sizeName = globalBase.size || directives.size;
    const tCss = stats ? performance.now() : 0;
    const css = themes.cssFor(themeName, sizeName);
    const { width, height } = themes.geometryFor(themeName, sizeName);
    if (stats) stats.cssMs = performance.now() - tCss;
    return stats ? { html, css, width, height, stats } : { html, css, width, height };
  }

  /**
   * geometry(markdown, theme) → { width, height } in px. The slide box without a
   * full render, for any host that has the markdown but needs to fit-scale
   * against the same `@size` the owned engine resolves without paying for a
   * full render.
   */
  function geometry(markdown, theme) {
    // LINE ENDINGS: the engine has TWO public doors, and both must agree. Normalizing only
    // `render()` made this one DIVERGE on a lone-CR deck — `geometry()` reported 1280x720 while
    // `render()` used 960x720 — where before the change the two agreed (wrongly, but agreed).
    // A host that fit-scales against a slide box the render does not use is the exact bug this
    // function's own docblock was written for. Same pattern, same reason as `render()`.
    if (typeof markdown === 'string') markdown = markdown.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const { directives } = parseFrontMatter(markdown);
    return themes.geometryFor(theme || directives.theme || 'lattice', directives.size);
  }

  /**
   * Register stylesheets. Each entry is either
   *
   *   { name, css }   the contract — identity is given, not searched for
   *   cssText         legacy — the name is recovered from the `@theme` directive
   *
   * Both shapes are accepted because `./engine` is a published export and
   * `window.LatticePlayground.addThemes` is documented public API, so an external
   * consumer passing bare CSS must keep working. In-repo callers pass the object
   * form — every one of them already holds the name — and `checkThemeIdentity`
   * (tools/check-ownership.js) keeps new ones honest. See
   * engineering/decisions/2026-08-16-theme-identity-ownership.md.
   */
  function addThemes(list) {
    for (const entry of list) {
      // A NAMED entry is one that actually carries the fields — not merely anything
      // `typeof 'object'`. A `Buffer` (`fs.readFileSync(p)` with the encoding
      // forgotten) and a boxed `String` are both objects, and dispatching on
      // `typeof` alone routed them to `add(undefined, undefined)`: they registered
      // under the old code (which coerced) and silently stopped under the new. That
      // is a regression on a published export, in the same silent-no-op class this
      // change exists to remove. Anything without the fields takes the legacy path,
      // which coerces as before.
      if (entry && typeof entry === 'object' && ('name' in entry || 'css' in entry)) {
        themes.add(entry.name, entry.css);
      } else {
        themes.add(typeof entry === 'string' ? entry : String(entry ?? ''));
      }
    }
  }

  function hasTheme(name) {
    return themes.has(name);
  }

  return { render, geometry, addThemes, hasTheme, themes, languages };
}

// Default singleton — mirrors the playground's module-level instance + the
// window global, so a browser bundle can expose the same API surface.
const engine = createEngine();
const api = {
  createEngine,
  render: engine.render,
  geometry: engine.geometry,
  addThemes: engine.addThemes,
  hasTheme: engine.hasTheme,
  // Shared across every engine instance — see the `languages` docblock.
  languages,
};
if (typeof window !== 'undefined') window.LatticeEngine = api;

module.exports = api;
module.exports.createEngine = createEngine;
