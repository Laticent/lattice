- **Breaking: the `list-criteria` component is removed. Write `list takeaway numbered`
  instead.** Both took the same markdown (a numbered item with a nested `- reason`
  bullet), and `list takeaway numbered` already drew the ruled rows and fixed counter.
  `list takeaway` now also stacks a nested bullet as a muted line under a bold lead,
  where it used to set it inline on the lead's line, and `numbered` puts the counter in a
  fixed-size left gutter. The old component sized its number at 55% of the row height, so
  the number changed size as the row count changed (67px of drift in the jank census), and
  it centered the text far from the number. A slide that still says `list-criteria` renders
  as a plain `content` slide (plain numbers, no ruled rows), and `lint:deck` names the replacement. Every in-repo deck is
  migrated.
