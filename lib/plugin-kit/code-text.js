/**
 * lib/plugin-kit/code-text.js — the plugin kit's code-text readers: the index lists `focus=` and
 * `mark=` take, a block's lines (lib/core/collections.js), and a deck's top-level front-matter value
 * (lib/core/front-matter-key.js), shared with the engine's own `_focus` grammar.
 */

const { parseIndexList, splitCodeLines } = require('../core/collections.js');
const { topLevelFrontMatterValue } = require('../core/front-matter-key.js');

module.exports = { parseIndexList, splitCodeLines, topLevelFrontMatterValue };
