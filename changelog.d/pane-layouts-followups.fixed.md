- `lint:deck` no longer counts a third pane when a pane's eyebrow pill uses double backticks
  (`` ``a`b`` ``) above its `### title`. The linter now reads a pill the way CommonMark does, so it
  agrees with the engine, and its `pane-title` suggestion sees the pill too.
- `lint:deck` counts the slide's eyebrow, subtitle, Key Insight and note against a pane's budget, as
  the engine does when it sizes the pane. A stacked table that the slide's chrome leaves room for one
  row now gets `pane-overflow`. Before this, the export clipped its second row while the linter
  called the slide clean.
