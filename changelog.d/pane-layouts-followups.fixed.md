- `lint:deck` no longer counts a third pane when a pane's eyebrow pill uses double backticks
  (`` ``a`b`` ``) above its `### title`. The linter now reads a pill the way CommonMark does, so it
  agrees with the engine, and its `pane-title` suggestion sees the pill too.
