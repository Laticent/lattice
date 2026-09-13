- **Fixed: `lint:deck` no longer prints `[undefined]` at the author.** The CLI
  report interpolated a finding's component token unconditionally, so the three
  rules that judge a `_focus` directive rather than a component —
  `focus-spec`, `focus-style`, `focus-steps` — reported
  `⚠ deck.md · slide 1 · focus-spec [undefined]`. The bracket is now omitted
  when a finding carries no token; output for every rule that sets one is
  unchanged.
