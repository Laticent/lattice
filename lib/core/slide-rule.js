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
 * Is `token` a SYNTHETIC slide boundary — one the ENGINE inserted, rather than a
 * separator the author typed?
 *
 * `split: headings` (the default) injects an `hr` before every second-or-later
 * top-level heading in a slide, so one authored slide can render as several
 * sections. To the parser those breaks are indistinguishable from a typed `---`,
 * and that is exactly the problem: anything numbering the sections afterwards
 * counts a synthetic break as a new slide and shifts every number after it.
 *
 * The fix is that the splitter SAYS SO at the moment it splits, and this is the
 * predicate that reads it back. A page of a divided slide then keeps its parent's
 * authored number — 2.1 and 2.2 are both slide 2 — so a reader view that says
 * "show slides 1 and 3" still means it however the deck happened to paginate.
 * (`lib/core/auto-split.js` marks the same thing its own way, with
 * `data-split-run`, because it divides the rendered DOM rather than the tokens.)
 *
 * ONE PATH DELIBERATELY FLATTENS THIS, and it is not a leak. Export-to-Marp
 * (`lib/core/bake-splits.js`) rewrites the SOURCE so these boundaries become literal
 * `---`, because a baked deck has to divide identically in vanilla Marp with no
 * dependency on our splitter. A baked deck therefore genuinely HAS more authored
 * slides, and numbers them accordingly — which is right, not lossy: it is a different
 * deck. A reader view carried into that deck would not silently mis-project either,
 * because its approval hash covers the member bodies and no longer matches, so the
 * export refuses with `drifted` rather than guessing.
 */
function isSyntheticSlideRule(token) {
  return isSlideRule(token) && !!token.meta?.latticeContinuation;
}

/**
 * For each group `groupOnSlideRule` returns, whether it CONTINUES the previous
 * group's authored slide rather than starting a new one. `flags[0]` is always
 * false: the first group cannot continue anything.
 *
 * Aligned 1:1 with that function's output — callers that drop the leading empty
 * group must drop `flags[0]` alongside it, or the two go out of step, which is the
 * same off-by-one this exists to remove.
 */
function continuationFlags(tokens) {
  const flags = [false];
  for (const t of tokens) if (isSlideRule(t)) flags.push(isSyntheticSlideRule(t));
  return flags;
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

module.exports = { isSlideRule, isSyntheticSlideRule, continuationFlags, groupOnSlideRule };
