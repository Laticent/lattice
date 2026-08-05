/**
 * lib/core/slide-rule.js
 *
 * WHERE DOES A SLIDE END — one predicate, for every module that has to know.
 *
 * A slide boundary is a TOP-LEVEL thematic break: an `hr` token at nesting level
 * 0. The `level === 0` half is the whole content of this module, and it is not a
 * detail. markdown-it emits an `hr` token for a `---` wherever it appears —
 * including inside a blockquote or a list item, where it is a horizontal rule the
 * author drew INSIDE a slide, not a break between two. `splitOnHr`
 * (lib/engine/slides.js), which is the rule that actually decides slides, has
 * always carried the guard.
 *
 *     if (t.type === 'hr' && t.level === 0)     ← the slide rule
 *     if (t.type === 'hr')                      ← every horizontal rule in the deck
 *
 * Six places asked the question and one asked it without the guard: `focusSteps`
 * (lib/integrations/markdown-it/plugins.js), which groups the token stream into
 * slides before expanding a `_focusSteps` walk. A focus slide containing a nested
 * `---` therefore expanded into one section too many, breaking the 1:N
 * correspondence every section-indexing consumer downstream depends on — the
 * pagination count, the PPTX one-image-per-slide path, and the source-side band
 * reconstruction's slide-count parity (#1387, surfaced by the #1374 gate).
 *
 * The predicate is shared rather than re-spelled because that is the difference
 * that let it drift: five correct copies and one incorrect one are
 * indistinguishable by reading, and identical by intent.
 *
 * Pure and dependency-free (it takes a token, not a parser), so it bundles
 * everywhere its callers do.
 */

/**
 * Is `token` a SLIDE BOUNDARY — a top-level thematic break?
 *
 * Deliberately not a duck-type on `type` alone: a nested `hr` is a real, rendered
 * horizontal rule, and treating it as a boundary invents a slide.
 */
function isSlideRule(token) {
  return !!token && token.type === 'hr' && token.level === 0;
}

/**
 * Group a flat token stream into per-slide runs on the slide rule. The separator
 * tokens are DROPPED (they belong to neither neighbor), and a leading rule yields
 * an empty first group — callers differ on what to do with that, so this does not
 * decide it:
 *
 *   · `splitOnHr` DROPS an empty first group, because front matter is already
 *     stripped by the time it runs, so an empty leading group means the body
 *     opened with a `---` and Marpit makes no slide for it.
 *   · `focusSteps` KEEPS it, because it reassembles the stream with fresh `hr`
 *     separators — dropping the group would delete the author's leading `---`.
 */
function groupOnSlideRule(tokens) {
  const groups = [[]];
  for (const t of tokens) {
    if (isSlideRule(t)) groups.push([]);
    else groups[groups.length - 1].push(t);
  }
  return groups;
}

module.exports = { isSlideRule, groupOnSlideRule };
