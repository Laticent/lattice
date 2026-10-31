/**
 * lib/plugin-kit/sanitize.js — the plugin kit's slide sanitizer: the same DOMPurify policy the
 * preview applies (lib/core/sanitize-slide-html.mjs), for a plugin that must clean markup it did not
 * write itself (the math plugin's KaTeX wall, on output the fast path could not prove safe). Require it
 * where it is needed, not at module scope: the sanitizer is only built on that slow path.
 */

const { createSlideSanitizer } = require('../core/sanitize-slide-html.mjs');

module.exports = { createSlideSanitizer };
