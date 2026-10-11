/**
 * lib/plugin-kit/html.js — the plugin kit's section and list helpers: walking a deck's rendered
 * `<section>`s, peeling a slide's coda, finding a list. A plugin imports these from here and never
 * from lib/core, so lib/core can change behind the kit without breaking a plugin
 * (engineering/decisions/2026-10-11-codebase-structure.md §5; tools/structure.js enforces it).
 */

const { setRenderSection } = require('../core/render-ids');
const { peelCoda } = require('../core/coda');
const { PROSE_ATTR, isProse } = require('../core/prose-code');
const { mapSections } = require('../core/section-walk');
const { findMatchingClose } = require('../core/find-matching-close');
const { extractFirstList, parseTopLevelLis } = require('../core/html-lists');

module.exports = { setRenderSection, peelCoda, PROSE_ATTR, isProse, mapSections, findMatchingClose, extractFirstList, parseTopLevelLis };
