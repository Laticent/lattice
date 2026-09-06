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
 * Every SINGLE-backtick inline span in a deck, with the line it sits on.
 *
 * Single-backtick only, because that is what the grammar reads: a `` ``…`` `` run is
 * CommonMark's form for embedding a backtick, and the double-backtick special case was
 * removed when the escape became a backslash (`lib/core/inline-code-directives.js`).
 * Fenced blocks are skipped — their contents are never inline code.
 *
 * @returns {{file:string, line:number, text:string}[]}
 */
function inlineSpans(file) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const found = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (FENCE.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const re = /(^|[^`])`([^`\n]+)`([^`]|$)/g;
    let m;
    // Step back one character each iteration: `a` and `b` on one line share the
    // character between them, and a plain exec walk would see only the first.
    while ((m = re.exec(line))) {
      found.push({ file, line: i + 1, text: m[2] });
      re.lastIndex -= 1;
    }
  }
  return found;
}

module.exports = { ROOT, shippedDecks, inlineSpans, FENCE };
