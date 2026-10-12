---
group: Test & verify
---
Time each list-text reader: the frozen regular expression (tools/segno-legacy/list-text.js) against the shipped kernel that walks the generated Segno parser, over the deck/docs corpus and the seeded fuzz from tools/parser-bakeoff/list-text.mjs. Each side runs in its own process so neither inherits the other's JIT state; best of seven rounds, in nanoseconds per input. `--side legacy|shipped` prints one side as JSON. On-demand, not a gate.
