// The authoring cores' view of where a slide begins — a thin adapter over the ONE
// derivation, `lib/core/slide-boundaries.mjs`.
//
// WHAT THIS USED TO BE, and why it is not that any more. It started from
// `source.split(/^---$/m)` and re-merged the chunks whose boundary `---` had fallen
// inside a code fence, which fixed the one divergence anybody had noticed: a `---`
// in a Markdown or YAML sample was being read as a slide break, so every slide
// number after it desynced and the Coach's per-finding AI fix targeted the wrong
// slide.
//
// It left five more. The engine breaks a slide on EVERY top-level markdown-it `hr`,
// and `/^---$/m` matches only a bare run of exactly three hyphens with nothing after
// it, so `***`, `___`, `- - -`, `----`, `--- ` with a trailing space and a `---`
// indented one to three spaces were all invisible here and all slide breaks there.
// In the other direction `/^---$/m` split on a setext underline (`Interlude` over
// `---`), which the engine renders as a HEADING — and on a U+2028, which JavaScript's
// `m` flag treats as a line terminator and markdown-it does not.
//
// `slideBoundaries` answers all of it the way the renderer does, so the functions
// below are packaging: they keep the CHUNK MODEL every caller is written against
// (front matter occupies the first two chunks; `fmChunks()` counts past them) and
// nothing else. See engineering/decisions/2026-08-05-slide-boundary-reconciliation.md.

const { slideBoundaries, splitSlideChunks } = require('../core/slide-boundaries.mjs');

// The front-matter block, spelled as every authoring core spells it.
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;

/**
 * Does `text` carry a code fence that never closes?
 *
 * Asked directly rather than inferred from a boundary scan's "reason" slot. The
 * scanner this module used to call reported one reason per scan, first-write-wins,
 * so an earlier note could MASK an unclosed fence and this predicate returned
 * false on a body that had one — defeating the guard that stops a spliced fence
 * from swallowing the deck's next separator (red team, #1271). A fence is a
 * property of the text; read it from the text.
 */
function fenceOpen(text) {
  let marker = null;
  let len = 0;
  for (const line of String(text ?? '').split('\n')) {
    const m = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (!marker) {
      if (m) { marker = m[1][0]; len = m[1].length; }
    } else if (m && m[1][0] === marker && m[1].length >= len && /^[ \t]{0,3}[`~]+[ \t]*$/.test(line)) {
      marker = null;
      len = 0;
    }
  }
  return marker !== null;
}

/**
 * Split `source` into the chunk list the authoring cores index into: an empty chunk
 * and the YAML body when the deck has front matter, then one chunk per rendered
 * slide.
 *
 * The front-matter chunks are RECONSTRUCTED rather than scanned for, because the
 * boundary scanner must never look inside front matter — a YAML block's closing
 * `---` is a thematic break to anything that reads it, and its opening `---` makes
 * the first key a setext heading.
 */
function splitTopLevel(source) {
  const src = String(source || '');
  const fm = FRONT_MATTER.exec(src);
  if (!fm) return splitSlideChunks(src).chunks;
  const yaml = fm[0].replace(/^---\r?\n/, '').replace(/\r?\n---[ \t]*(\r?\n|$)/, '');
  return ['', yaml, ...splitSlideChunks(src.slice(fm[0].length)).chunks];
}

/**
 * The line indices that divide `lines` into those same chunks — the line-based analog
 * of `splitTopLevel`, for consumers that walk lines (the autofix chunk scope).
 *
 * The front matter's own two `---` lines are INCLUDED. They are not slide boundaries
 * — nothing renders between them — but they are what produces the leading `['', yaml]`
 * chunks, and every index calculation downstream is written against that shape. Both
 * functions read one derivation, so a line walk and a chunk split cannot disagree
 * about where a boundary is.
 */
function separatorLines(lines) {
  const all = Array.isArray(lines) ? lines : [];
  const src = all.join('\n');
  const fm = FRONT_MATTER.exec(src);
  const set = new Set();
  let skip = 0;
  if (fm) {
    skip = fm[0].replace(/\n$/, '').split('\n').length;
    set.add(0);
    set.add(skip - 1);
  }
  // The SAME leading-empty rule the chunk split applies, so a line walk and a chunk
  // split cannot land on different slide numbers (the desync the red team found).
  const body = fm ? src.slice(fm[0].length) : src;
  const bodyLines = body.split('\n');
  let seps = slideBoundaries(body).lines;
  if (seps.length && bodyLines.slice(0, seps[0]).join('\n').trim() === '') seps = seps.slice(1);
  for (const ln of seps) set.add(ln + skip);
  return set;
}

module.exports = { splitTopLevel, fenceOpen, separatorLines };
