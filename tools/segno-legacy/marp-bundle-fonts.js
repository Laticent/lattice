/**
 * marp-bundle-fonts.js — the two font readers of lib/export/marp-bundle.js (`fontAssetsFor`, `withoutEmojiFont`) as they
 * were before Segno P5b read them with the one CSS tokenizer.
 *
 * Frozen verbatim from lib/export/marp-bundle.js at 3176d626 (with `FONT_URL`, which the first reads). It is the ORACLE
 * for test/unit/export/marp-bundle-fonts-differential.test.js. Nothing in lib/ may read it. Do not fix bugs here.
 * Delete it when nobody reads it.
 */
const { stripCssComments } = require('../../lib/core/leading-is');

const FONT_URL = /url\([ \t]{0,8}['"]?fonts\/([^)'"\s]{1,256})['"]?[ \t]{0,8}\)/g;

function fontAssetsFor(latticeCss) {
  const files = new Set();
  for (const m of stripCssComments(latticeCss).matchAll(FONT_URL)) files.add(m[1]);
  return [...files].sort().map((f) => ({ from: `dist/fonts/${f}`, to: `fonts/${f}` }));
}

function withoutEmojiFont(css) {
  return css.replace(/@font-face\s*\{[^}]*Noto Color Emoji[^}]*\}/g, '');
}

module.exports = { fontAssetsFor, withoutEmojiFont };
