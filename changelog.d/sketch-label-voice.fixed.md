- The `sketch` finish now reaches every label on the slide. Counters and card
  number badges, table column heads, BEFORE/AFTER and status chips, stamps,
  captions, chart legend values, gantt/quadrant/radar axis ticks, legal
  citations and the cell-footer page number all render in the hand face instead
  of the machine mono they kept before. 95 label-voice sites had pinned
  `--font-mono` directly, which the finish re-points nothing of — it re-points
  `--font-label`. Measured on the full gallery under `class: sketch`: 301
  mono-rendered text runs before, 72 after, and every survivor is code.
- Fixed the `redline`, `citation-card` and `regulatory-update` eyebrows, whose
  font was named on the parent paragraph but never reached the `<code>` inside
  it — so they had never worn the label voice on any theme. Only visible under
  `sketch`, where they left a machine-faced kicker over hand-drawn content.
- No visual change on any non-sketch theme: `--font-label` defaults to
  `var(--font-mono)` and no theme overrides it, so every swapped site resolves
  to the identical stack. Verified by rendering the 117-slide gallery before and
  after — zero slide-DOM difference, and no new overflow.
- Chart legend values keep their column alignment in the hand face:
  `font-variant-numeric: tabular-nums` does that work, not the font, and
  Shantell Sans ships the `tnum` feature.
- Known gap, unchanged: text inside a rendered Mermaid diagram still uses the
  mono stack under `sketch` — a separate, pre-existing divergence in the
  diagram theme-variable path (`engineering/mermaid.md` §5.3).
