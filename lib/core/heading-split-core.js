/**
 * lib/core/heading-split-core.js
 *
 * The pure boundary computation for the `split: headings` divider — the SINGLE
 * source of truth shared by two consumers so they can never drift:
 *
 *   1. `headingSplit` (lib/integrations/markdown-it/plugins.js) — injects `hr` tokens
 *      at these boundaries, live, in every render path.
 *   2. `bakeSplits` (lib/core/bake-splits.js) — materializes the SAME boundaries
 *      as literal `---` in exported source (Export to Marp), so a portable deck
 *      splits identically in any vanilla Marp tool.
 *
 * Given a markdown-it block-token stream, `headingSplitPoints` returns the token
 * indices at which a new slide begins: before every h1/h2 that is the
 * SECOND-or-later top-level heading in its slide, PULLED BACK over that heading's
 * lead-in (its `<!-- _key -->` directive comments + its eyebrow paragraph) so the
 * lead-in travels onto the new slide instead of orphaning onto the previous one.
 * A top-level `hr` (`---`) resets the per-slide heading state (hybrid).
 *
 * Pure + dependency-free (operates on already-parsed tokens), so it bundles into
 * the browser runtime and is unit-testable in isolation.
 */

/**
 * A `<!-- … -->` directive/comment token. The owned engine + plain-markdown-it
 * paths (the only render paths) leave these as an `html_block` (or
 * `html_inline`). Matching both keeps the boundary computation identical across
 * render paths and the export baker.
 */
const { isSlideRule } = require('./slide-rule');

function isCommentToken(t) {
  if (!t) return false;
  return (t.type === 'html_block' || t.type === 'html_inline')
    && /^<!--[\s\S]*-->$/.test((t.content || '').trim());
}

/**
 * An eyebrow's inline token. An eyebrow is not a special construct — it's a
 * plain paragraph whose ONLY child is one inline-`code` span, which the base CSS
 * styles via the adjacency rule `p:has(> code:only-child) + h1/h2`. Match that
 * exact shape so the splitter's notion of an eyebrow is identical to the one the
 * renderer styles — no looser, no stricter.
 */
function isEyebrowInline(t) {
  return !!t && t.type === 'inline'
    && Array.isArray(t.children) && t.children.length === 1
    && t.children[0].type === 'code_inline';
}

/**
 * Compute the slide-boundary insertion points for `split: headings`. Returns an
 * ascending array of token indices: a new slide starts immediately BEFORE each
 * returned index. Operates on the original token array; since boundaries are
 * only ever inserted (never removed), an index is stable for both consumers.
 */
function headingSplitPoints(tokens) {
  const points = [];
  let slideHasHeading = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // An author-written top-level `---` is a boundary — reset so the next
    // heading is "first of slide" and does not inject a redundant break.
    if (isSlideRule(t)) {
      slideHasHeading = false;
      continue;
    }
    if (t.type === 'heading_open' && t.level === 0 && (t.tag === 'h1' || t.tag === 'h2')) {
      if (slideHasHeading) {
        // Pull the boundary back over this heading's lead-in run (directive
        // comments + an eyebrow paragraph) so it travels onto the new slide.
        let at = i;
        for (;;) {
          const prev = tokens[at - 1];
          if (isCommentToken(prev)) { at -= 1; continue; }
          // eyebrow paragraph = [paragraph_open, inline, paragraph_close]
          if (prev && prev.type === 'paragraph_close' && at >= 3
            && tokens[at - 3].type === 'paragraph_open' && isEyebrowInline(tokens[at - 2])) {
            at -= 3; continue;
          }
          break;
        }
        points.push(at);
      }
      slideHasHeading = true;
    }
  }
  return points;
}

module.exports = { isCommentToken, isEyebrowInline, headingSplitPoints };
