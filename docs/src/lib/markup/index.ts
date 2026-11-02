/**
 * @laticent/markup — balanced-HTML string walking: the pieces of markup handling that more than one consumer needs
 * and that read only the string they are given. No DOM, no Node, no dependencies.
 */
export { findMatchingClose } from './close.js';
export { splitCodeLines } from './code-lines.js';
export { escapeAttr, escapeHtml } from './escape.js';
export { extractFirstList, parseTopLevelLis } from './lists.js';
export type { SectionRewrite } from './section-walk.js';
export { mapSectionHtml, mapSections, readAttr, readClassAttr } from './section-walk.js';
export type { SectionPiece } from './sections.js';
export { splitSections, unclosedSectionAt, withClass } from './sections.js';
export type { ScanToken, TopLevelElement, TopLevelHit } from './tags.js';
export {
  findFirstTag,
  findTopLevelH2,
  findTopLevelTag,
  hasTopLevelTag,
  maskInert,
  readTopLevelH2Text,
  scanTags,
  stripScannedTags,
  topLevelElements,
} from './tags.js';
export { plainText, removeTags, stripTags } from './text.js';
