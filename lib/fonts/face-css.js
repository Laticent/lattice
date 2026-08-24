/**
 * lib/fonts/face-css.js
 *
 * ONE builder for the engine's `@font-face` rules, over the canonical manifest in
 * `text-faces.js`. Everything that has to put Lattice's own type into a document
 * it does not control goes through here.
 *
 * WHY IT EXISTS. The emulator already carried two near-identical copies — the PDF
 * page's embedded block and the standalone-SVG subset — and #1674 needed a third,
 * for the Mermaid render worker's page. A third copy of "walk TEXT_FACES, find the
 * woff2, base64 it, emit a rule" is how the `font-display` value, the directory
 * fallback, or the family-subset semantics drift apart with nothing watching
 * (HARD RULE #15). One function, three callers.
 *
 * The bytes are always INLINE (`data:` URI) rather than a `file://` URL. A worker
 * page, a standalone SVG and an exported HTML sidecar can all end up somewhere the
 * relative path no longer resolves, and a font that silently fails to load is the
 * exact failure #1674 is about: the measure pass sees a fallback face and the paint
 * pass sees the real one.
 */

const fs = require('node:fs');
const path = require('node:path');
const { TEXT_FACES } = require('./text-faces.js');

/**
 * Where the woff2 actually live. `dist/fonts/` is preferred because it ships in the
 * npm tarball AND is committed in-repo; `assets/fonts/` is the pre-build fallback.
 *
 * @param {string} pkgRoot  The package root to resolve against.
 * @returns {string|null} The directory, or null when neither exists.
 */
function fontDir(pkgRoot) {
  return [path.join(pkgRoot, 'dist', 'fonts'), path.join(pkgRoot, 'assets', 'fonts')]
    .find((d) => fs.existsSync(d)) || null;
}

/**
 * Build raw `@font-face{…}` rules — no `<style>` wrapper, so a caller can put them
 * in a stylesheet, an SVG `<defs>`, or `page.addStyleTag`.
 *
 * @param {string} pkgRoot  The package root the woff2 are resolved against.
 * @param {object} [opts]
 * @param {string[]} [opts.families]  Restrict to these families (case-insensitive).
 *   Omit — or pass an empty list — for every face in the manifest.
 * @param {'swap'|'block'} [opts.display]  `font-display`. Defaults to `swap`, which
 *   is what both emulator callers shipped. A caller that AWAITS `document.fonts`
 *   before it measures anything is unaffected either way.
 * @returns {string} Concatenated rules, or `''` when no woff2 could be found.
 */
function fontFaceCss(pkgRoot, { families, display = 'swap' } = {}) {
  const dir = fontDir(pkgRoot);
  if (!dir) return '';
  const want = new Set((families || []).map((f) => String(f).toLowerCase()));
  const rules = [];
  for (const { family, weight, style, file } of TEXT_FACES) {
    if (want.size && !want.has(family.toLowerCase())) continue;
    const fp = path.join(dir, `${file}.woff2`);
    if (!fs.existsSync(fp)) continue;
    const b64 = fs.readFileSync(fp).toString('base64');
    rules.push(
      `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};` +
      `font-display:${display};src:url(data:font/woff2;base64,${b64}) format('woff2');}`,
    );
  }
  return rules.join('');
}

/**
 * Every distinct family the manifest carries, in manifest order, deduped. The
 * Mermaid worker uses it to drive `document.fonts.load()` per family — a face that
 * is merely DECLARED is not loaded, and an unloaded face measures as its fallback.
 *
 * @returns {string[]}
 */
function fontFamilies() {
  return [...new Set(TEXT_FACES.map((f) => f.family))];
}

/**
 * Drop the `@font-face` rules an INLINED stylesheet no longer needs.
 *
 * THE DEFECT. A stylesheet's relative `url()` resolves against THE STYLESHEET.
 * `dist/lattice.css` is authored for that — its 37 self-hosted faces are
 * `url('fonts/<file>.woff2')`, correct for a consumer who `<link>`s it out of `dist/`
 * beside the `dist/fonts/` the build writes. The export never links it: it INLINES the
 * bytes into the deck document, which silently rebases every relative `url()` onto the
 * OUTPUT directory. Measured on a real sidecar: 74 declared faces, 37 `loaded` + 37
 * `error`, every error an `ERR_FILE_NOT_FOUND`, on every navigation of every export.
 *
 * It never SHOWED because each doomed face has a working twin in the same document — the
 * engine's own faces are base64-inlined by `fontFaceCss` above, KaTeX's arrive through a
 * `<link>` to `katex.min.css` (which DOES resolve relatively, because it is linked). The
 * doomed copies are declared last and would win the match, but they fail, and Chromium
 * falls back within the family group. So the export was correct by accident, resting on
 * fallback behavior nothing documented and nothing gated.
 *
 * WHAT THIS DOES, AND THE ONE THING IT DELIBERATELY DOES NOT.
 *
 * It drops a `@font-face` whose src is relative AND whose family the caller lists in
 * `covered` — a face that can only cost a doomed fetch. It leaves everything else BYTE
 * FOR BYTE, including an uncovered face whose relative url is equally doomed.
 *
 * An earlier cut also REBASED those uncovered faces onto the stylesheet's own directory,
 * on the theory that it made the "no `assets/` in the tarball" fallback work. Withdrawn,
 * for two reasons found by the HARD RULE #25 checker:
 *   1. **It could not help the case it named.** `fontDir()` returns null — the condition
 *      that empties the base64 block — only when NEITHER `dist/fonts/` nor `assets/fonts/`
 *      exists, and `dist/fonts/` is exactly where a default-sheet rebase would have
 *      pointed. The fallback it claimed to fix is unreachable by construction.
 *   2. **It opened a file-disclosure primitive.** `lib/export/html-player.js`'s
 *      `inlineFileUrls` rewrites `url(file://…)` inside a `<style>` to a base64 `data:`
 *      URI — so rebasing turned any relative url in a caller's `--css` sheet into an
 *      arbitrary local-file read baked into the shipped `--player` HTML. Reproduced end
 *      to end with a canary file. That function's own docblock already warns a hosted
 *      bake path must gate `file://` inlining; widening the vector from deck markup to
 *      the stylesheet, silently, was the opposite of that.
 * Leaving an uncovered face alone is the status quo — it was already broken and is no
 * more broken now. Making it work is a separate change with a trust boundary to settle.
 *
 * DROPPING, NOT MAKING THEM RESOLVE, IS ALSO THE FAST ANSWER, and that was measured
 * before it was chosen: rebasing all 37 so they load really fetches 37 woff2 the document
 * already carries inline — 405 ms per navigation, against 229 ms for the broken status
 * quo and 204 ms for dropping them.
 *
 * @param {string} cssText  The stylesheet's text, as it will be inlined.
 * @param {object} [opts]
 * @param {string[]} [opts.covered]  Families the document already supplies another way.
 * @returns {{css: string, dropped: number}}
 */
function dropCoveredSheetFaces(cssText, { covered = [] } = {}) {
  const coveredSet = new Set(covered.map((f) => String(f).toLowerCase()));
  if (!coveredSet.size) return { css: cssText, dropped: 0 };

  const rules = scanFontFaceRules(cssText);
  let dropped = 0;
  const parts = [];
  let cursor = 0;
  for (const rule of rules) {
    if (!rule.hasRelativeUrl) continue;
    if (!rule.family || !coveredSet.has(rule.family.toLowerCase())) continue;
    parts.push(cssText.slice(cursor, rule.start));
    cursor = rule.end;
    dropped++;
  }
  if (!dropped) return { css: cssText, dropped: 0 };
  parts.push(cssText.slice(cursor));
  return { css: parts.join(''), dropped };
}

// ── The scanner ──────────────────────────────────────────────────────────────
//
// WHY A STATE MACHINE AND NOT `indexOf`, and why not `css-tree` either.
//
// The first cut of this file located rules with `indexOf('@font-face')` +
// `indexOf('{')` + `indexOf('}')`, skipping `/* */` only at the top level. The HARD
// RULE #25 checker broke it four ways, all reproduced, all SILENT — the covered arm
// deletes text, so a wrong boundary loses real CSS and reports success:
//   • `src:url("fonts/a.woff2")/* TODO {see #123} */;…}` — a `}` inside a COMMENT ended
//     the rule early, and the splice left ` */;font-display:swap}KEEP{color:red}`.
//   • `font-family:"Outfit}"` — a `}` inside a STRING did the same; on a MINIFIED
//     single-line sheet the dangling `"` opens an unterminated string that swallows the
//     rest of the caller's stylesheet, exit 0, no warning.
//   • `/* mirrors font-family: Outfit; above */font-family:'MyFont'` — the family regex
//     read the COMMENT, so a face nothing supplies was judged covered and deleted.
//   • `font-family:'Outfit';/* was url('fonts/o.woff2') */src:url(data:…)` — same blind
//     read made a WORKING base64 face look relative, and deleted it.
// A `}` is only a terminator outside strings and comments; that is the whole
// specification, and it is small enough to write exactly rather than approximate.
//
// `css-tree` (already an OPTIONAL dependency, used by the player prune) would also be
// exact, and was measured rather than assumed: parsing the real 1.6 MB engine sheet
// costs 130-219 ms, 58 ms even with `parseValue: false`. This function exists to save
// ~21 ms per navigation. It is also optional, so every caller would need this path
// anyway when it is absent. One linear pass is ~4 ms.
//
// EVERY AMBIGUITY RESOLVES TOWARD KEEPING THE RULE. Keeping a doomed face costs one
// failed fetch — the pre-existing behavior. Dropping the wrong one loses type, or CSS.

const AT_KEYWORD = '@font-face';

/** Advance past a quoted string; `i` points at the opening quote. */
function skipString(css, i) {
  const quote = css[i];
  for (let j = i + 1; j < css.length; j++) {
    if (css[j] === '\\') { j++; continue; }
    if (css[j] === quote) return j + 1;
  }
  return css.length; // unterminated — consume the rest, as a CSS parser does
}

/** Advance past a `/* … *\/` comment; `i` points at the `/`. */
function skipComment(css, i) {
  const end = css.indexOf('*/', i + 2);
  return end === -1 ? css.length : end + 2;
}

/**
 * Every real `@font-face` rule in `cssText`, as
 * `{start, end, bodyStart, bodyEnd, family, hasRelativeUrl}` — `family` unquoted and read
 * from a comment-blanked body, `hasRelativeUrl` true when any `url()` names a target with
 * no scheme and no leading `/`. At-keywords inside strings and comments are not rules;
 * neither is one with no `{`, or one whose `{` is never closed.
 */
function scanFontFaceRules(cssText) {
  const out = [];
  const n = cssText.length;
  let i = 0;
  while (i < n) {
    const c = cssText[i];
    if (c === '/' && cssText[i + 1] === '*') { i = skipComment(cssText, i); continue; }
    if (c === '"' || c === "'") { i = skipString(cssText, i); continue; }
    if (c !== '@' || !cssText.startsWith(AT_KEYWORD, i)) { i++; continue; }
    const rule = readRule(cssText, i);
    if (!rule) { i += AT_KEYWORD.length; continue; }
    out.push(rule);
    i = rule.end;
  }
  return out;
}

/**
 * Read one rule starting at the at-keyword. Only whitespace and comments may separate
 * the keyword from its `{` — that test is what stops `content: "@font-face"` from being
 * paired with the next unrelated block in the sheet.
 */
function readRule(cssText, at) {
  let i = at + AT_KEYWORD.length;
  while (i < cssText.length) {
    if (/\s/.test(cssText[i])) { i++; continue; }
    if (cssText[i] === '/' && cssText[i + 1] === '*') { i = skipComment(cssText, i); continue; }
    break;
  }
  if (cssText[i] !== '{') return null;
  const bodyStart = i + 1;
  let depth = 1;
  let j = bodyStart;
  while (j < cssText.length) {
    const c = cssText[j];
    if (c === '/' && cssText[j + 1] === '*') { j = skipComment(cssText, j); continue; }
    if (c === '"' || c === "'") { j = skipString(cssText, j); continue; }
    if (c === '{') { depth++; j++; continue; }
    if (c === '}') {
      depth--;
      if (!depth) {
        // The body with comments blanked out — every value read below happens on THIS,
        // never on the raw text, so a comment can neither supply a family nor hide one.
        const body = stripComments(cssText.slice(bodyStart, j));
        return {
          start: at, end: j + 1, bodyStart, bodyEnd: j,
          family: declaredFamily(body),
          hasRelativeUrl: srcHasRelativeUrl(body),
        };
      }
      j++;
      continue;
    }
    j++;
  }
  return null; // unterminated — leave the tail of the sheet alone
}

/** Blank out comments so a value regex cannot read one. */
function stripComments(body) {
  let out = '';
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '/' && body[i + 1] === '*') { const e = skipComment(body, i); out += ' '; i = e; continue; }
    if (c === '"' || c === "'") { const e = skipString(body, i); out += body.slice(i, e); i = e; continue; }
    out += c;
    i++;
  }
  return out;
}

// A quoted value may itself contain `;` or `}`, so the quoted forms come first.
const FAMILY_RE = /font-family\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;}]+)/i;
const URL_RE = /url\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]*?)\s*\)/gi;

/** The rule's declared family, unquoted, or `''` when it declares none. */
function declaredFamily(body) {
  const m = FAMILY_RE.exec(body);
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '').trim() : '';
}

/**
 * Does any `url()` in the rule name a RELATIVE target — no scheme, not root-absolute?
 * Those are the only ones inlining changes the meaning of.
 */
function srcHasRelativeUrl(body) {
  URL_RE.lastIndex = 0;
  for (const m of body.matchAll(URL_RE)) {
    const u = m[1].trim().replace(/^['"]|['"]$/g, '').trim();
    if (!u) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('/')) continue;
    return true;
  }
  return false;
}

module.exports = { fontFaceCss, fontFamilies, fontDir, dropCoveredSheetFaces, scanFontFaceRules };
