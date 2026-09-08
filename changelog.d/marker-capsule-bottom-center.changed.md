- **The overflow and "text too small" markers are now ONE pill, centered against the slide's
  bottom edge.** They used to be two separate flags stacked in the slide's top-right corner,
  where they collided with the status stamp (`confidential`, `wip`, `draft`, …) and the
  author's `logo:` mark. A slide that trips both registers now shows a single capsule with
  two segments — the clip fact in red, the type-floor fact in amber — instead of two pills;
  a slide that trips one shows a single, correctly-rounded pill.
- **What a reader receives is unchanged in kind and better placed.** The type floor is
  author-only (a reader cannot resize a figure), so a delivered deck still shows exactly one
  calm "Content clipped" pill. It now sits below the running footer rather than beside the
  status stamp — frame margin no component writes into.
- **A status stamp and a deck logo no longer displace the marker at all.** None of the
  thirteen `stamp-*` shapes shares a band with the capsule, so none reserves anything. The
  two full-bleed washes (`stamp-mark`, `stamp-veil`) still cover it from the plane above, as
  they always have and deliberately.
- **Removed:** the `--corner-stack` / `--stamp-stack` per-stamp-shape reserves, the
  `--corner-logo-reserve` / `data-logo-corner` machinery that stacked the markers to the left
  of the deck logo, and the `--slide-radius` corner inset on these two berths. Two segments
  in one container cannot collide with each other, and a single centered box has one
  neighbor set to clear instead of four — so the arithmetic that kept them apart is gone
  rather than re-derived. The Fix-Me marker is unaffected: it keeps its bottom-right corner
  and its inset.
- **New contract markup:** `.marker-rail` wraps the two markers as the last children of every
  slide (`lib/core/fit-berth.js`). It is engine-emitted, carries `data-lattice-berth`, and is
  excluded from both overflow probes by name — a marker measured as content is a marker that
  manufactures the overflow it reports.
