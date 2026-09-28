// Preload (`node -r`): route inline code through the prototype spark kernel first, then the
// real dispatcher. Must load before lib/integrations/markdown-it/plugins.js destructures it.
const path = require('node:path');
const directives = require(path.resolve(__dirname, '../../../../lib/core/inline-code-directives.js'));
const { sparkHtml } = require('./sparkline.js');
const real = directives.renderHtml;
directives.renderHtml = (text) => sparkHtml(text) || real(text);
const realEsc = directives.escapedText;
directives.escapedText = (text) =>
  (typeof text === 'string' && text[0] === '\\' && sparkHtml(text.slice(1)) ? text.slice(1) : realEsc(text));
