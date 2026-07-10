/**
 * drill-down.js — the pure math behind the Fix-Me overlay's item-level
 * drill-down (lib/runtime/index.js). Extracted so the outlier logic is
 * unit-testable with plain fake DOM-like objects (mirroring
 * lib/core/overflow-probe.js's own test pattern), not only verifiable via a
 * real-browser spot-check. See
 * engineering/decisions/2026-07-10-overflow-cause-highlighting.md §10.
 *
 * The problem: a clip-cell's repeated items are often flex row-mates
 * STRETCHED to a common height (align-items:stretch, the flex default) — so
 * every item in that row reports the SAME rendered height and box size alone
 * can't tell the genuine culprit from an innocently-stretched neighbour.
 *
 * The signal that resolves it: each item's own "content slack" — its box
 * height minus how far its own content actually reaches. An item whose
 * content nearly fills the shared height demanded it; a bystander stretched
 * to match it has content that stops well short.
 */

// How far short of its own box `item`'s content falls — 0 (or negative,
// clamped by the caller if needed) means the content reaches or exceeds the
// box. Mirrors overflow-probe.js's flowedSpill in spirit: measure via
// children's own rects, not scrollHeight, which under the default
// `overflow:visible` doesn't reliably report true content extent.
function contentSlack(item) {
  const r = item.getBoundingClientRect();
  let bottom = r.top;
  for (const ch of item.children) {
    const cr = ch.getBoundingClientRect();
    if (cr.bottom > bottom) bottom = cr.bottom;
  }
  return r.bottom - bottom;
}

// The item(s) among `group` that are a genuine low-slack outlier among their
// SAME-HEIGHT row-mates — the within-row test. Exported separately from
// findCulprits so a caller with pre-grouped items (or a test) can drive it
// directly.
function outliersWithinGroup(group) {
  if (group.length < 2) return []; // nothing to disambiguate against
  const slacks = group.map((it) => ({ it, slack: contentSlack(it) }));
  const sorted = [...slacks].sort((a, b) => a.slack - b.slack);
  const median = sorted[Math.floor(sorted.length / 2)].slack;
  // Both conditions required (owner decision, 2026-07-10: "also require a
  // relative outlier"): an item must be a clear outlier BELOW its row-mates'
  // pack (median * 0.5) AND the gap must exceed simple layout noise (20px) —
  // a uniformly tight-but-correct row (every item genuinely full) flags
  // nothing, rather than guessing which one is "worse". The median item
  // itself can never self-flag: its own `median - slack` is always exactly
  // 0, which fails the >20 gate regardless of sign.
  const out = [];
  for (const { it, slack } of slacks) {
    if (slack < median * 0.5 && median - slack > 20) out.push(it);
  }
  return out;
}

// Find the item(s), among `items`, that are a genuine low-slack outlier
// among their SAME-HEIGHT row-mates. Returns [] when there's fewer than 2
// items, no stretched grouping (every item a different height), or no clear
// outlier — the caller falls back to a coarser highlight, never a guess.
function findCulprits(items) {
  if (!items || items.length < 2) return [];

  // Group by rendered height (rounded) — same group = stretched together in
  // the same flex line. Flexbox stretch enforces the target height
  // precisely, so genuinely-stretched siblings report near-identical (often
  // exactly identical) heights; unrelated items land in other groups.
  const groupMap = new Map();
  for (const it of items) {
    const h = Math.round(it.getBoundingClientRect().height);
    if (!groupMap.has(h)) groupMap.set(h, []);
    groupMap.get(h).push(it);
  }
  const groups = [...groupMap.values()].filter((g) => g.length >= 2);
  if (!groups.length) return [];

  // A row (wrapped grid: multiple height-groups exist) can be entirely
  // unrelated to the overflow — comfortably short, just pushed past the
  // clip boundary by an EARLIER row's excess (confirmed on verdict-grid: a
  // 2x2 grid where row 1 overflowed on its own content, and row 2 — two
  // perfectly normal, short cards — got carried past the frame purely by
  // row 1's height. Searching row 2 for "which of its two cards has less
  // slack" found one, even though NEITHER card in that row is oversized;
  // it just happened to be relatively fuller than its row-mate). That's the
  // exact misattribution this whole feature exists to avoid, one level up.
  // So with 2+ rows in play, only search within the row(s) whose OWN height
  // is itself an outlier above its sibling rows — never a row that's simply
  // normal-sized and got dragged along.
  let candidateGroups = groups;
  if (groups.length > 1) {
    const heights = groups.map((g) => g[0].getBoundingClientRect().height);
    // The MINIMUM height across all rows, not a median. A median order
    // statistic can itself land ON an anomalous row once anomalies become a
    // majority of 3+ groups (e.g. heights 150/250/500 — the middle value,
    // 250, is itself moderately oversized, so comparing it against ITSELF
    // as baseline silently clears it, exactly the self-reference trap this
    // gate exists to avoid). The minimum can't have that problem: an
    // overflow-causing anomaly only makes a row TALLER, never shorter, so
    // the shortest row in the collection is always a safe, never-self-
    // referential "normal" baseline — regardless of how many OTHER rows
    // are anomalous.
    const baseline = Math.min(...heights);
    candidateGroups = groups.filter((_, i) => heights[i] > baseline * 1.3 && heights[i] - baseline > 40);
  }

  const culprits = [];
  for (const group of candidateGroups) culprits.push(...outliersWithinGroup(group));
  return culprits;
}

// The FIRST class on `section` that's a key in `catalog` (component name →
// {axis, domSelector}) — deliberately checks every class, not just the
// first token, since universal modifiers (dark/compact/accent/…) can
// precede or follow the component class in authored/generated markup.
function componentNameFor(section, catalog) {
  for (const cls of section.classList) {
    if (catalog[cls]) return cls;
  }
  return null;
}

module.exports = { contentSlack, findCulprits, componentNameFor, outliersWithinGroup };
