// The pure half of tools/golden-bisect.mjs: which commits to render next, and how a reading
// narrows each golden's window. No git, no renders, so the unit test can pin the search.
//
// A TRACK is one golden being bisected over a list of commits: `{ golden, lo, hi, target }`.
// `lo` is the last index known to render like the OLD golden (-1 means the `from` commit),
// `hi` the first index known to render like the NEW one, and `target` the golden's drift from
// the old PDF at `hi`. The track is done when `hi - lo === 1`: commit `hi` moved it.

/** A drift reading counts as "moved" once it passes half the drift at the window's end.
 *  Half, not "any": a golden that two PRs moved finds the bigger move, and a reading inside
 *  the machine's noise (a few tenths of a percent of a page) never counts on its own.
 *  A page added, removed or resized (-1) always counts. */
export function moved(drift, target) {
  if (drift < 0) return true;
  return drift > 0.5 * target;
}

/** The commit index to render next for every open track, grouped so tracks that share a
 *  window share a render: Map<index, golden[]>. */
export function nextProbes(tracks) {
  const plan = new Map();
  for (const t of tracks) {
    if (t.hi - t.lo <= 1) continue;
    const mid = Math.floor((t.lo + t.hi) / 2);
    if (!plan.has(mid)) plan.set(mid, []);
    plan.get(mid).push(t.golden);
  }
  return plan;
}

/** Narrow one track with the drift read at `index` (its midpoint). Returns a new track. */
export function narrow(track, index, drift) {
  return moved(drift, track.target) ? { ...track, hi: index } : { ...track, lo: index };
}

export const done = (tracks) => tracks.every((t) => t.hi - t.lo <= 1);
