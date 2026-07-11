/**
 * lib/core/bake-splits.js
 *
 * Export-to-Marp's split baker: rewrite a Lattice deck's source so the slide
 * boundaries the `split: headings` divider computes LIVE are materialized as
 * literal `---` thematic breaks. A baked deck divides identically in any vanilla
 * Marp tool (marp-cli, marp-vscode) with no dependency on our splitter — which
 * is exactly what makes "Marp is an export target" portable.
 *
 * Parity is structural, not by luck: the boundary positions come from the SAME
 * `headingSplitPoints` (lib/core/heading-split-core.js) the live `headingSplit`
 * plugin uses. `test/unit/parsing/bake-splits.test.js` asserts that a baked deck
 * rendered in `rule` mode produces the identical slides as the original rendered
 * in `headings` mode, across the committed corpus.
 *
 * Pure (no fs); takes the full deck source string, returns the rewritten source.
 */

const MarkdownIt = require('markdown-it');
const { headingSplitPoints } = require('./heading-split-core');
const { resolveSplitMode } = require('./resolve-split');

// commonmark + html:true mirrors the lib/engine parser, so the token stream the
// baker reasons over matches what the renderer splits (html_block comments with
// line maps, eyebrow paragraphs, top-level headings).
const md = new MarkdownIt('commonmark', { html: true });

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

/** Strip a `split:` line from a front-matter block (we re-state it explicitly). */
function stripSplitLine(fm) {
  return fm.replace(/^[ \t]*split:[^\n]*\r?\n/m, '');
}

/**
 * Bake `split: headings` boundaries into literal `---`. Returns the rewritten
 * full source (front matter + body). For a `rule` deck (or one with no headings
 * boundaries) the body is returned unchanged. The exported front matter is set
 * to `split: rule` so the baked separators are authoritative and a re-import
 * never re-splits. `opts.override` forces a mode (mirrors resolveSplitMode).
 */
function bakeSplits(source, opts = {}) {
  const src = typeof source === 'string' ? source : '';
  const fmMatch = src.match(FRONT_MATTER);
  const fm = fmMatch ? fmMatch[0] : '';
  const body = fmMatch ? src.slice(fm.length) : src;
  const mode = resolveSplitMode(src, opts.override);

  let outBody = body;
  if (mode === 'headings') {
    const tokens = md.parse(body, {});
    const points = headingSplitPoints(tokens);
    // Each point is a token index; its block start line (token.map[0], 0-based)
    // is where a `---` must go. Insert descending so earlier line indices stay
    // valid. A blank line brackets the `---` so it can't be read as a setext
    // underline of the preceding paragraph.
    const lineSet = [...new Set(
      points.map((i) => (tokens[i]?.map ? tokens[i].map[0] : null))
        .filter((n) => n != null),
    )].sort((a, b) => b - a);
    if (lineSet.length) {
      const lines = body.split('\n');
      for (const ln of lineSet) lines.splice(ln, 0, '', '---', '');
      outBody = lines.join('\n');
    }
  }

  if (!fm) {
    // No front matter: only add one if we actually baked separators.
    return outBody === body ? src : `---\nmarp: true\nsplit: rule\n---\n\n${outBody.replace(/^\n+/, '')}`;
  }
  // Re-state split: rule in the existing block (the baked `---` are authoritative).
  const stripped = stripSplitLine(fm).replace(/\r?\n---\r?\n$/, '\nsplit: rule\n---\n');
  return stripped + outBody;
}

module.exports = { bakeSplits };
