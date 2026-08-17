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

module.exports = { fontFaceCss, fontFamilies, fontDir };
