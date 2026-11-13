/**
 * lib/core/fence-ranges.mjs
 *
 * The character ranges of a text's fenced code blocks (``` and ~~~), by CommonMark's opener and closer rules. A leaf,
 * so a reader on the engine's side (the slide-metadata door, lib/core/meta-door.mjs) and one on the linter's side
 * (lib/core/meta-record.mjs) share it without either reaching the other's parser (tools/build-playground.js
 * `assertLintParserIsolated`). Pure and dependency-free past the fence opener.
 */

import fenceOpenerCjs from './fence-opener.js';

// A CommonJS module: the docs dev server's shim gives it a default export only (vite-cjs-lib-dev.mjs).
const { fenceOpener } = fenceOpenerCjs;

/** The column a line's leading whitespace reaches; a tab advances to the next multiple of four. */
export function indentWidth(ws) {
  let col = 0;
  for (const ch of ws) col = ch === '\t' ? col + 4 - (col % 4) : col + 1;
  return col;
}

/**
 * Char ranges `[start, end)` covered by fenced code blocks (``` / ~~~). An unterminated fence masks
 * to the end of the string, as a renderer reads it. A CLOSER may be indented at most three columns
 * past the container the fence sits in (CommonMark §4.5), so it is bounded at the opener's column
 * plus three: exact at top level, never too tight inside a list item.
 * @param {string} text
 * @returns {Array<[number, number]>}
 */
export function fenceRanges(text) {
  const ranges = [];
  const src = String(text ?? '');
  let pos = 0;
  let open = null;
  for (const line of src.split('\n')) {
    const lineStart = pos;
    const lineEnd = pos + line.length;
    const fm = fenceOpener(line, 'blank');
    if (fm) {
      const indent = indentWidth(fm[1]);
      const char = fm[2][0];
      const len = fm[2].length;
      if (!open) open = { char, len, start: lineStart, maxCloseIndent: indent + 3 };
      else if (open.char === char && len >= open.len && fm[3].trim() === '' && indent <= open.maxCloseIndent) {
        ranges.push([open.start, lineEnd]);
        open = null;
      }
    }
    pos = lineEnd + 1; // + the '\n'
  }
  if (open) ranges.push([open.start, src.length]);
  return ranges;
}
