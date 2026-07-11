/**
 * Tier filter for worked exemplar decks — DRY length variants.
 *
 * An exemplar is authored ONCE as the full deck; each slide carries a
 * `<!-- tier: short|standard|full -->` marker naming the *minimum* tier at which
 * it appears. This pure function trims a full deck down to a requested tier, so
 * one authored source yields the short / standard / full variants instead of
 * three hand-maintained decks.
 *
 * The marker is a plain HTML comment: Lattice/Marp parse only `_`-prefixed
 * directives (`_class`, `_header`, …), so `<!-- tier: x -->` is inert to the
 * renderer and simply dropped from the visible output.
 *
 * Pure + fs-free so the CLI, the docs build, and the browser share one
 * implementation (HARD RULE #7's spirit). Verified by
 * test/unit/exemplars/tier-filter.test.js.
 *
 * Design: engineering/decisions/2026-06-14-worked-exemplar-decks.md.
 */

// short ⊂ standard ⊂ full. A slide tagged `short` shows in every tier; a slide
// tagged `full` shows only in full. Keep a slide when slideTier <= requestedTier.
const TIER_ORDER = { short: 0, standard: 1, full: 2 };
const TIERS = ['short', 'standard', 'full'];
const DEFAULT_TIER = 'standard'; // an untagged slide lands in the safe middle

const TIER_RE = /<!--\s*tier:\s*(short|standard|full)\s*-->/i;

/** Is `name` one of the three valid tier names? */
function isTier(name) {
  return Object.hasOwn(TIER_ORDER, name);
}

/**
 * Split a deck into `{ frontmatter, slides }`. Frontmatter is the leading
 * `---\n…\n---` YAML block (Marp's deck config); slides are the `---`-separated
 * regions after it. Returns `frontmatter: ''` when the deck has no leading block.
 */
function splitDeck(source) {
  const text = String(source == null ? '' : source).replace(/\r\n/g, '\n');
  let frontmatter = '';
  let body = text;

  // Leading YAML frontmatter: starts at the very first line `---`, ends at the
  // next standalone `---`. Only recognised at offset 0 (a `---` mid-deck is a
  // slide separator, never frontmatter).
  if (/^---\n/.test(text)) {
    const end = text.indexOf('\n---', 4);
    if (end !== -1) {
      const after = end + '\n---'.length;
      // The fence line must end here (newline or EOF), not be a longer `----`.
      if (text[after] === '\n' || after === text.length) {
        frontmatter = text.slice(0, after);
        body = text.slice(after + 1); // drop the trailing newline after the fence
      }
    }
  }

  // Slides are separated by a line that is exactly `---` (Marp's separator).
  // A whitespace-only body has no slides (e.g. a tier filtered down to nothing).
  const slides = body.trim().length ? body.split(/\n-{3}\n/) : [];
  return { frontmatter, slides };
}

/** The tier marker on a slide, or the default when absent. */
function slideTier(slide) {
  const m = String(slide).match(TIER_RE);
  return m ? m[1].toLowerCase() : DEFAULT_TIER;
}

/**
 * Trim a full exemplar deck to `tier` (`'short' | 'standard' | 'full'`).
 * Keeps every slide whose own tier is at or below the requested tier, preserves
 * the frontmatter verbatim, and strips the now-redundant `<!-- tier: … -->`
 * markers from the emitted deck. Unknown/empty tier falls back to `'standard'`.
 *
 * @param {string} source  the full authored deck markdown
 * @param {string} tier    target tier
 * @returns {string} the filtered deck
 */
function filterToTier(source, tier) {
  const want = isTier(tier) ? tier : DEFAULT_TIER;
  const wantRank = TIER_ORDER[want];
  const { frontmatter, slides } = splitDeck(source);

  const kept = slides
    .filter((slide) => TIER_ORDER[slideTier(slide)] <= wantRank)
    .map((slide) =>
      // Remove the marker (and a stray blank line it may leave behind).
      slide.replace(new RegExp(`${TIER_RE.source}\\n?`, 'i'), '').replace(/\n{3,}/g, '\n\n'),
    );

  const bodyOut = kept.join('\n\n---\n\n');
  if (!frontmatter) return `${bodyOut}\n`;
  return bodyOut ? `${frontmatter}\n\n${bodyOut}\n` : `${frontmatter}\n`;
}

/**
 * Count slides per tier for a full deck — `{ short, standard, full }`, each the
 * cumulative slide count *at* that tier (short ≤ standard ≤ full). This is the
 * light metadata the Drawing Board island ships so the tier chooser can show
 * "Short · 6 · Standard · 12 · Full · 20" without fetching the deck body.
 */
function tierCounts(source) {
  const { slides } = splitDeck(source);
  const ranks = slides.map((s) => TIER_ORDER[slideTier(s)]);
  return {
    short: ranks.filter((r) => r <= TIER_ORDER.short).length,
    standard: ranks.filter((r) => r <= TIER_ORDER.standard).length,
    full: ranks.filter((r) => r <= TIER_ORDER.full).length,
  };
}

module.exports = { filterToTier, tierCounts, splitDeck, slideTier, TIERS, DEFAULT_TIER };
