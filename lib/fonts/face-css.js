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
const { pathToFileURL } = require('node:url');
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
 * Make an INLINED copy of a stylesheet's `@font-face` block resolve.
 *
 * A stylesheet's relative `url()` resolves against THE STYLESHEET, not the document.
 * `dist/lattice.css` is authored for that: its 37 self-hosted faces are
 * `url('fonts/<file>.woff2')`, correct for a consumer who `<link>`s it out of `dist/`
 * beside the `dist/fonts/` the build writes. The PDF/HTML export never links it — it
 * INLINES the bytes into the deck document, which silently rebases every relative
 * `url()` onto the OUTPUT directory. Measured on a real sidecar: all 37 resolve to
 * `net::ERR_FILE_NOT_FOUND`, on every navigation, in every export.
 *
 * Nothing looked broken because each of the 37 has a working twin in the same document —
 * the 17 engine text faces are base64-inlined by `fontFaceCss` above, and the 20 KaTeX
 * faces arrive through a `<link>` to `katex.min.css`, which DOES resolve relatively
 * because it is linked rather than inlined. Chromium then falls back within the family
 * group to the twin, so the deck paints in the right type. That is the whole reason the
 * defect survived: an undocumented dependency on within-family fallback, holding.
 *
 * TWO ARMS, because a doomed face fails two different ways:
 *   • COVERED family (a twin is already in the document) → DROP the rule. It can only
 *     cost: a doomed subresource fetch per navigation, and a live dependency on the
 *     fallback above.
 *   • UNCOVERED family (a `--css` override's own face; or the engine sheet when
 *     `assets/` is absent so the base64 block is empty) → REBASE the url onto the
 *     stylesheet's real directory, which is what a `<link>` would have done.
 *
 * Rebasing is NOT the answer for the covered arm, and that is measured rather than
 * argued: making all 37 resolve means really fetching 37 woff2 the document already
 * carries inline. See the numbers in the PR — rebase-everything was materially SLOWER
 * than the broken status quo, and dropping was faster than both.
 *
 * Comment-aware on purpose: 4 of `dist/lattice.css`'s 41 `@font-face` occurrences sit
 * inside CSS comments — prose describing the block — and a plain rule regex edits those
 * too, corrupting the sheet it was asked to fix.
 *
 * @param {string} cssText  The stylesheet's text, as it will be inlined.
 * @param {object} opts
 * @param {string} opts.sheetDir  Directory the sheet's relative urls are authored against.
 * @param {string[]} [opts.covered]  Families already supplied by the document.
 * @returns {{css: string, dropped: number, rebased: number}}
 */
function resolveInlinedSheetFaces(cssText, { sheetDir, covered = [] } = {}) {
  const coveredSet = new Set(covered.map((f) => String(f).toLowerCase()));
  const URL_TOKEN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  // A url() is RELATIVE when it names no scheme (`data:`, `file:`, `https:`) and is not
  // root-absolute. Those are the only ones an inline changes the meaning of.
  const isRelative = (u) => !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('/');

  // Locate every REAL rule: scan forward, stepping over /* */ regions rather than
  // matching them. `@font-face` bodies never nest, so the first `}` closes one.
  const AT_KEYWORD = '@font-face';
  const spans = [];
  let i = 0;
  while (i < cssText.length) {
    const at = cssText.indexOf(AT_KEYWORD, i);
    if (at === -1) break;
    const com = cssText.indexOf('/*', i);
    if (com !== -1 && com < at) {
      const end = cssText.indexOf('*/', com + 2);
      i = end === -1 ? cssText.length : end + 2;
      continue;
    }
    const open = cssText.indexOf('{', at);
    const close = open === -1 ? -1 : cssText.indexOf('}', open);
    if (close === -1) break;
    // A REAL rule has nothing but whitespace between the at-keyword and its `{`. Without
    // this test the scanner accepts an `@font-face` sitting inside a CSS STRING —
    // `content: "@font-face"` — and pairs it with the NEXT `{` and `}` anywhere in the
    // sheet, synthesizing a span across unrelated rules. When that span happens to
    // contain a `font-family` and a relative `url()` it is judged covered and SPLICED
    // OUT, taking real CSS with it: `p::after{content:"@font-face";font-family:Outfit;
    // background:url("img/x.png")}KEEPME{color:red}` truncated to `p::after{content:"`.
    // Found by probing this scanner rather than by review, and it is the reason the
    // function reports counts — a silent splice is the failure mode to fear here.
    if (!/^\s*$/.test(cssText.slice(at + AT_KEYWORD.length, open))) {
      i = at + AT_KEYWORD.length;
      continue;
    }
    spans.push([at, close + 1]);
    i = close + 1;
  }

  let dropped = 0;
  let rebased = 0;
  // ONE forward pass, accumulating segments — NOT 37 successive `slice`-and-concat edits
  // on the whole string. The first cut did that, and on the real 1.6 MB engine sheet it
  // copied the entire sheet once per rule: 65 ms, measured, added to every render. It read
  // as a wash against the ~21 ms per navigation this function saves and showed up as a
  // ~7% REGRESSION on all three CLI bench rows. Segment-and-join is 1 ms.
  const parts = [];
  let cursor = 0;
  for (const [start, end] of spans) {
    const rule = cssText.slice(start, end);
    const urls = [...rule.matchAll(URL_TOKEN)].map((m) => m[2].trim());
    if (!urls.some(isRelative)) continue;
    parts.push(cssText.slice(cursor, start));
    cursor = end;
    const fam = /font-family\s*:\s*([^;}]+)/i.exec(rule);
    const family = fam ? fam[1].trim().replace(/^['"]|['"]$/g, '') : '';
    if (family && coveredSet.has(family.toLowerCase())) {
      dropped++;
      continue; // the rule's text is simply never appended
    }
    parts.push(rule.replace(URL_TOKEN, (whole, _q, u) => {
      const url = u.trim();
      if (!isRelative(url)) return whole;
      return `url(${pathToFileURL(path.resolve(sheetDir, url)).href})`;
    }));
    rebased++;
  }
  if (!parts.length) return { css: cssText, dropped, rebased };
  parts.push(cssText.slice(cursor));
  return { css: parts.join(''), dropped, rebased };
}

module.exports = { fontFaceCss, fontFamilies, fontDir, resolveInlinedSheetFaces };
