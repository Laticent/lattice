/**
 * Let a RAWTEXT block close on `</style >` — an end tag with whitespace before its `>`.
 *
 * markdown-it's `html_block` rule (condition 1 of CommonMark §4.6) opens on `<script`, `<pre`,
 * `<style` or `<textarea` and ends on the first line that contains the literal `</style>`.
 * `</style >` is a legal end tag to every browser (the HTML tokenizer skips whitespace after the
 * tag name), but it is not that literal, so the block runs on, swallows the next `---`, and two
 * authored slides render as one (#2052).
 *
 * CommonMark's reference implementation behaves the same way, so this is a deliberate divergence
 * from the spec, not a markdown-it bug. It is narrow: the rule claims ONLY a condition-1 opener,
 * ends on `</name[\t\n\f ]*>`, and otherwise does what upstream does (same indent check, same
 * terminator flag, same token). Every other HTML block falls through to upstream's `html_block`.
 *
 * It lives in this package, not `lib/core`, because the docs site's Compose tokenizer needs it as well
 * as the engine, and a package is the one home both can import. It imports nothing: it is handed the
 * markdown-it instance and its block state. Every parser that places a block installs it — see
 * `lib/core/rawtext-close.mjs` for the list — and the Segno deck model carries the same close in
 * its own `HTML_SEQUENCES` table.
 */

const RAWTEXT_OPEN = /^<(script|pre|style|textarea)(?=(\s|>|$))/i;

/**
 * The close, with the whitespace an HTML end tag may carry before `>`: tab, LF, FF and space, the
 * HTML tokenizer's set. Not JS `\s`, which also takes NBSP and U+2028 that a browser does NOT skip
 * there, so a parser boundary the browser does not see would be the same defect reversed.
 */
export const RAWTEXT_CLOSE = /<\/(script|pre|style|textarea)[\t\n\f ]*>/i;

// biome-ignore lint/suspicious/noExplicitAny: markdown-it's StateBlock is loosely typed upstream.
type State = any;
// biome-ignore lint/suspicious/noExplicitAny: a markdown-it instance; this package takes no dependency on its types.
type Md = any;

function rawtextBlock(state: State, startLine: number, endLine: number, silent: boolean): boolean {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (!state.md.options.html) return false;
  if (state.src.charCodeAt(pos) !== 0x3c /* < */) return false;
  let lineText = state.src.slice(pos, max);
  if (!RAWTEXT_OPEN.test(lineText)) return false;
  // Condition 1 may interrupt a paragraph, as upstream's sequence table says.
  if (silent) return true;

  let nextLine = startLine + 1;
  if (!RAWTEXT_CLOSE.test(lineText)) {
    for (; nextLine < endLine; nextLine++) {
      // An outdented BLANK line does not end it: condition 1 ends only on its close (markdown-it 14.3).
      if (state.sCount[nextLine] < state.blkIndent && !state.isEmpty(nextLine)) break;
      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];
      lineText = state.src.slice(pos, max);
      if (RAWTEXT_CLOSE.test(lineText)) {
        if (lineText.length !== 0) nextLine++;
        break;
      }
    }
  }
  state.line = nextLine;
  const token = state.push('html_block', '', 0);
  token.map = [startLine, nextLine];
  token.content = state.getLines(startLine, nextLine, state.blkIndent, true);
  return true;
}

/** Install the rule as `rawtext_block`, just ahead of upstream's `html_block`, with the same `alt` chains. Returns `md`. */
export function tolerateRawtextClose<T extends Md>(md: T): T {
  (md as Md).block.ruler.before('html_block', 'rawtext_block', rawtextBlock, { alt: ['paragraph', 'reference', 'blockquote'] });
  return md;
}
