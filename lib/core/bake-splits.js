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
 * The token stream comes from the SHARED boundary parser (lib/core/boundary-parser.js),
 * configured from the engine's own options rather than re-declared here — the
 * comment that used to sit on a local `new MarkdownIt` claiming it "mirrors the
 * lib/engine parser" was not true, and could not be made true by a comment.
 *
 * Pure (no fs); takes the full deck source string, returns the rewritten source.
 */

const { boundaryParser: md, FRONT_MATTER, normalizeSource } = require('./boundary-parser');
const { headingSplitPoints } = require('./heading-split-core');
const { resolveSplitMode } = require('./resolve-split');

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
  // Normalized at the door, like the engine's own: this returns rewritten SOURCE,
  // so folding CRLF / lone CR / a BOM here costs no caller an offset. A BOM'd deck
  // otherwise baked its front matter as a slide and exported 4 where Lattice renders 2.
  const src = normalizeSource(source);
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

// A panes deck's markers (lib/core/pane-spec.js): the carve reads a top-level comment block that
// holds nothing but one of them.
const { PANE_RE, PANES_RE } = require('./pane-spec');

/**
 * Export-to-Marp's pane bake: replace every top-level pane marker (`<!-- pane: X -->`) and layout
 * line (`<!-- panes: 35/65 -->`) with an inert separator, so a panes slide reaches Marp as its two
 * panes' content, stacked.
 *
 * Marp has no carve, and it turns every HTML comment that is not one of its own directives into a
 * SPEAKER NOTE, so each marker used to arrive in the presenter's notes as "pane: list". A marker
 * is found the way the carve finds it — a whole top-level `html_block` on the shared boundary
 * parser — so a marker quoted in a code sample or indented under a list item is left as written.
 * Run it AFTER `bakeSplits`: the engine's heading split reads the markers as lead-in comments, so
 * the boundaries are the engine's only while they are still there. Pure; returns the full source.
 */
function stripPaneMarkers(source) {
  // A deck with no marker comes back exactly as it went in; one with markers comes back
  // LF-normalized, like `bakeSplits`, whose output it is always handed.
  if (!String(source ?? '').includes('pane')) return source;
  const src = normalizeSource(source);
  const fmMatch = src.match(FRONT_MATTER);
  const fm = fmMatch ? fmMatch[0] : '';
  const body = fmMatch ? src.slice(fm.length) : src;
  const drop = new Set();
  for (const t of md.parse(body, {})) {
    if (t.type !== 'html_block' || t.level !== 0 || !Array.isArray(t.map)) continue;
    const text = t.content.trim();
    if (PANE_RE.test(text) || PANES_RE.test(text)) for (let l = t.map[0]; l < t.map[1]; l++) drop.add(l);
  }
  if (!drop.size) return source;
  // A run of marker lines becomes ONE comment Marp neither prints nor keeps as a note, because a
  // marker was also a SEPARATOR: dropped outright, pane A's list and pane B's list closed up into
  // one list in marp-cli (both of examples/panes.md's list-beside-list slides did). Marpit skips
  // markdownlint's magic comments when it collects notes, and `markdownlint-capture` is the one
  // that does nothing on its own (it saves state; only a `restore` would read it).
  const out = [];
  body.split('\n').forEach((line, i) => {
    if (!drop.has(i)) out.push(line);
    else if (!drop.has(i - 1)) out.push(MARP_SEPARATOR);
  });
  return fm + out.join('\n');
}
const MARP_SEPARATOR = '<!-- markdownlint-capture -->';

module.exports = { bakeSplits, stripPaneMarkers };
