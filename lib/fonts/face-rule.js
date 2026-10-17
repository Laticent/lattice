/**
 * lib/fonts/face-rule.js — ONE `@font-face` rule for an embedded engine face, the exact text every
 * host writes. The CLI's builder (face-css.js `fontFaceCss`) wrote `…format('woff2');}` in the
 * manifest's order and the Studio's (docs/src/playground/font-embed.js) wrote `…format('woff2')}` in
 * its own order, so the same faces made two different font blocks (decisions/2026-10-16-player-as-
 * library-audit.md §11.9). Both build from this, walking lib/fonts/text-faces.js in order. Requires
 * nothing, so the docs dev server's CommonJS shim can serve it.
 *
 * @param {{family: string, style: string, weight: number}} face
 * @param {string} display  `font-display`
 * @param {string} b64      the woff2, base64
 */
function faceRuleCss({ family, style, weight }, display, b64) {
  return (
    `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};` +
    `font-display:${display};src:url(data:font/woff2;base64,${b64}) format('woff2');}`
  );
}

module.exports = { faceRuleCss };
