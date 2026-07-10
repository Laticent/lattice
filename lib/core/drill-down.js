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
  const groups = new Map();
  for (const it of items) {
    const h = Math.round(it.getBoundingClientRect().height);
    if (!groups.has(h)) groups.set(h, []);
    groups.get(h).push(it);
  }

  const culprits = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue; // nothing to disambiguate against
    const slacks = group.map((it) => ({ it, slack: contentSlack(it) }));
    const sorted = [...slacks].sort((a, b) => a.slack - b.slack);
    const median = sorted[Math.floor(sorted.length / 2)].slack;
    // Both conditions required (owner decision, 2026-07-10: "also require a
    // relative outlier"): an item must be a clear outlier BELOW its
    // row-mates' pack (median * 0.5) AND the gap must exceed simple layout
    // noise (20px) — a uniformly tight-but-correct row (every item
    // genuinely full) flags nothing, rather than guessing which one is
    // "worse". The median item itself can never self-flag: its own
    // `median - slack` is always exactly 0, which fails the >20 gate
    // regardless of sign.
    for (const { it, slack } of slacks) {
      if (slack < median * 0.5 && median - slack > 20) culprits.push(it);
    }
  }
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

module.exports = { contentSlack, findCulprits, componentNameFor };
