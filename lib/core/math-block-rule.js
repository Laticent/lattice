/**
 * lib/core/math-block-rule.js
 *
 * The `$$…$$` DISPLAY-MATH block ruler, split out from the KaTeX plugin so the
 * grammar has one definition and no rendering dependency.
 *
 * WHY IT LIVES HERE AND NOT IN lib/engine/math.js. Two kinds of consumer need
 * this rule for two different reasons:
 *
 *   1. The RENDERER needs it to produce math (lib/engine/math.js installs it and
 *      attaches a `katex.renderToString` renderer rule on top).
 *   2. The BOUNDARY parsers need it to NOT produce a slide break
 *      (lib/core/boundary-parser.js). A `$$` block is opaque to markdown-it's
 *      other block rules only while this ruler is installed; without it, the
 *      body is parsed as ordinary Markdown — and LaTeX is full of lines that
 *      look like Markdown structure. The real case, live in the committed
 *      corpus (`lib/components/math/math/math.gallery.md`):
 *
 *        $$
 *        \begin{pmatrix} 2 & 1 \\ 4 & 3 \end{pmatrix}
 *        =
 *        \begin{pmatrix} 1 & 0 \\ 2 & 1 \end{pmatrix}
 *        $$
 *
 *      The lone `=` is a SETEXT H1 underline to a parser that cannot see the
 *      math block. In a `split: headings` deck that heading is a slide boundary,
 *      so the source-side splitter cut one rendered slide into two and every
 *      byte after the equation was attributed to a slide that does not exist —
 *      including a `_class:` lookup, which then came back empty and baked the
 *      diagram in the wrong band.
 *
 * The rule pushes a token and nothing else, so it is pure and dependency-free:
 * `require('katex')` stays in lib/engine/math.js, where the renderer is.
 *
 * Scope note: only `$$`. Inline `$…$` cannot span a block boundary and so cannot
 * hide one; the inline ruler stays in lib/engine/math.js with its renderer.
 */

/**
 * markdown-it block rule: a run of lines opening with `$$` and closing on a line
 * ending `$$`. Registered as `math_block`; emits a `math_block` token whose
 * `content` is the TeX source with the delimiters stripped.
 */
function mathBlockRule(state, startLine, endLine, silent) {
  const begin = state.bMarks[startLine] + state.tShift[startLine];
  const firstLine = state.src.slice(begin, state.eMarks[startLine]);
  if (!firstLine.startsWith('$$')) return false;
  let line = startLine;
  let content = firstLine.slice(2);
  let closed = content.trim().endsWith('$$');
  if (closed) content = content.trim().slice(0, -2);
  while (!closed && line < endLine) {
    line += 1;
    const text = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
    if (text.trim().endsWith('$$')) {
      content += `\n${text.trim().slice(0, -2)}`;
      closed = true;
    } else {
      content += `\n${text}`;
    }
  }
  if (!closed) return false;
  if (silent) return true;
  const token = state.push('math_block', 'div', 0);
  token.block = true;
  token.content = content.trim();
  token.markup = '$$';
  token.map = [startLine, line + 1];
  state.line = line + 1;
  return true;
}

/**
 * Install the rule on a markdown-it instance.
 *
 * `.before('fence')` is the position lib/engine/math.js has always used, and it is
 * kept so the two installs are the same call — but it is NOT load-bearing, and an
 * earlier version of this comment claimed it was ("the fence rule would otherwise
 * claim a `$$` block whose body contains one"). It cannot: markdown-it's `fence`
 * rule keys on the OPENING line starting with ``` or `~~~`, so it never sees a `$$`
 * opener whichever order the two run in. Checked `before` against `after` on
 * `$$`-wrapping-a-fence, a fence-wrapping-`$$`, and every committed Markdown file:
 * zero token-stream differences. Stated plainly because a comment asserting a
 * reason that isn't true is the exact failure this module was extracted to fix.
 */
function installMathBlockRule(md) {
  md.block.ruler.before('fence', 'math_block', mathBlockRule);
}

module.exports = { mathBlockRule, installMathBlockRule };
