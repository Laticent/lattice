- The agent kit's checker now runs the **linter** as well as the presentation
  reviewer. It shipped with only the second, so an invented `_class` — the single
  most likely mistake a model makes writing a Lattice deck — came back "No
  findings. The checkable half is clean" over a deck that would not render.
  Findings merge, errors first.
- `check.mjs --json` emits one envelope, `{ partial, files: [...] }`, and it
  carries the partial-check flag. The bare array suppressed that flag in exactly
  the mode a machine reads, so a check that skipped half its rules returned `[]`
  and read as clean. It also now accepts several files instead of silently
  ignoring all but the first, reports a missing path or a directory in one line
  rather than a raw stack trace, and identifies itself by real path — a consumer
  wrapper named `check.mjs` used to trigger the CLI and exit the process instead
  of importing.
- `label-title` no longer misses a heading behind a period qualifier. `## Q2
  Results` and `## Q3 Financials` are the deck canon's own worked examples of a
  label heading, and both passed clean: the digit guard fired on the `2` and
  returned before the label check ran.
- A density finding now names the element that is over budget. "A split-compare
  element runs to 19 words" left the reader to count seven candidates by hand. Its
  fix line is also a sentence again — it used to concatenate "Tighten to " with a
  description of the target, yielding "Tighten to a stacked card is a short
  paragraph at most."
