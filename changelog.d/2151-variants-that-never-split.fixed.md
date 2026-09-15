- **Variants that could never split now do.** Two causes, both measured on the components' own
  galleries re-rendered at portrait:
  - A component's declared carousel strategy is one reader, and a variant that renders a
    different DOM got no split at all — the slide was left whole instead of falling through to
    the seam its markup plainly has. A declined strategy now means "this is not my shape", not
    "this slide has no seam": `compare-prose axis` (facet cards, not two panes) and
    `split-panel pullquote` (leads with the quote, no `<h2>`) both paginate now. A page the
    strategy already emitted is still never re-derived, which is what keeps `redline`'s
    reasoning attached to the passage it explains.
  - `list-tabular` rows authored FLAT — a chip and no nested clause — were dropped from the
    member set, so 5 of its 14 variants (`metric`, `register`, `solid`, `outline`, `fit-meta`)
    never split and a MIXED list silently lost its flat rows. A row is a member when it has a
    title; a bodyless one renders without a body span.
- A `list-tabular` row's title keeps its inline markup on a split page. It was flattened, so the
  `<code>` chip that is the register's second column reached the page as bare text.
