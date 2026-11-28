/**
 * lib/export/katex-inline.js — KaTeX's stylesheet made SELF-CONTAINED, for both hosts.
 *
 * Every `@font-face` src collapses to its woff2 entry, inlined as a `data:` URI, and the sheet
 * splits in two: its faces join the page's one font block and its rules ride in `#lattice-katex`
 * (lattice.js says why). The CLI read the fonts off disk and did this; the Studio LINKED the sheet,
 * whose relative font urls cannot load in a shared file, so its math players carried no KaTeX
 * faces at all and the math fell back to Times (decisions/2026-10-16-player-as-library-audit.md
 * §11.9). The host supplies the bytes (`base64Of`), from disk or from a fetch; the transform is this
 * one.
 *
 * READ BY THE ONE CSS TOKENIZER (Segno P5b, lib/core/css-tokens.js), so a `src:` or a `@font-face` inside a comment or a
 * string is not one, and a `}` inside a string does not end a face. On KaTeX's own sheet the bytes are the ones the
 * regexes it replaced wrote (test/unit/export/katex-inline-differential.test.js). The docs reach this file only through
 * the player-core bundle (tools/build-player-core.js), never through the dev server's CommonJS shim, so it may require.
 */

const { cssTokens, cssStringValue } = require('../core/css-tokens');
const { cssAtRuleBlocks } = require('./css-at-rules');

const isWs = (t) => t?.type === 'ws';
// The address `fonts/<name>.woff2`, with no quote or `)` in the name: the name, or null.
const woff2File = (address) => {
  if (!address.startsWith('fonts/') || !address.endsWith('.woff2') || address.length <= 12) return null;
  const name = address.slice(6);
  for (const c of name) if (c === ')' || c === "'" || c === '"') return null;
  return name;
};
// An unquoted `url(…)` token's address with the whitespace around it trimmed, or null when it holds a quote or a space.
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
const bareAddress = (text) => {
  if (!text.endsWith(')')) return null;
  let a = 4;
  let b = text.length - 1;
  while (a < b && isSpace(text[a])) a++;
  while (b > a && isSpace(text[b - 1])) b--;
  const body = text.slice(a, b);
  for (const c of body) if (c === ')' || c === "'" || c === '"' || isSpace(c)) return null;
  return body;
};

/**
 * Each woff2 `src` declaration in `css`, as the regex before it read one: `src:` written with no space before its
 * `url(fonts/….woff2)`, then `format(woff2)` (the name bare or quoted), then the rest of the value, up to the `;` or `}`
 * that ends it. `from`, `to` span the whole declaration (`to` before that `;` or `}`); `file` is the name under `fonts/`.
 */
function woff2Srcs(css) {
  const s = String(css);
  const t = cssTokens(s);
  const out = [];
  for (let i = 0; i + 2 < t.length; i++) {
    if (t[i].type !== 'ident' || s.slice(t[i].from, t[i].to) !== 'src' || t[i + 1].type !== ':') continue;
    let k = i + 2;
    let file;
    if (t[k].type === 'url') {
      const address = bareAddress(s.slice(t[k].from, t[k].to));
      file = address && woff2File(address);
      k++;
    } else if (t[k].type === 'function' && s.slice(t[k].from, t[k].to) === 'url(') {
      let j = k + 1;
      if (isWs(t[j])) j++;
      if (t[j]?.type !== 'string') continue;
      const { value, closed } = cssStringValue(s, t[j].from, t[j].to);
      file = closed && s.slice(t[j].from + 1, t[j].to - 1) === value ? woff2File(value) : null;
      j++;
      if (isWs(t[j])) j++;
      if (t[j]?.type !== ')') continue;
      k = j + 1;
    }
    if (!file) continue;
    if (isWs(t[k])) k++;
    if (t[k]?.type !== 'function' || s.slice(t[k].from, t[k].to) !== 'format(') continue;
    k++;
    const name = t[k]?.type === 'string' ? cssStringValue(s, t[k].from, t[k].to) : null;
    if (!(name ? name.closed && name.value === 'woff2' && s.slice(t[k].from + 1, t[k].to - 1) === 'woff2' : t[k]?.type === 'ident' && s.slice(t[k].from, t[k].to) === 'woff2')) continue;
    if (t[++k]?.type !== ')') continue;
    while (k + 1 < t.length && t[k + 1].type !== ';' && t[k + 1].type !== '}') k++;
    out.push({ from: t[i].from, to: t[k].to, file });
    i = k;
  }
  return out;
}
// A bare file name only: the sheet's own text names the files, so nothing that climbs out of
// `fonts/` is followed.
const SAFE_FILE = /^[\w.-]+\.woff2$/;

/** The woff2 files `css` names under `fonts/`, each once, in order. */
function katexFontFiles(css) {
  return [...new Set(woff2Srcs(css).map((d) => d.file).filter((f) => SAFE_FILE.test(f)))];
}

/**
 * `css` with each woff2 src inlined. A face whose bytes `base64Of` cannot give (null) keeps its
 * relative url, inert, as before.
 *
 * @param {string} css
 * @param {(file: string) => string | null} base64Of
 */
function inlineKatexFonts(css, base64Of) {
  const s = String(css);
  let out = '';
  let at = 0;
  for (const { from, to, file } of woff2Srcs(s)) {
    if (!SAFE_FILE.test(file)) continue;
    const b64 = base64Of(file);
    if (b64 == null) continue;
    out += `${s.slice(at, from)}src:url(data:font/woff2;base64,${b64}) format('woff2')`;
    at = to;
  }
  return out + s.slice(at);
}

/** The inlined sheet split into its `@font-face` rules and everything else. */
function splitKatexSheet(inlined) {
  const text = String(inlined);
  let faces = '';
  let rules = '';
  let at = 0;
  for (const [from, to] of cssAtRuleBlocks(text, 'font-face')) {
    faces += text.slice(from, to);
    rules += text.slice(at, from);
    at = to;
  }
  return { faces, rules: rules + text.slice(at) };
}

module.exports = { katexFontFiles, inlineKatexFonts, splitKatexSheet };
