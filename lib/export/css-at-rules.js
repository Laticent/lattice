/**
 * lib/export/css-at-rules.js — the at-rule and declaration readers the export and font code share, on the one CSS
 * tokenizer (Segno P5b; engineering/decisions/2026-10-22-segno-deck-pipeline.md §P5 census, Family B).
 *
 * One way to find an `@font-face` rule, its `font-family` and its `data:` faces, so the player, KaTeX, the PDF and the
 * font code cannot read the same rule four ways. Each reads CSS as CSS does: an at-rule, a `}` or a `url(` inside a
 * comment or a string is not one, and a block ends at the `}` that matches its `{`.
 *
 * Not loaded by the runtime bundle (only lib/export requires it), so it moves no runtime byte. It lives beside its one
 * user; it moves down when a second part needs it (lib/fonts/face-css.js, once the tokenizer is fast enough for it).
 */
const { cssTokens, cssStringValue, cssUnescape, cssUrls } = require('../core/css-tokens');

/**
 * Each `@<name> … { … }` rule of `css`, as `[from, to, open]`: from the `@` to past the `}` that matches the first `{`,
 * and where that `{` is. The
 * name matches without case and with escapes decoded, as CSS matches it. A rule whose block never closes is left out,
 * and so is one a `;` ends before any block opens.
 * @param {string} css
 * @param {string} name   lower case, without the `@`: `font-face`
 * @returns {Array<[number, number, number]>}
 */
function cssAtRuleBlocks(css, name) {
  const s = String(css ?? '');
  if (!s.includes('@')) return [];
  const t = cssTokens(s);
  const out = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i].type !== 'at' || cssUnescape(s.slice(t[i].from + 1, t[i].to)).toLowerCase() !== name) continue;
    let k = i + 1;
    while (k < t.length && t[k].type !== '{' && t[k].type !== ';' && t[k].type !== '}') k++;
    if (t[k]?.type !== '{') continue;
    const open = t[k].from;
    let depth = 0;
    for (; k < t.length; k++) {
      if (t[k].type === '{') depth++;
      else if (t[k].type === '}' && --depth === 0) break;
    }
    if (k >= t.length) break;
    out.push([t[i].from, t[k].to, open]);
    i = k;
  }
  return out;
}

/**
 * The value of the first `<prop>:` declaration in `css[from, to)` (a rule's block), as `{ from, to }` past the colon and
 * its whitespace, up to the `;` or `}` that ends it (or `to`), trailing whitespace trimmed. `declFrom` is where the
 * property's name starts. The property matches without case. Null when there is none.
 * @param {string} css
 * @param {string} prop  lower case
 * @param {number} [from]
 * @param {number} [to]
 */
function cssDeclValue(css, prop, from = 0, to) {
  const s = String(css ?? '');
  const t = cssTokens(s, from, to);
  for (let i = 0; i + 1 < t.length; i++) {
    if (t[i].type !== 'ident' || cssUnescape(s.slice(t[i].from, t[i].to)).toLowerCase() !== prop) continue;
    let k = i + 1;
    while (t[k]?.type === 'ws' || t[k]?.type === 'comment') k++;
    if (t[k]?.type !== ':') continue;
    k++;
    while (t[k]?.type === 'ws' || t[k]?.type === 'comment') k++;
    const start = t[k] ? t[k].from : (to ?? s.length);
    let end = start;
    for (let depth = 0; k < t.length; k++) {
      const ty = t[k].type;
      if (ty === '(' || ty === 'function' || ty === '[' || ty === '{') depth++;
      else if ((ty === ')' || ty === ']' || ty === '}') && depth > 0) depth--;
      else if ((ty === ';' || ty === '}') && depth === 0) break;
      if (ty !== 'ws' && ty !== 'comment') end = t[k].to;
    }
    return { declFrom: t[i].from, from: start, to: end };
  }
  return null;
}

/**
 * A face's first family name, lower case: a string's decoded value, or the unquoted name up to the first comma. ''
 * when the block names none.
 * @param {string} css
 * @param {number} [from]
 * @param {number} [to]
 */
function faceFamily(css, from = 0, to) {
  const s = String(css ?? '');
  const v = cssDeclValue(s, 'font-family', from, to);
  if (!v) return '';
  const first = cssTokens(s, v.from, v.to)[0];
  if (first?.type === 'string') return cssStringValue(s, first.from, first.to).value.trim().toLowerCase();
  const comma = s.slice(v.from, v.to).indexOf(',');
  return cssUnescape(s.slice(v.from, comma < 0 ? v.to : v.from + comma)).trim().toLowerCase();
}

/**
 * Each `url(data:<mime>;base64,<payload>)` in `css[from, to)`: an address of exactly that shape, quoted or not, whose
 * payload is base64 alone. `rawFrom`, `rawTo` span the address as written, for a splice; `payload` is the base64.
 * @param {string} css
 * @param {string} mime  `font/woff2`
 * @param {number} [from]
 * @param {number} [to]
 */
function cssBase64Urls(css, mime, from = 0, to) {
  const prefix = `data:${mime};base64,`;
  const out = [];
  for (const u of cssUrls(css, from, to)) {
    if (!u.value.startsWith(prefix)) continue;
    const payload = u.value.slice(prefix.length);
    if (!payload || !isBase64(payload)) continue;
    out.push({ from: u.from, to: u.to, rawFrom: u.rawFrom, rawTo: u.rawTo, quoted: u.quoted, payload });
  }
  return out;
}

function isBase64(p) {
  for (let i = 0; i < p.length; i++) {
    const c = p.charCodeAt(i);
    const ok = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47 || c === 61;
    if (!ok) return false;
  }
  return true;
}

module.exports = { cssAtRuleBlocks, cssDeclValue, faceFamily, cssBase64Urls };
