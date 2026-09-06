/**
 * The decks we SHIP, and the inline-code spans inside them — shared by the census
 * tests that hold the inline directive grammar to the corpus it actually reads.
 *
 * WHY A HELPER. Two tests walk the same corpus for different shapes: the eyebrow /
 * subtitle census (`test/unit/css/eyebrow-position-shadow.test.js`) looks for code-only
 * PARAGRAPHS, and the collision census (`test/unit/core/inline-code-corpus-census.test.js`)
 * looks for every inline SPAN. A second copy of "which files are decks" drifts the moment
 * a deck directory is added, and then one census silently stops covering it.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const MarkdownIt = require('markdown-it');

/** A PLAIN parser — see `inlineSpans`. The engine's has the pill plugin installed. */
const md = new MarkdownIt();

const ROOT = path.join(__dirname, '..', '..');

/**
 * Every markdown file that is a DECK we ship — the ones a reader sees and the ones we
 * hold to our own bar. Deliberately not every `*.md`: a `*.docs.md` is prose ABOUT a
 * component and is never projected, and `engineering/` is a written record, so a
 * `{LABEL}` in either renders nowhere.
 */
function shippedDecks() {
  const out = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(
    (f) =>
      f.startsWith('examples/') ||
      f.startsWith('kit/') ||
      f.endsWith('.gallery.md') ||
      f.startsWith('test/integration/baseline-decks/'),
  );
}

/** A line that opens or closes a fenced block — its contents are code, not prose. */
const FENCE = /^\s*(```|~~~)/;

/**
 * Every inline-code span in a deck, with the line it sits on.
 *
 * IT ASKS A PARSER, NOT A REGEX, and the first cut did the opposite — which left the
 * census with two blind spots that render as pills TODAY:
 *
 *   ``{LIVE}``        a double-backtick span. CommonMark's double form is for embedding a
 *                     backtick, not for asking to be left alone, and the grammar's
 *                     double-backtick special case was REMOVED when the escape became a
 *                     backslash (`lib/core/inline-code-directives.js`) — so this dispatches
 *                     exactly like the single form. Measured: `<span class="lat-pill">LIVE</span>`.
 *   `{AB\nCD}`        a span that wraps across a source line. CommonMark joins the lines
 *                     with a space, so this dispatches as the label `AB CD`. Measured.
 *
 * A line-at-a-time regex sees neither, and planting both in a shipped deck left the census
 * GREEN. Neither shape occurs in the corpus today, so the conclusion held — but a gate that
 * only catches the shapes its author thought of is the thing this census exists to replace.
 *
 * markdown-it is the parser the engine itself runs on, so fenced blocks, indented code and
 * HTML comments fall out for free rather than needing a rule each. A PLAIN instance
 * deliberately: the engine's configured one has the pill plugin installed, which would
 * consume the very tokens this walks.
 *
 * THE LINE NUMBER IS THE BLOCK'S FIRST LINE, not the span's. markdown-it carries `map` on
 * block tokens and not on inline children, so a span in a wrapped paragraph reports the
 * paragraph's opening line. That is close enough to find it by hand and honest about being
 * approximate — the failure message says so.
 *
 * @returns {{file:string, line:number, text:string}[]}
 */
function inlineSpans(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const found = [];
  let blockLine = 1;
  for (const token of md.parse(src, {})) {
    if (Array.isArray(token.map)) blockLine = token.map[0] + 1;
    if (token.type !== 'inline' || !Array.isArray(token.children)) continue;
    for (const child of token.children) {
      if (child.type === 'code_inline') found.push({ file, line: blockLine, text: child.content });
    }
  }
  return found;
}

module.exports = { ROOT, shippedDecks, inlineSpans, FENCE };
