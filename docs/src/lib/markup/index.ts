/**
 * @laticent/markup — balanced-HTML string walking: the pieces of markup handling that more than one consumer needs
 * and that read only the string they are given. No DOM, no Node, no dependencies.
 */
export { findMatchingClose } from './close.js';
export { splitCodeLines } from './code-lines.js';
export { escapeAttr, escapeHtml } from './escape.js';
export { extractFirstList, parseTopLevelLis } from './lists.js';
export { plainText, removeTags, stripTags } from './text.js';
