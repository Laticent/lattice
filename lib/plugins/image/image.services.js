/**
 * lib/plugins/image/image.services.js — THE IMAGE PLUGIN'S SERVICES (`contributes.services`), built by the host with this
 * plugin's ctx and reached by name (lib/core/plugin-services.js), so a host tool asks for them rather than importing the
 * plugin's files.
 *
 *   marpMarkdown(markdown, opts)   the Export-to-Marp translation of `@image{…}` records (shared/image-marp-export.js)
 */
const { withImageMarkdown } = require('./shared/image-marp-export.js');

const services = (ctx) => Object.freeze({
  marpMarkdown: (markdown, opts = {}) => withImageMarkdown(markdown, opts, ctx),
});

module.exports = { services };
