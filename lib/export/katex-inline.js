/**
 * lib/export/katex-inline.js — KaTeX's stylesheet made SELF-CONTAINED, for both hosts.
 *
 * Every `@font-face` src collapses to its woff2 entry, inlined as a `data:` URI, and the sheet
 * splits in two: its faces join the page's one font block and its rules ride in `#lattice-katex`
 * (lattice.js says why). The CLI read the fonts off disk and did this; the Studio LINKED the sheet,
 * whose relative font urls cannot load in a shared file, so its math players carried no KaTeX
 * faces at all and the math fell back to Times (decisions/2026-10-16-player-as-library-audit.md
 * §11.9). The host supplies the bytes (`base64Of`), from disk or from a fetch; the transform is this
 * one. Requires nothing, so the docs dev server's CommonJS shim can serve it.
 */

const woff2Src = () => /src:url\(\s*(['"]?)fonts\/([^)'"]+\.woff2)\1\s*\)\s*format\((['"]?)woff2\3\)[^;}]*/g;
// A bare file name only: the sheet's own text names the files, so nothing that climbs out of
// `fonts/` is followed.
const SAFE_FILE = /^[\w.-]+\.woff2$/;

/** The woff2 files `css` names under `fonts/`, each once, in order. */
function katexFontFiles(css) {
  return [...new Set([...String(css).matchAll(woff2Src())].map((m) => m[2]).filter((f) => SAFE_FILE.test(f)))];
}

/**
 * `css` with each woff2 src inlined. A face whose bytes `base64Of` cannot give (null) keeps its
 * relative url, inert, as before.
 *
 * @param {string} css
 * @param {(file: string) => string | null} base64Of
 */
function inlineKatexFonts(css, base64Of) {
  return String(css).replace(woff2Src(), (whole, _q, file) => {
    if (!SAFE_FILE.test(file)) return whole;
    const b64 = base64Of(file);
    return b64 == null ? whole : `src:url(data:font/woff2;base64,${b64}) format('woff2')`;
  });
}

/** The inlined sheet split into its `@font-face` rules and everything else. */
function splitKatexSheet(inlined) {
  const text = String(inlined);
  return { faces: (text.match(/@font-face\s*\{[^}]*\}/g) || []).join(''), rules: text.replace(/@font-face\s*\{[^}]*\}/g, '') };
}

module.exports = { katexFontFiles, inlineKatexFonts, splitKatexSheet };
