/**
 * The CLI export's deck stylesheet — the engine's FLAT sheet, shaped for a document whose
 * slides sit directly in `<body>`. ONE builder, shared by the writer (`lattice-emulator.js`)
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
 *      the engine's text faces ride the base64 block and KaTeX's the `<link>`, and the
 *      sheet's own copies carry relative urls that do not resolve beside the output.
 *
 * The layout sheet is ALWAYS registered as the base (`lattice`), including a caller's own
 * `--css` sheet. That is the CLI's contract — the sheet IS the layout engine — and it is
 * what `composeCss` inlines at each palette's `@import 'lattice'`. Registering it under the
 * name its `@theme` banner happens to carry would compose a palette-only sheet the moment a
 * custom layout named itself anything else.
 */

const fs = require('node:fs');
const { ThemeStore } = require('../engine/themes');
const { packTheme } = require('../engine/css');
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
 * @returns {{ css: string, dropped: number, refused: number }}
 */
function cliDeckSheet(store, { theme, sizeName, covered = [], validate = true }) {
  // `cssFor` answers an unknown theme with '' — right for a live host, and for an export a
  // deck with no stylesheet at all. Refuse instead of shipping one.
  if (!store.has(theme)) throw new Error(`cliDeckSheet: theme "${theme}" is not registered`);
  const flat = unwrap(store.cssFor(theme, sizeName, { flat: true }));
  return dropCoveredSheetFaces(flat, { covered, validate });
}

/**
 * The families KaTeX's stylesheet declares, read from its bytes rather than a hardcoded list
 * that would rot the first time KaTeX added a face. GUARDED: a missing or unreadable sheet
 * yields [], which is safe — the deck sheet's KaTeX faces then stay in place, inert.
 *
 * @param {string|undefined} katexCssPath  resolved `katex/dist/katex.min.css`, if any
 */
function katexFamilies(katexCssPath) {
  if (!katexCssPath) return [];
  try {
    return [...new Set(scanFontFaceRules(fs.readFileSync(katexCssPath, 'utf8')).map((r) => r.family).filter(Boolean))];
  } catch (_e) { return []; }
}

/**
 * Every family the CLI document supplies without the deck sheet: the engine's text faces
 * (the base64 block — `emittedFamilies` applies the same on-disk test that block does) and
 * KaTeX's (the `<link>`).
 */
function coveredFamilies(pkgRoot, katexCssPath) {
  return [...emittedFamilies(pkgRoot), ...katexFamilies(katexCssPath)];
}

/**
 * The deck's OWN CSS — its front-matter `style:` block and every top-level `<style>` in its
 * body — exactly as written, followed by a copy of the custom properties its `:root` rules
 * declare, written onto the slides the way the flat sheet writes the palette's.
 *
 * WHY. The flat sheet declares each `:root` token on every slide too
 * (`:where(section):not([\20 root])`, specificity 0,1,0). An author's `:root{--accent:…}` lands
 * on `<html>` alone, and the slide's own declaration shadows it: measured,
 * `style: ":root{--accent:#f00;--bg:#0f0}"` painted indaco's accent and a white canvas once the
 * CLI moved onto the flat sheet, where the unpacked CLI had painted both. The copy lands on the
 * slide after the deck sheet and wins on source order, as the author's `:root` used to win at
 * the root.
 *
 * WHY ONLY `--*`. Everything else in an author `:root` keeps the one level it always had. The
 * case that decides it is `color-scheme`: `a11y-base` pins `color-scheme: light` at
 * `:root:root` to outrank a deck's `style: ":root{color-scheme:dark}"` at the root, and its
 * plain half lands on the slide. Copying the author's `color-scheme` onto the slide beat that
 * plain half there and turned every a11y palette's fixed white canvas black (measured). A
 * custom property has no such pin: the palette declares it, and the author means to override it.
 *
 * WHAT STILL DIFFERS. A bare `section{--accent:…}` override loses to a token the palette
 * declares at `:root`, as it does in Marp and in every other Lattice host; the unpacked CLI was
 * the one place it won. Write the override at `:root`, or on a class (`section.brand`).
 */
function packAuthorCss(css) {
  const text = String(css ?? '');
  const copy = rootTokenCopy(text.replace(COMMENT_RE, ''));
  if (!copy.trim()) return text;
  return `${text}\n${unwrap(packTheme(copy, { flat: true }))}`;
}

const ROOT_ARM_RE = /(^|[\s>+~(])(?:section)?:root\b/;

/** A declaration block's declarations, split on `;` outside quotes and parentheses. */
function declarations(body) {
  const out = [];
  let cur = '';
  let quote = null;
  let paren = 0;
  for (let k = 0; k < body.length; k++) {
    const c = body[k];
    if (quote) { cur += c; if (c === '\\') cur += body[++k] ?? ''; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
    else if (c === ';' && paren === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * The part of `css` that names `:root` and sets a custom property: every style rule cut down
 * to its `:root` arms and its `--*` declarations, inside the conditional group rules
 * (`@media`, `@supports`, `@container`, `@layer`) that held it. Everything else is dropped.
 * A small brace walk, quote-aware; `css` arrives comment-stripped.
 */
function rootTokenCopy(css) {
  let i = 0;
  const readBlock = () => {
    // at `{` already consumed; returns the text up to the matching `}` (consumed)
    const start = i;
    let depth = 1;
    let quote = null;
    for (; i < css.length; i++) {
      const c = css[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { i++; return css.slice(start, i - 1); }
    }
    return css.slice(start);
  };
  const walk = (src) => {
    const saved = [css, i];
    css = src; i = 0;
    let out = '';
    let prelude = '';
    let quote = null;
    for (; i < css.length; i++) {
      const c = css[i];
      if (quote) { prelude += c; if (c === '\\') { prelude += css[++i] ?? ''; } else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; prelude += c; continue; }
      if (c === ';') { prelude = ''; continue; }
      if (c !== '{') { prelude += c; continue; }
      i++;
      const body = readBlock();
      i--;
      const head = prelude.trim();
      prelude = '';
      if (head.startsWith('@')) {
        if (/^@(media|supports|container|layer|document)\b/i.test(head)) {
          const inner = walk(body);
          if (inner.trim()) out += `${head}{${inner}}`;
        }
        continue;
      }
      const arms = head.split(',').map((a) => a.trim()).filter((a) => ROOT_ARM_RE.test(a));
      const decls = declarations(body).filter((d) => /^--[\w-]+\s*:/.test(d));
      if (arms.length && decls.length) out += `${arms.join(', ')}{${decls.join(';')}}`;
    }
    [css, i] = saved;
    return out;
  };
  return walk(css);
}

/**
 * Pack every top-level `<style>` body in the deck's slide markup (see `packAuthorCss`). A
 * `<style>` inside an `<svg>` is Mermaid's (or an author's inline SVG's) own sheet, scoped to
 * that drawing by its ids, and is left exactly as written. The scan counts `<svg` opens and
 * closes ahead of each `<style>`; slide text reaches here entity-escaped, so a literal `<svg`
 * in prose or code cannot move the count.
 */
function packInlineStyles(html) {
  let depth = 0;
  return String(html).replace(/<svg\b[^>]*?(\/?)>|<\/svg\s*>|(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,
    (m, selfClosing, open, body, close) => {
      if (open === undefined) {
        if (m[1] === '/') depth = Math.max(0, depth - 1);
        else if (!selfClosing) depth++;
        return m;
      }
      return depth > 0 ? m : `${open}${packAuthorCss(body)}${close}`;
    });
}

module.exports = { cliThemeStore, cliDeckSheet, packAuthorCss, packInlineStyles, katexFamilies, coveredFamilies };
