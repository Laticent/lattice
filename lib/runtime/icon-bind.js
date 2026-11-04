/** lib/runtime/icon-bind.js — the DOM adapter of lib/core/icon-bind.js (the rule and why live there). */


const { BIND_CLASS, BIND_WORD } = require('../core/icon-bind.js');

/** Wrap an icon element just placed and the word its next text node opens with; null when nothing binds. */
module.exports = function bindIconWord(icon) {
  const next = icon.nextSibling;
  const m = next?.nodeType === 3 && !icon.parentNode.classList?.contains(BIND_CLASS) && BIND_WORD.exec(next.data);
  if (!m) return null;
  const span = icon.ownerDocument.createElement('span');
  span.className = BIND_CLASS;
  icon.replaceWith(span);
  span.append(icon, m[0]);
  next.data = next.data.slice(m[0].length);
  if (!next.data) next.remove();
  return span;
};
