/**
 * The CLI export's deck stylesheet — the engine's FLAT sheet, shaped for a document whose
 * slides sit directly in `<body>`. ONE builder, shared by the writer (`lattice.js`)
 * and the one tool that re-themes a rendered export in place (`tools/palette-sweep.js`), so
 * the sheet a sweep swaps in is byte-for-byte the sheet the CLI would have written for that
 * palette (HARD RULE #1).
 *
 * WHY THE FLAT SHEET. Until step 4 of the one-style-delivery spine the CLI was the one host
 * whose CSS the engine did not produce: it inlined `layoutCSS + paletteCSS` UNPACKED, so a
 * `:root` token resolved once at the document root. Every other host ships the engine's
 * packed sheet, where `:root` also lands on each `section` and a derived token follows the
 * slide's own overrides. 50 of the pack's 199 `:root` declarations derive from a token some
 * `section` rule overrides, so the two shapes could disagree on any slide that overrides
 * one. Measured over all 277 committed decks, after the `--spectrum-bar` fix (#2366), the
 * one slide that differs is `print-mode`'s page number, and the packed sheet is the correct
 * one: print re-inks `--text-muted` on the slide and the number now follows it.
 * engineering/decisions/2026-09-24-one-style-delivery-spine.md §8.2.
 *
 * WHAT "SHAPED" MEANS, three steps, each the one another host already takes:
 *   1. `cssFor(theme, size, { flat: true })` — the pack plus every re-scoped arm as
 *      written, so the Read · Article copy of a chart outside any slide still paints.
 *   2. The `article.lattice > ` wrapper is unwrapped: the CLI document has no such
 *      wrapper. `unwrap` (`unwrap-flat-sheet.mjs`, shared with the Studio's players and
 *      `check:render`) keeps "a top-level slide" as a condition, so a `<section>` an author
 *      nests inside a slide is not styled as a slide.
 *   3. Faces the document supplies another way are dropped (`dropCoveredSheetFaces`):
 *      the engine's text faces ride the base64 block and KaTeX's its inlined sheet (on a
 *      math deck; `katexInlineSheet`), and the
 *      sheet's own copies carry relative urls that do not resolve beside the output.
 *
 * The layout sheet is ALWAYS registered as the base (`lattice`), including a caller's own
 * `--css` sheet. That is the CLI's contract — the sheet IS the layout engine — and it is
 * what `composeCss` inlines at each palette's `@import 'lattice'`. Registering it under the
 * name its `@theme` banner happens to carry would compose a palette-only sheet the moment a
 * custom layout named itself anything else.
 */

const fs = require('node:fs');
const path = require('node:path');
const { ThemeStore } = require('../engine/themes');
const { dropCoveredSheetFaces, emittedFamilies, scanFontFaceRules } = require('../fonts/face-css');

/** One unwrap for every flat host — lib/export/unwrap-flat-sheet.mjs says why it is not a strip. */
const { unwrapFlatSheet: unwrap } = require('./unwrap-flat-sheet.mjs');

/** The base's name — every palette's `@import 'lattice'` resolves against it. */
const BASE = 'lattice';

/**
 * A ThemeStore holding the layout sheet as the base and each palette by name.
 *
 * @param {string} layoutCss                         the layout sheet, imports already flattened
 * @param {{ name: string, css: string }[]} palettes  every palette any sheet will be built for
 */
function cliThemeStore(layoutCss, palettes) {
  const store = new ThemeStore();
  store.add(BASE, layoutCss);
  for (const p of palettes) store.add(p.name, rootsOnBase(p.css));
  return store;
}

const THEME_IMPORT_RE = /@import\s*(['"])[A-Za-z0-9_-]+\1/;
const COMMENT_RE = /\/\*[\s\S]*?\*\//g;

/**
 * A palette that imports NO theme is the root of its chain, and the CLI's contract is that
 * the layout sheet sits under every chain. `composeCss` inlines the base only at a
 * palette's own `@import 'lattice'`, and the unpacked CLI concatenated the layout sheet
 * unconditionally, so an installed package that omits the import (the package gate allows
 * it) exported with no engine CSS at all: 12 KB of scaffold in place of 2.2 MB, h1 in Times.
 * A root without the import gets it here. A palette that imports its parent is left alone,
 * because the parent's own import already brings the base.
 */
function rootsOnBase(css) {
  return THEME_IMPORT_RE.test(css.replace(COMMENT_RE, '')) ? css : `@import '${BASE}';\n${css}`;
}

/**
 * The CLI deck sheet for one palette.
 *
 * @param {ThemeStore} store
 * @param {object} o
 * @param {string} o.theme         the palette leaf (its chain must already be in `store`)
 * @param {string} [o.sizeName]    the deck's `size:` directive (undefined → the default box)
 * @param {string[]} [o.covered]   font families this document supplies another way
 * @param {boolean} [o.validate]   second-opinion each dropped span with css-tree
 * @param {string[]|null} [o.panes] the classes the deck's panes carry (lib/core/pane-css.js
 *                                 `paneClasses`); the engine composes their pane twins BEFORE it
 *                                 packs, so they come out in the same flat shape as every rule
 * @param {string[]|null} [o.paneComponents] each pane's component (`paneComponents`), so a theme
 *                                 rule keyed to a component the engine does not ship is twinned
 * @returns {{ css: string, dropped: number, refused: number }}
 */
function cliDeckSheet(store, { theme, sizeName, covered = [], validate = true, panes = null, paneComponents = null }) {
  // `cssFor` answers an unknown theme with '' — right for a live host, and for an export a
  // deck with no stylesheet at all. Refuse instead of shipping one.
  if (!store.has(theme)) throw new Error(`cliDeckSheet: theme "${theme}" is not registered`);
  const flat = unwrap(store.cssFor(theme, sizeName, { flat: true, panes, paneComponents }));
  return dropCoveredSheetFaces(flat, { covered, validate });
}

/**
 * The families KaTeX's stylesheet declares, read from its bytes rather than a hardcoded list
 * that would rot the first time KaTeX added a face. GUARDED: a missing or unreadable sheet
 * yields [], which is safe — the deck sheet's KaTeX faces then stay in place, inert.
 *
 * @param {string|undefined} katexCssPath  the math plugin's copy of `katex.min.css` (payload-path.js `vendorPath`), if any
 */
function katexFamilies(katexCssPath) {
  if (!katexCssPath) return [];
  try {
    return [...new Set(scanFontFaceRules(fs.readFileSync(katexCssPath, 'utf8')).map((r) => r.family).filter(Boolean))];
  } catch (_e) { return []; }
}

/**
 * KaTeX's stylesheet, SELF-CONTAINED: every `@font-face` src collapsed to its woff2 entry and
 * that font inlined as a `data:` URI, read from the installed package. The CLI document used to
 * LINK the sheet by its absolute `file://` path on the exporting machine; the PDF is captured
 * there, so it was right, but an `--html`, `--fluid` or `--read` export opened anywhere else
 * refused the link and lost all 20 KaTeX faces — the math fell back to Times, with a small
 * integral and bare delimiters (measured, followups.d/2439). Inlined, the page carries its own.
 *
 * Only a deck that renders math pays for it (~350 KB of base64; the caller decides). GUARDED like
 * `katexFamilies`: an unreadable sheet yields '', a face whose woff2 cannot be read keeps its
 * relative url (inert, as before), and the result is memoized per path.
 *
 * @param {string|undefined} katexCssPath  the math plugin's copy of `katex.min.css` (payload-path.js `vendorPath`), if any
 * @returns {string} the sheet text, or '' — the caller wraps it in `sanitizeStyleText` (#22)
 */
const katexInlineMemo = new Map();
function katexInlineSheet(katexCssPath) {
  if (!katexCssPath) return '';
  if (katexInlineMemo.has(katexCssPath)) return katexInlineMemo.get(katexCssPath);
  let out = '';
  try {
    const dir = path.dirname(katexCssPath);
    out = fs.readFileSync(katexCssPath, 'utf8').replace(
      /src:url\(\s*(['"]?)fonts\/([^)'"]+\.woff2)\1\s*\)\s*format\((['"]?)woff2\3\)[^;}]*/g,
      (whole, _q, file) => {
        // A bare file name only: the sheet is a package file, but this is a read off disk driven
        // by its text, so nothing that climbs out of `fonts/` is followed.
        if (!/^[\w.-]+\.woff2$/.test(file)) return whole;
        try {
          return `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, 'fonts', file)).toString('base64')}) format('woff2')`;
        } catch (_e) { return whole; }
      },
    );
  } catch (_e) { out = ''; }
  katexInlineMemo.set(katexCssPath, out);
  return out;
}

/**
 * Every family the CLI document supplies without the deck sheet: the engine's text faces
 * (the base64 block — `emittedFamilies` applies the same on-disk test that block does) and
 * KaTeX's (its inlined sheet, `katexInlineSheet`, on a deck that renders math).
 */
function coveredFamilies(pkgRoot, katexCssPath) {
  return [...emittedFamilies(pkgRoot), ...katexFamilies(katexCssPath)];
}

/**
 * The bytes a deck sheet composes from for the default layout sheet (`kind: 'layout'`) or a
 * shipped palette (`kind: 'palette'`, `name`): the minified build the docs site serves the Studio,
 * `dist/lattice-min.css` / `dist/themes/<name>-min.css`. The engine packs the same rules from either
 * spelling, so a host that read the sources and a host that read the builds exported two different
 * sheets (decisions/2026-10-16-player-as-library-audit.md §11.9); every composer of a deck sheet
 * reads these. `tools/minify-css.js` is lossless and `css:build --check` keeps them current.
 * Null when the build is absent, and the caller falls back to the source it read before.
 *
 * @param {string} pkgRoot
 * @param {'layout'|'palette'} kind
 * @param {string} [name]  the palette, for `kind: 'palette'`
 */
function shippedSheetText(pkgRoot, kind, name) {
  const file = kind === 'layout' ? path.join(pkgRoot, 'dist', 'lattice-min.css') : path.join(pkgRoot, 'dist', 'themes', `${name}-min.css`);
  try { return fs.readFileSync(file, 'utf8'); } catch (_e) { return null; }
}

// The deck's own CSS packing moved to ./author-css.js, which reads no files, so the Studio's export
// bundle carries the same code; re-exported here for the callers that import it from this module.
const { packAuthorCss, packInlineStyles } = require('./author-css');

module.exports = { cliThemeStore, cliDeckSheet, shippedSheetText, packAuthorCss, packInlineStyles, katexFamilies, katexInlineSheet, coveredFamilies };
