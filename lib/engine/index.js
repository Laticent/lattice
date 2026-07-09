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
const { installSlidePipeline } = require('./slides');
const { installBackgroundImage } = require('./background-image');
const { installMath } = require('./math');
const { ThemeStore } = require('./themes');
const { orientationFor } = require('./css');
const { parseFrontMatter } = require('./directives');
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
  glossaryListToTable,
  glossaryRange,
  functionPlotFences,
  obligationMatrixBadges,
  registerMermaidHljs,
  slotLabelLift,
  stripHeadingPeriods,
  verdictGridBadges,
} = require('../integrations/markdown-it/plugins');
const { applyAllToHtml } = require('../transformers/registry');
const bgImage = require('../core/bg-image');
const imageScrim = require('../transformers/image-scrim');

// Build the image component's split DOM (the lattice-bg panel + .image-text wrap
// + scrim) on the ENGINE path, so the playground/runtime render `image` like the
// emulator's PDF path (the deferred P1.1 split). Idempotent — wrapImageText and
// the scrim both check for their own output — so it no-ops on the emulator's
// pre-lifted markup. See engineering/decisions/2026-06-17-image-rearchitecture.md.
function applyImageStructure(html) {
  return html.replace(/<section\b[^>]*>[\s\S]*?<\/section>/g, (sec) => {
    let s = bgImage.wrapImageText(sec);
    const cls = (s.match(/<section\b[^>]*\bclass="([^"]*)"/) || ['', ''])[1];
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
  verdictGridBadges,
  obligationMatrixBadges,
  checklistItemStates,
  slotLabelLift,
  glossaryListToTable,
  glossaryRange,
  stripHeadingPeriods,
  addHeadingPeriods,
  functionPlotFences,
];

/**
 * Build a fresh engine. Each engine owns its markdown-it instance and a
 * ThemeStore. `globalBase` is reserved for front-matter directives, which
 * render() supplies per call (see below) — the instance is rebuilt per render
 * so front-matter globals seed the pipeline correctly, matching marp-core's
 * per-render directive resolution.
 */
function createEngine(opts = {}) {
  const themes = new ThemeStore();

  function buildMd(globalBase) {
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
    // Mermaid grammar via `md.highlightjs`, matching marp's ```mermaid colouring.
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
    const geom = themes.geometryFor(globalBase.theme || 'lattice', globalBase.size);
    const orientation = orientationFor(geom).name;
    installSlidePipeline(md, globalBase, {
      isThemeKnown: (name) => themes.has(name),
      orientation,
    });
    installBackgroundImage(md);
    if (opts.math !== false) installMath(md, { output: opts.mathOutput });
    registerMermaidHljs(md);
    for (const plugin of LATTICE_PLUGINS) md.use(plugin);
    return md;
  }

  function renderHtml(body, globalBase, source, baseUrl) {
    const md = buildMd(globalBase);
    // Lift `![bg]` to the lattice-bg split panel for image-class slides BEFORE
    // parsing, so the half-canvas split survives (the engine's basic-mode bg
    // ruler would otherwise collapse it to a full-bleed section background).
    // Class-aware + idempotent: a no-op for non-image `![bg]` and for the
    // emulator's pre-lifted markup.
    body = bgImage.liftImageBgImages(body, baseUrl);
    // env.markdown carries the ORIGINAL source (front matter included) so the
    // front-matter readers — deckClassPropagate, applyDeckLogoToHtml — see it
    // even though the body we parse has the front matter stripped. Matches the
    // env marp-cli/marpit populate.
    let html = md.render(body, { markdown: source });
    // HTML-stage transforms — identical order to the engine's render path.
    // Form toggle runs FIRST so the registry's masthead-lift + the Tile
    // injectors below all see the resolved `form` class.
    html = applyFormToggleToHtml(html, source);
    // `baseUrl` lets the logo-marks transform resolve a mark's relative mask URL
    // against the asset base (web preview); other transforms ignore the ctx.
    html = applyAllToHtml(html, { baseUrl });
    // deck-logo keys off `data-lattice-slide`, which lib/engine omits — so this
    // no-ops here and the emulator re-runs it after stamping the attribute. The
    // Form Tile injectors below match on section class, not the slide attribute,
    // so they resolve correctly at this stage.
    html = applyDeckLogoToHtml(html, source);
    html = metaTile.applyToHtml(html, source);
    html = progressTile.applyToHtml(html);
    html = watermarkTile.applyToHtml(html);
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
    // Resolve relative inline `<img>` srcs (a logo-wall mark, any prose image)
    // against the asset base — same as `![bg]` backgrounds. A no-op without a
    // baseUrl (the CLI/emulator path), so exported bytes are untouched; the web
    // preview passes the staged samples/ base so marks load in the srcdoc iframe.
    html = bgImage.resolveInlineImageSrcs(html, baseUrl);
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
    const { directives, body } = parseFrontMatter(markdown);
    const globalBase = { ...directives };
    if (theme) globalBase.theme = theme;
    let html = renderHtml(body, globalBase, markdown, opts?.baseUrl);
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
    const css = themes.cssFor(themeName, sizeName);
    const { width, height } = themes.geometryFor(themeName, sizeName);
    return { html, css, width, height };
  }

  /**
   * geometry(markdown, theme) → { width, height } in px. The slide box without a
   * full render, for any host that has the markdown but needs to fit-scale
   * against the same `@size` the owned engine resolves without paying for a
   * full render.
   */
  function geometry(markdown, theme) {
    const { directives } = parseFrontMatter(markdown);
    return themes.geometryFor(theme || directives.theme || 'lattice', directives.size);
  }

  function addThemes(cssTextList) {
    for (const css of cssTextList) themes.add(css);
  }

  function hasTheme(name) {
    return themes.has(name);
  }

  return { render, geometry, addThemes, hasTheme, themes };
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
};
if (typeof window !== 'undefined') window.LatticeEngine = api;

module.exports = api;
module.exports.createEngine = createEngine;
