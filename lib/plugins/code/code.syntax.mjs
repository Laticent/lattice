/**
 * lib/plugins/code/code.syntax.mjs — the code plugin's GRAMMAR: the `@code{…}` record line.
 *
 * A paragraph that is exactly one inline code span, `` `@code{…}` ``, directly above a fence
 * (blank lines between are allowed) is the fence's configuration, not text: this block rule claims
 * the line as a hidden `code_record` token, and the code renderer reads it from the token before
 * the fence (code.render.js). Anywhere else (in a sentence, before a heading) the line is not
 * claimed, so it renders as the inline code it is, and `lint:deck` says it configures nothing.
 *
 * Claiming it in the PARSER rather than after the render is what keeps the two layouts that read
 * a lone inline-code paragraph as a caption — `code` and `compare-code` — unaffected: a record
 * never becomes a `<p><code>` for them to mistake for a label (engineering/decisions/
 * 2026-10-15-code-plugin.md §7). Pure: no library import, as every syntax module.
 */

/** The record line: one inline code span holding `@code{…}`, and nothing else on the line. */
const RECORD_LINE = /^`(@code\{[^`\n]*\})`[ \t]*$/;
/** A fence opener, as CommonMark reads one: three or more backticks or tildes. */
const FENCE_OPEN = /^(`{3,}|~{3,})/;

export function codeRecordRule(state, startLine, endLine, silent) {
  // An indented line is an indented code block, not a record.
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const begin = state.bMarks[startLine] + state.tShift[startLine];
  if (state.src.charCodeAt(begin) !== 0x60 /* ` */) return false;
  const m = RECORD_LINE.exec(state.src.slice(begin, state.eMarks[startLine]));
  if (!m) return false;
  // The next non-blank line must open a fence at the same indentation.
  let next = startLine + 1;
  while (next < endLine && state.isEmpty(next)) next += 1;
  if (next >= endLine || state.sCount[next] !== state.sCount[startLine]) return false;
  const nextBegin = state.bMarks[next] + state.tShift[next];
  if (!FENCE_OPEN.test(state.src.slice(nextBegin, state.eMarks[next]))) return false;
  if (silent) return true;
  const token = state.push('code_record', '', 0);
  token.block = true;
  token.hidden = true;
  token.content = m[1];
  token.map = [startLine, startLine + 1];
  state.line = startLine + 1;
  return true;
}

/** Errs toward true: a false positive costs nothing, the plugin is on by default. */
export function detect(src) {
  return typeof src === 'string' && src.includes('`@code{');
}

export { codeRecordRule as code_record };
