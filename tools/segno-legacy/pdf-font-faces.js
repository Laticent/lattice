/**
 * pdf-font-faces.js — the `@font-face` read of lib/export/pdf-asset-reader.js (`fontFaceRules`) as it was before
 * Segno P5b read it with the one CSS tokenizer.
 *
 * Frozen verbatim from lib/export/pdf-asset-reader.js at 3176d626 (only the file read is cut away: this takes the
 * sheet's text). It is the ORACLE for test/unit/export/pdf-font-faces-differential.test.js. Nothing in lib/ may read
 * it. Do not fix bugs here. Delete it when nobody reads it.
 */
function fontFaceBlocks(css) {
	return (css.match(/@font-face\s*\{[^}]*\}/g) || []).join('\n');
}

module.exports = { fontFaceBlocks };
