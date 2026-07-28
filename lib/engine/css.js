/**
 * lattice-engine — CSS emitter.
 *
 * Produces the per-render stylesheet the engine hands back as `render().css`:
 * a clean, marp-baggage-free scaffold + the resolved theme. This is the P1.1
 * deliverable from engineering/decisions/2026-06-10-marp-replacement-proposal.md
 * — it REVERSE-ENGINEERS Marpit's CSS contract rather than reproducing its
 * output. We emit only the rules that are load-bearing for a fixed-page PDF and
 * we emit them CORRECTLY, so themes compose onto the scaffold without the
 * `!important` override layer marp-core's foreign defaults forced
 * (lib/integrations/markdown-it/scaffold.css). Every kept rule documents why it
 * stays; the marp-only baggage (twemoji img sizing, `marp-h1` auto-scaling,
 * the `article.lattice > section` selector prefixing + `:where()` specificity
 * zeroing, the `video::-webkit-media-controls` web hack, `scroll-snap-align`)
 * is deliberately absent.
 *
 * Marpit reference (mirrored, not vendored):
 *   @marp-team/marpit/lib/theme/scaffold.js  → the section box + pagination
 *   @marp-team/marpit/lib/postcss/printable.js → @page + @media print
 *   @marp-team/marpit/lib/theme_set.js (pack) → @import + @size resolution
 */



// The shared family→orientation classifier (lib/adaptive/families.js) — the one
// source data-orientation (here, server-side) and data-family (the runtime) both
// derive from, so they can't disagree at the 0.9–0.95 seam. See M1 in
// 2026-06-21-reflow-as-form-capability.md.
const { orientationFor: deckOrientation } = require('../adaptive/families');

// `@size <name> <width> <height>` lives inside the `/* @theme … */` comment
// block (Marpit parses it from there). hd is Lattice's default geometry.
const SIZE_RE = /@size\s+([A-Za-z0-9:_-]+)\s+(\S+)\s+(\S+)/g;
const DEFAULT_SIZE = { width: '1280px', height: '720px' };

// `@import 'lattice'` / `@import "lattice"` — the theme-name import every
// palette uses to pull in the base contract. Matched specifically so real
// `@import url(…)` font imports (e.g. the Noto Color Emoji webfont in
// lattice.css) are left untouched and hoisted separately.
//
// `\s*` (not `\s+`): a CSS minifier drops the space after `@import`, so the
// playground/export themes ship the import as `@import"lattice"`. Requiring
// whitespace silently failed to inline the base, collapsing every palette to
// scaffold-only CSS (unstyled slides in the playground / Drawing Board).
const THEME_IMPORT_RE = /@import\s*(['"])lattice\1\s*;?/g;

// Real remote imports we must keep at the top of the emitted sheet — CSS
// ignores `@import` that isn't before all other rules, so inlining the base
// theme (which carries its own font @import) requires re-hoisting these.
// `\s*` for the same minified-`@import` reason as THEME_IMPORT_RE above.
const URL_IMPORT_RE = /@import\s*(?:url\([^)]*\)|(['"])(?!lattice\1)[^'"]*\1)[^;]*;/g;

/**
 * Parse every `@size` declaration out of a stylesheet's `@theme` comment.
 * Returns a Map name → { width, height }.
 */
function parseSizes(cssText) {
  const sizes = new Map();
  if (!cssText) return sizes;
  SIZE_RE.lastIndex = 0;
  let m;
  while ((m = SIZE_RE.exec(cssText))) {
    sizes.set(m[1], { width: m[2], height: m[3] });
  }
  return sizes;
}

/**
 * Resolve the page geometry for a render: the `size:` directive's named
 * `@size`, else hd, else the 1280×720 default. `sources` is the list of
 * stylesheets to search (theme first, then base).
 */
function resolveSize(sizeName, sources) {
  const wanted = sizeName || 'hd';
  for (const css of sources) {
    const sizes = parseSizes(css);
    if (sizes.has(wanted)) return sizes.get(wanted);
  }
  // hd not declared anywhere → first declared size, else the hard default.
  for (const css of sources) {
    const sizes = parseSizes(css);
    const first = sizes.values().next();
    if (!first.done) return first.value;
  }
  return DEFAULT_SIZE;
}

/**
 * The engine-owned scaffold. Reverse-engineered from Marpit's, stripped to
 * load-bearing rules, emitted correctly. `width`/`height` come from `@size`.
 */
function scaffold({ width, height }) {
  return `/* lattice-engine scaffold — owned section chrome (no marp-core baggage). */

/* Slide box. @size drives the geometry; box-sizing / overflow / position are
   the fixed-page contract every layout assumes. container-type:size makes the
   section a query container so lattice.css's cqi units resolve against the
   slide (pagination at bottom:1.875cqi, watermarks, etc.).
   Scoped to \`article.lattice > section\` for geometry specificity (0,1,2): a bare
   \`section\` (0,0,1) loses the @size to the preview frame's
   \`.lattice > section { width:… }\` sizing rule (the Drawing Board / parity
   harness), collapsing the slide. The scoping is load-bearing here, not the
   marp-core baggage the rest of the scaffold drops. */
article.lattice > section {
  width: ${width};
  height: ${height};
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
  container-type: size;
}

/* Pagination pseudo-element. Marpit had this pseudo inherit the section's
   bottom padding, which misplaced the page number — the sole reason
   scaffold.css needed !important. We zero the padding so the theme
   positions it cleanly; pointer-events:none keeps it non-interactive. */
article.lattice > section::after {
  content: attr(data-lattice-pagination);
  position: absolute;
  padding: 0;
  pointer-events: none;
}

/* No pagination attribute on the slide → no number rendered. */
article.lattice > section:not([data-lattice-pagination])::after {
  display: none;
}

/* PDF page geometry + print fidelity. @page sizes the sheet to the slide and
   zeroes margins. The print block forces one slide per page and exact colour
   reproduction (headless Chromium otherwise re-quantizes backgrounds in print,
   washing out palette fills). */
@page {
  size: ${width} ${height};
  margin: 0;
}

@media print {
  html,
  body {
    margin: 0;
  }

  article.lattice > section {
    page-break-before: always;
    break-before: page;
  }

  article.lattice > section,
  article.lattice > section * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}`;
}

/**
 * Hoist real `@import url(…)`/quoted-url imports to the top of `css` so they
 * survive the spec rule that `@import` must precede all other rules. Order
 * among them is preserved; duplicates are collapsed.
 */
function hoistImports(css) {
  const seen = new Set();
  const hoisted = [];
  const body = css.replace(URL_IMPORT_RE, (stmt) => {
    const key = stmt.trim();
    if (!seen.has(key)) {
      seen.add(key);
      hoisted.push(key);
    }
    return '';
  });
  if (hoisted.length === 0) return css;
  return `${hoisted.join('\n')}\n${body}`;
}

/**
 * Strip CSS block comments. Run only AFTER `@size`/`@theme` parsing (which read
 * the `@theme` comment) — for the rule body, leftover comments would (a) let an
 * `@import 'lattice'` that a theme mentions in PROSE double-inline the base and
 * (b) feed the `:root` selector rewrite false matches.
 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// ── Marpit theme-pack, mirrored ────────────────────────────────────────────
// The clean P1.1 emitter approximated Marpit's pack with a single flat-regex
// `:root → :where(section)` rewrite and DROPPED the rest of the pipeline as
// "baggage". Two of the dropped steps are load-bearing in ways invisible to the
// headless-Chromium gates (they only surface on mobile WebKit), so we now mirror
// Marpit's actual per-selector pipeline (theme_set.js pack order) faithfully:
//
//   1. rootReplace            `:root` → `section:lattice-root`     (postcss/root/replace.js)
//   2. prepend                scope each selector under the slide (postcss/pseudo_selector/prepend.js)
//   3. pseudoSelectorReplace  `:lattice-container`→`article.lattice`,
//                             `:lattice-slide`→`section`           (postcss/pseudo_selector/replace.js)
//   4. increasingSpecificity  `section:lattice-root` →
//                             `:where(section):not([\20 root])`   (postcss/root/increasing_specificity.js)
//
// Step 4's `:not([\20 root])` guard (an attribute that can never match — HTML
// forbids U+0020 SPACE in attribute names) restores the (0,1,0) specificity the
// `:root` pseudo-class carried, so lattice.css's real cqi tokens (declared on
// `:root`) still WIN over its `:where(:root)` fallbacks. The old bare
// `:where(section)` (0,0,0) tied them on source order — the "collapsed cqi on
// mobile WebKit" half of the shelving bug. Step 2 scopes `body { counter-reset }`
// to the dead `article.lattice > section body`, so the divider/closing counters fall
// back to the *implicit* root reset exactly as marp does — the "dropped counters"
// half. (Marpit auto-scaling / font_size / rem are still skipped: unused here.)

// Split a selector LIST on top-level commas only (commas inside ()/[] are kept).
function splitSelectorList(list) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

// Apply Marpit's 4-step pipeline to a single selector. Order matters: rootReplace
// plants the `:lattice-root` marker BEFORE prepend (so a `:root`-derived selector
// is treated as section-leading), and increasingSpecificity resolves the marker
// LAST (after the pseudo elements are concrete).
// A LEADING `:is(a, b, …)` forgiving list must be DISTRIBUTED before scoping, so
// each arm scopes by its OWN leftmost combinator: a `section.x` arm IS the slide
// (→ `article.lattice > section.x`), a `figure.y` arm is a slide DESCENDANT (→
// `article.lattice > section figure.y`). Marpit's prepend (step 2 below) only treats a
// LITERAL leading `section` as slide-targeting, so `:is(section.map, figure.chart-frame)
// .map-region` was scoped as a slide *descendant* (`article.lattice > section :is(section.map,
// …)`) — which can never match the map slide (`section.map` IS the slide, not inside it).
// The rule then never applies, `--map-base` is never defined, and every map/quadrant/radar
// fill that reads it falls to SVG's black initial value. This `:is(section.<comp>,
// figure.chart-frame)` shape is the Read·Article re-host broadening, unique to Lattice's
// chart CSS (a Marpit deck never writes it), so Marpit's port didn't cover it. Distributing
// is specificity-safe here: both arms are (0,1,1). Only a LEADING `:is()` needs this — a
// mid-selector `:is()` is already a descendant and scopes correctly.
function leadingIsArms(sel) {
  if (!sel.startsWith(':is(')) return null;
  let depth = 0;
  let i = 3; // the '(' of ':is('
  for (; i < sel.length; i++) {
    if (sel[i] === '(') depth++;
    else if (sel[i] === ')' && --depth === 0) break;
  }
  if (depth !== 0) return null; // unbalanced — leave untouched
  return { arms: splitSelectorList(sel.slice(4, i)), rest: sel.slice(i + 1) };
}

function packSelector(rawSelector) {
  const ws = rawSelector.match(/^\s*/)[0]; // preserve leading whitespace for tidy output
  let sel = rawSelector.trim();
  // 0. Distribute a leading `:is(…)` so each arm scopes by its own combinator.
  const li = leadingIsArms(sel);
  if (li) return ws + li.arms.map((arm) => packSelector(arm.trim() + li.rest).trim()).join(', ');
  // 1. rootReplace — Marpit's exact regex + `:lattice-root` pseudoClass marker.
  sel = sel.replace(/(^|[\s>+~(])(?:section)?:root\b/g, (_m, lead) => `${lead}section:lattice-root`);
  // 2. prepend — Marpit's pseudoSelectorPrepend, verbatim branches.
  if (/^section(?![\w-])/.test(sel)) sel = `:lattice-container > :lattice-slide${sel.slice(7)}`;
  else if (!sel.startsWith(':lattice-container')) sel = `:lattice-container > :lattice-slide ${sel}`;
  // 3. pseudoSelectorReplace — concrete container (`article.lattice`) + slide (`section`).
  sel = sel.replace(/:lattice-container(?![\w-])/g, 'article.lattice').replace(/:lattice-slide(?![\w-])/g, 'section');
  // 4. increasingSpecificity — restore `:root`'s (0,1,0) via the never-matching guard.
  sel = sel.replace(/\b(?:section)?:lattice-root\b/g, ':where(section):not([\\20 root])');
  return ws + sel;
}

// Mirror Marpit's pagination plugin (postcss/pagination.js): on a slide-own
// `section…::after`, every `content` declaration that ISN'T the pagination
// attribute is commented out, so a theme's `::after { content: … }` can't clobber
// the page number Marpit injects via `attr(data-lattice-pagination)`. Matched
// PRE-prepend (selectors are still `section…`), exactly like Marpit. This is why
// marp renders no `counter(lat-divider)` text on numbered dividers and `silent`'s
// `content: none` is inert — the engine must agree or it diverges from baseline.
const PAGINATION_AFTER_RE = /^section(?![\w-])[^\s>+~]*::?after$/;
function isPaginationTarget(selectorPart) {
  return splitSelectorList(selectorPart).some((s) => PAGINATION_AFTER_RE.test(s.replace(/\[.*?\]/g, '').trim()));
}
function maskNonPaginationContent(block) {
  return block.replace(/content\s*:\s*([^;}]*)(;?)/gi, (m, value) =>
    /attr\(\s*data-lattice-pagination/.test(value) ? m : `/* content: ${value.trim()}; */`
  );
}

// Walk every STYLE rule's selector list and pack it, leaving `@keyframes` frames
// (percentage/from/to selectors) and at-rule preludes untouched — exactly the
// rules Marpit's `walkRules` + the keyframes guard cover. A `paginationTarget`
// stack (one flag per open brace) carries the pre-prepend `section…::after` match
// down to the declaration block, where the content mask runs. Brace-depth tracking
// is enough for the flat (non-CSS-nested) theme sheets we emit.
function packTheme(css) {
  let out = '';
  let keyframeDepth = -1; // brace depth at which an open @keyframes lives, else -1
  let seg = 0; // start index of the current prelude / declaration run
  const paginationStack = [];
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      // A prelude may carry leading `;`-terminated statements (e.g. a hoisted
      // `@import url(…);`) ahead of the real selector — emit those verbatim and
      // pack only the trailing selector list.
      const prelude = css.slice(seg, i);
      const semi = prelude.lastIndexOf(';');
      const lead = semi >= 0 ? prelude.slice(0, semi + 1) : '';
      const selectorPart = semi >= 0 ? prelude.slice(semi + 1) : prelude;
      const trimmed = selectorPart.trim();
      let paginationTarget = false;
      out += lead;
      if (trimmed.startsWith('@')) {
        out += selectorPart;
        if (keyframeDepth < 0 && /^@(?:-\w+-)?keyframes\b/.test(trimmed)) keyframeDepth = paginationStack.length;
      } else if (keyframeDepth >= 0) {
        out += selectorPart; // inside @keyframes — frame selectors are not theme selectors
      } else {
        paginationTarget = isPaginationTarget(selectorPart);
        out += splitSelectorList(selectorPart).map(packSelector).join(',');
      }
      paginationStack.push(paginationTarget);
      out += '{';
      seg = i + 1;
    } else if (ch === '}') {
      const block = css.slice(seg, i); // declarations or whitespace between rules
      out += paginationStack.pop() ? maskNonPaginationContent(block) : block;
      out += '}';
      if (keyframeDepth >= 0 && paginationStack.length === keyframeDepth) keyframeDepth = -1;
      seg = i + 1;
    }
  }
  return out + css.slice(seg);
}

/**
 * Compose the per-render stylesheet.
 *
 *   themeCss        the selected palette's stylesheet (carries `@import
 *                   'lattice'` + token overrides)
 *   baseLatticeCss  the registered `lattice` base theme (dist/lattice.css)
 *   sizeName        the deck's `size:` directive value, if any
 *
 * Output order = cascade order: scaffold first (so the theme overrides it at
 * equal specificity), then the theme with `@import 'lattice'` inlined and run
 * through the mirrored Marpit pack (`:root` relocation + slide scoping).
 */
function composeCss({ themeCss = '', baseLatticeCss = '', sizeName } = {}) {
  // `@size`/`@theme` live in comments — resolve geometry BEFORE stripping them.
  const geometry = resolveSize(sizeName, [themeCss, baseLatticeCss]);
  const base = stripComments(baseLatticeCss);
  // Inline the base ONCE (comment-stripped, so a prose `@import 'lattice'` can't
  // trigger a second inline), then pack it the way Marpit does.
  const resolvedTheme = packTheme(stripComments(themeCss).replace(THEME_IMPORT_RE, () => base));
  // Orientation CSS LAST so its deck-wide `section { --canvas-scale; … }` wins
  // source-order over the base token defaults (it carries no extra specificity).
  const sheet = `${scaffold(geometry)}\n\n${resolvedTheme}\n\n${orientationCss(geometry)}`;
  return hoistImports(sheet);
}

/**
 * Orientation model for a resolved `@size` geometry — the SHARED source of truth
 * for the three render paths (the engine scaffold below, the emulator's PDF
 * template, and lib/runtime's preview). All three derive orientation from the
 * SAME width/height so a `size: story` deck looks identical everywhere.
 *
 * Returns `{ name, scale }`:
 *   - name  'landscape' (aspect > 1.05) · 'square' (0.95–1.05) · 'portrait' (< 0.95)
 *   - scale the `--canvas-scale` magnitude multiplier folded into every --fs-
 *           and --sp- token (base.tokens.css). Landscape is exactly 1, so the
 *           landscape render is byte-identical. Portrait/square boost type +
 *           spacing so the deck reads at phone distance and fills the taller
 *           frame; the boost composes multiplicatively with the author's
 *           --fs-scale (scale-l/xl).
 *
 * Portrait scale RAMPS with how tall the canvas is — `1.2 + (1 - aspect) * 0.75`,
 * capped at 2.4 — so 4:5 (≈1.95) reads large while 9:16 (≈2.19) and the very tall
 * 9:19.5 mobile (≈2.29) push type bigger still to fill the frame instead of
 * floating in a thin centred band. (These are deliberately punchy: social/mobile
 * is viewed on a phone at arm's length, and the decks carry little text per
 * slide.) Square is a flat 1.65. Tuned up over review rounds against the social
 * demo decks (engineering/decisions/2026-06-16-social-mobile-portrait-sizes.md).
 */
function orientationFor({ width, height }) {
  const w = parseFloat(width);
  const h = parseFloat(height);
  const aspect = Number.isFinite(w) && Number.isFinite(h) && h > 0 ? w / h : 16 / 9;
  // Name derived from the shared family classifier (lib/adaptive/families.js) so
  // data-orientation and data-family share ONE boundary set (square = 0.9–1.05).
  // The `scale` ramp is unchanged. See 2026-06-21-reflow-as-form-capability.md (M1).
  const name = deckOrientation(aspect);
  if (name === 'landscape') return { name, scale: 1 };
  if (name === 'square') return { name, scale: 1.65 };
  const scale = Math.min(2.4, Math.round((1.75 + (1 - aspect) * 1.0) * 100) / 100);
  return { name, scale };
}

/**
 * The deck-wide orientation CSS for a geometry. Empty for landscape (zero
 * footprint, byte-identical render). For portrait/square it sets the
 * `--canvas-scale` token deck-wide and vertically centres the DEFAULT
 * flex-column section so title/statement/prose/list/agenda/quote layouts fill
 * the frame instead of clinging to the top. Specificity is a bare `section`
 * (0,0,1): a component layout that sets its own `justify-content`
 * (`section.kpi`, `section.split`, …) is (0,1,1) and still wins — so this only
 * reflows the layouts that were relying on the default. */
function orientationCss(geometry) {
  const { name, scale } = orientationFor(geometry);
  if (name === 'landscape') return '';
  // Safe-area bands (px, from the geometry) for the opt-in `safe` modifier — the
  // top profile row and the bottom caption + action rail that vertical-video
  // feeds overlay on a vertical post. Emitted deck-wide as tokens; only the `.safe`
  // class consumes them, so this stays zero-cost for non-safe decks. Proportional
  // to HEIGHT (the section is an inline-size container, so cqh can't express it).
  const h = parseFloat(geometry.height);
  const safe = Number.isFinite(h)
    ? ` --safe-top: ${Math.round(h * 0.12)}px; --safe-bottom: ${Math.round(h * 0.2)}px;`
    : '';
  // The per-geometry "design params" block (the agreed model: this is the ONE
  // place sizes are enumerated; the orientation-bucket CSS consumes these). Beyond
  // the global type magnitude (--canvas-scale), portrait/square want the HERO
  // elements punchier than a uniform bump — `--stat-emphasis` multiplies the
  // stat/kpi number on top of --canvas-scale so a stats slide commands the frame.
  const statEmphasis = name === 'square' ? 1.3 : 1.45;
  return `/* lattice-engine — ${name} orientation (social/mobile @size) */
section { --canvas-scale: ${scale}; --stat-emphasis: ${statEmphasis}; justify-content: center;${safe} }`;
}

module.exports = { composeCss, scaffold, parseSizes, resolveSize, hoistImports, packTheme, orientationFor, orientationCss };
