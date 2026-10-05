- **Segno can read whole files, not only short spans.** Three additions to the grammar engine:
  `greedy()` marks a loop that takes the longest match; `until("*/")` skips ahead to a fixed
  string of up to 64 characters; and a grammar can raise its nesting cap from 64 to 1,000. Each
  one keeps Segno's guarantee that a parse takes time proportional to its input and never throws.
  Grammars written with them read every CSS, HTML and Markdown file in the repository
  (`npm run parser:bakeoff:languages`). Nothing in a deck changes: Lattice's inline notation
  parser is byte-for-byte identical.
