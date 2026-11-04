/**
 * icon-bind.js — keep an inline icon on the same line as the word after it.
 *
 * THE DEFECT. `^{warehouse} Snowflake holds the model` broke between the icon and "Snowflake" when the line ran out:
 * the icon closed one line and its word opened the next, so the icon labeled nothing. A browser may break on either
 * side of an inline-block, and a no-break space does not stop it (Chromium breaks after an atomic inline before a
 * U+00A0 or a U+2060 alike, measured), so the only hold is an element around both with `white-space: nowrap`.
 *
 * THE RULE, shared by both adapters (HARD RULE #1): when the text right after an icon is ONE space and a word, the
 * icon, that space and that word go in a `lat-icon-bind` span. Anything else stays as written: two icons in a row
 * (`^{lock} ^{key}`, the space holds no word), punctuation (`^{bucket}.`, which no browser breaks before anyway) or a
 * line end.
 *
 * Adapters: `bindMarkdownIt` (lib/integrations/markdown-it/plugins.js, after the inline-code pass) and `bindElement`
 * (lib/runtime/index.js, the DOM mirror for a render where that pass never ran). Pure apart from the tokens or nodes
 * it is handed.
 */
'use strict';

const BIND_CLASS = 'lat-icon-bind';
const BIND_OPEN = `<span class="${BIND_CLASS}">`;

/** How many leading characters of `text` bind to an icon before it: one space and the word after it, or 0. */
function bindLength(text) {
  const m = typeof text === 'string' ? /^[  ][^\s]+/.exec(text) : null;
  return m ? m[0].length : 0;
}

/** Is this rendered inline HTML an icon? */
function isIconHtml(html) {
  return typeof html === 'string' && html.startsWith('<span class="lat-icon"');
}

/**
 * markdown-it: in an inline token's children, wrap each icon (an `html_inline` child `isIconHtml` accepts) and the
 * word the next text child opens with. `Token` is the markdown-it token class (`state.Token`).
 */
function bindMarkdownIt(children, Token) {
  for (let i = 0; i < children.length; i++) {
    const icon = children[i];
    const next = children[i + 1];
    if (icon.type !== 'html_inline' || !isIconHtml(icon.content) || next?.type !== 'text') continue;
    const n = bindLength(next.content);
    if (!n) continue;
    icon.content = BIND_OPEN + icon.content;
    const word = new Token('text', '', 0);
    word.content = next.content.slice(0, n);
    const close = new Token('html_inline', '', 0);
    close.content = '</span>';
    next.content = next.content.slice(n);
    children.splice(i + 1, 0, word, close);
    i += 2;
  }
}

/** DOM: wrap an icon element just placed and the word its next text node opens with. */
function bindElement(icon) {
  const next = icon?.nextSibling;
  if (!next || next.nodeType !== 3 || icon.parentNode?.classList?.contains(BIND_CLASS)) return null;
  const n = bindLength(next.data);
  if (!n) return null;
  const doc = icon.ownerDocument;
  const span = doc.createElement('span');
  span.className = BIND_CLASS;
  icon.replaceWith(span);
  span.appendChild(icon);
  span.appendChild(doc.createTextNode(next.data.slice(0, n)));
  next.data = next.data.slice(n);
  if (!next.data) next.remove();
  return span;
}

module.exports = { BIND_CLASS, bindLength, isIconHtml, bindMarkdownIt, bindElement };
