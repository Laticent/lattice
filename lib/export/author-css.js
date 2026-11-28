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
const { cssTokens, cssCommaParts, cssStringValue } = require('../core/css-tokens');

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
  const copy = rootTokenCopy(text);
  if (!copy.trim()) return text;
  return `${text}\n${unwrap(packTheme(copy, { flat: true }))}`;
}

const ROOT_ARM_RE = /(^|[\s>+~(])(?:section)?:root\b/;

/**
 * `css` with its comments taken out, read on the one CSS tokenizer (Segno P5b), so a `/*` inside a string is text and
 * not a comment that swallows the rules after it. A comment between two tokens that are not whitespace becomes one
 * space, because CSS reads a comment as a break between tokens: `--a:1/**\/px` is `1 px`, never `1px`, and a `<`
 * and a `/style>` either side of a comment never join into a `</style>` (HARD RULE #22).
 */
function stripCssComments(css) {
  const t = cssTokens(css);
  let out = '';
  for (let k = 0; k < t.length; k++) {
    if (t[k].type !== 'comment') { out += css.slice(t[k].from, t[k].to); continue; }
    let n = k + 1;
    while (t[n]?.type === 'comment') n++;
    const before = t[k - 1];
    if (before && t[n] && before.type !== 'ws' && t[n].type !== 'ws') out += ' ';
    k = n - 1;
  }
  return out;
}

/**
 * For each `{` token, the index of the `}` that closes it (`t.length` when it never closes), in one pass. A `}` that
 * closes nothing is left alone, as the walk below leaves it.
 * @returns {Map<number, number>}
 */
function braceMatches(t) {
  const match = new Map();
  const open = [];
  for (let k = 0; k < t.length; k++) {
    if (t[k].type === '{') open.push(k);
    else if (t[k].type === '}' && open.length) match.set(open.pop(), k);
  }
  for (const k of open) match.set(k, t.length);
  return match;
}

/**
 * The text of `css[from, to)` without the whitespace at either end, cut at TOKEN edges: a trailing `\ ` is an escaped
 * space that belongs to its name, so it stays (`.trim()` would cut the space and leave a `\` that escapes the joiner).
 */
function tokenTrim(css, from, to) {
  const tt = cssTokens(css, from, to);
  let a = 0;
  let b = tt.length;
  while (a < b && tt[a].type === 'ws') a++;
  while (b > a && tt[b - 1].type === 'ws') b--;
  return a < b ? css.slice(tt[a].from, tt[b - 1].to) : '';
}

/**
 * The custom-property declarations of a block, tokens `t[a, b)`: each split on a `;` outside any bracket, trimmed, kept
 * when its name is a `--*` ident and a `:` follows it. One that holds a BAD string (a newline ends it before its quote)
 * or a bad `url(` (no `)`) is dropped, as CSS drops it: copied without its newline, a bad string would swallow the
 * declarations and the `}` after it.
 */
function tokenDeclarations(css, t, a, b) {
  const out = [];
  let depth = 0;
  let start = a;
  const take = (k) => {
    let f = start;
    while (f < k && t[f].type === 'ws') f++;
    let g = f + 1;
    while (g < k && t[g].type === 'ws') g++;
    const isProp = f < k && t[f].type === 'ident' && css.startsWith('--', t[f].from) && t[g]?.type === ':' && g < k;
    if (!isProp || holdsBadToken(css, t, g, k)) return;
    let e = k;
    while (e > f && t[e - 1].type === 'ws') e--;
    out.push(css.slice(t[f].from, t[e - 1].to));
  };
  for (let k = a; k < b; k++) {
    const ty = t[k].type;
    if (ty === '(' || ty === '[' || ty === '{' || ty === 'function') depth++;
    else if ((ty === ')' || ty === ']' || ty === '}') && depth > 0) depth--;
    else if (ty === ';' && depth === 0) { take(k); start = k + 1; }
  }
  if (start < b) take(b);
  return out;
}

/** Whether tokens `t[a, b)` hold a bad string (no closing quote) or a bad `url(` (no closing `)`). */
function holdsBadToken(css, t, a, b) {
  for (let k = a; k < b; k++) {
    const { type, from, to } = t[k];
    if (type === 'string' && !cssStringValue(css, from, to).closed) return true;
    if (type === 'url' && css[to - 1] !== ')') return true;
  }
  return false;
}

/**
 * The part of `css` that names `:root` and sets a custom property: every style rule cut down
 * to its `:root` arms and its `--*` declarations, inside the conditional group rules
 * (`@media`, `@supports`, `@container`, `@layer`) that held it. Everything else is dropped.
 * Read on the one CSS tokenizer (Segno P5b): comments out first, then a block is the tokens up to the `}` that matches its
 * `{`, so a brace inside a string, an escape or an unquoted `url(` never ends one, and a selector list splits only on a
 * comma outside parentheses (`:is(:root, .x)` is one arm). Linear, and nesting costs no call stack (an explicit stack of
 * group rules), so a sheet nested thousands deep is read, not thrown on.
 */
function rootTokenCopy(input) {
  const css = stripCssComments(String(input ?? ''));
  const t = cssTokens(css);
  const match = braceMatches(t);
  const at = (k) => (k < t.length ? t[k].from : css.length);
  // A frame per open group rule, so nesting costs no call stack: `end` is the index of its `}` (t.length when unclosed).
  const stack = [{ end: t.length, headFrom: at(0), out: '', head: '' }];
  for (let k = 0; ; ) {
    const f = stack[stack.length - 1];
    if (k >= f.end) {
      if (stack.length === 1) return f.out;
      stack.pop();
      const up = stack[stack.length - 1];
      // Every piece a frame adds is a rule, never blank, so a length test is the old `inner.trim()` without a copy per level.
      if (f.out.length) up.out += `${f.head}{${f.out}}`;
      up.headFrom = f.end < up.end ? t[f.end].to : at(up.end);
      k = f.end + 1;
      continue;
    }
    const ty = t[k].type;
    if (ty === ';') f.headFrom = t[k].to;
    if (ty !== '{') { k++; continue; }
    const close = Math.min(match.get(k), f.end);
    const head = tokenTrim(css, f.headFrom, t[k].from);
    if (head.startsWith('@')) {
      if (/^@(media|supports|container|layer|document)\b/i.test(head)) {
        stack.push({ end: close, headFrom: t[k].to, out: '', head });
        k++;
        continue;
      }
    } else {
      const arms = cssCommaParts(css, f.headFrom, t[k].from)
        .map(([a, b]) => tokenTrim(css, a, b))
        .filter((arm) => ROOT_ARM_RE.test(arm));
      const decls = tokenDeclarations(css, t, k + 1, close);
      if (arms.length && decls.length) f.out += `${arms.join(', ')}{${decls.join(';')}}`;
    }
    f.headFrom = close < f.end ? t[close].to : at(f.end);
    k = close + 1;
  }
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

module.exports = { packAuthorCss, packInlineStyles, rootTokenCopy, stripCssComments, exportGlobalCss };
