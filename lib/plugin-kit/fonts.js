/**
 * lib/plugin-kit/fonts.js — the plugin kit's type: the deck's text faces and the `@font-face` CSS
 * that embeds them, for a plugin that draws text outside the page (a render worker). A plugin
 * reaches these only through here (engineering/decisions/2026-10-11-codebase-structure.md §5).
 */

const { TEXT_FACES } = require('../fonts/text-faces.js');
const { fontFaceCss } = require('../fonts/face-css.js');

module.exports = { TEXT_FACES, fontFaceCss };
