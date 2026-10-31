/**
 * lib/plugin-kit/highlight.js — the plugin kit's highlighting helpers: the fence languages the engine
 * knows (lib/core/fence-languages.js) and the reader that turns highlighter HTML into token spans
 * (lib/core/highlight-spans.js).
 */

const fenceLanguages = require('../core/fence-languages.js');
const { spansFromHighlightHtml } = require('../core/highlight-spans.js');

module.exports = { fenceLanguages, spansFromHighlightHtml };
