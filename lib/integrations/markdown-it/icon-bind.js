/** lib/integrations/markdown-it/icon-bind.js — the markdown-it adapter of lib/core/icon-bind.js (the rule and why live there). */


const { BIND_CLASS, BIND_WORD } = require('../../core/icon-bind.js');

/**
 * In an inline token's children, wrap each icon (an `html_inline` child holding a `lat-icon` span) and the word the
 * next text child opens with. `Token` is the markdown-it token class (`state.Token`).
 */
module.exports = function bindIconWords(children, Token) {
  for (let i = 0; i < children.length - 1; i++) {
    const icon = children[i];
    const next = children[i + 1];
    const m = icon.type === 'html_inline' && icon.content.startsWith('<span class="lat-icon"') && next.type === 'text' && BIND_WORD.exec(next.content);
    if (!m) continue;
    icon.content = `<span class="${BIND_CLASS}">${icon.content}`;
    const word = new Token('text', '', 0);
    word.content = m[0];
    const close = new Token('html_inline', '', 0);
    close.content = '</span>';
    next.content = next.content.slice(m[0].length);
    children.splice(i + 1, 0, word, close);
    i += 2;
  }
};
