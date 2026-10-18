/**
 * lib/export/author-css.js — the deck's OWN CSS (its front-matter `style:` block and the top-level
 * `<style>` blocks in its slides), packed onto the slides the way the flat sheet packs the palette.
 *
 * Moved out of cli-deck-sheet.js, which reads files, so the Studio's Webpage export runs the same
 * code through the player-core bundle (decisions/2026-10-16-player-as-library-audit.md §11.9). The
 * functions are unchanged.
 */
const { packTheme } = require('../engine/css');
const { widenForPanes, paneClasses, paneComponents } = require('../core/pane-css');
const { readGlobalStyle } = require('./export-scaffold');
const { unwrapFlatSheet: unwrap } = require('./unwrap-flat-sheet.mjs');

const COMMENT_RE = /\/\*[\s\S]*?\*\//g;

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

/**
 * The export document's front-matter `style:` CSS, packed (`packAuthorCss`) and, on a deck with
 * panes, widened to reach them — the one value both hosts hand `exportDeckStyleText` as
 * `globalCss`. '' when the deck sets no `style:`.
 *
 * @param {string} fmText      the deck's front matter, without the `---` fences
 * @param {string} slidesHtml  the rendered slides, read for pane classes
 */
function exportGlobalCss(fmText, slidesHtml) {
  const css = packAuthorCss(readGlobalStyle(String(fmText ?? '')));
  if (!css) return '';
  const classes = paneClasses(slidesHtml);
  return classes.length ? widenForPanes(css, classes, paneComponents(slidesHtml)) : css;
}

module.exports = { packAuthorCss, packInlineStyles, rootTokenCopy, exportGlobalCss };
